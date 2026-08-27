import type { GpuContext } from "../gpu/GpuContext.js";
import type { Mat4 } from "../../math/Mat4.js";
import { SSGI_SHADER } from "./SSGI_SHADER.js";

/** Two matrices, the eye and its reach, four dials, and the blur's limit. */
const BOUNCE_BYTES = 64 + 64 + 16 + 16 + 16;

/**
 * One bounce of light from surface to surface, gathered off the frame.
 *
 * Runs after the world pass and before the air, because what it gathers is
 * the lit colour that pass just wrote. See {@link SSGI_SHADER} for
 * what it computes, and for the limit it inherits from working in screen
 * space at all.
 *
 * **Three pipelines: gather, blur, add.** The first two write half-float
 * images of their own -- a bounce off a sunlit slope is brighter than white
 * and has to survive being written down. The third blends onto the scene,
 * because a pass cannot read the image it draws into and there is nothing it
 * needs from that image anyway: light adds.
 */
export class Ssgi {
	private readonly ctx: GpuContext;
	private readonly gatherPipeline: GPURenderPipeline;
	private readonly blurPipeline: GPURenderPipeline;
	private readonly addPipeline: GPURenderPipeline;
	private readonly layout: GPUBindGroupLayout;
	private readonly uniform: GPUBuffer;
	private readonly data = new Float32Array(BOUNCE_BYTES / 4);
	private readonly emptyView: GPUTextureView;
	private readonly empty: GPUTexture;

	private gatherImage: GPUTexture | null = null;
	private gatherView: GPUTextureView | null = null;
	private blurImage: GPUTexture | null = null;
	private blurView: GPUTextureView | null = null;

	private gatherBind: GPUBindGroup | null = null;
	private blurBind: GPUBindGroup | null = null;
	private addBind: GPUBindGroup | null = null;
	private boundDepth: GPUTextureView | null = null;
	private boundScene: GPUTextureView | null = null;

	/** How far a bounce carries across the screen, in pixels. */
	reach = 48;

	/** How much of the gathered light is added. */
	strength = 1;

	/** Directions tried per pixel. */
	samples = 16;

	/** Half the width of the blur window, in pixels. */
	blur = 2;

	/**
	 * How far a bounce may carry in metres, whatever it spans on screen.
	 *
	 * The reach above is in pixels, so a few of them cover centimetres
	 * underfoot and hundreds of metres at the horizon. Without this a distant
	 * hillside lights the ground at your feet.
	 */
	carry = 24;

	/**
	 * How far apart two pixels may be, in metres, and still be blurred
	 * together.
	 */
	blurApart = 1.5;

	constructor(ctx: GpuContext) {
		this.ctx = ctx;
		const { device, sceneFormat } = ctx;
		const module = device.createShaderModule({
			code: SSGI_SHADER,
		});
		this.layout = device.createBindGroupLayout({
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.FRAGMENT,
					buffer: { type: "uniform" },
				},
				{
					binding: 1,
					visibility: GPUShaderStage.FRAGMENT,
					texture: { sampleType: "depth" },
				},
				{
					binding: 2,
					visibility: GPUShaderStage.FRAGMENT,
					texture: { sampleType: "unfilterable-float" },
				},
				{
					binding: 3,
					visibility: GPUShaderStage.FRAGMENT,
					texture: { sampleType: "unfilterable-float" },
				},
			],
		});
		this.uniform = device.createBuffer({
			size: BOUNCE_BYTES,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		const shape = {
			layout: device.createPipelineLayout({
				bindGroupLayouts: [this.layout],
			}),
			vertex: { module, entryPoint: "vertexMain" },
			primitive: { topology: "triangle-list" as const },
		};
		this.gatherPipeline = device.createRenderPipeline({
			...shape,
			fragment: {
				module,
				entryPoint: "gatherMain",
				targets: [{ format: "rgba16float" as const }],
			},
		});
		this.blurPipeline = device.createRenderPipeline({
			...shape,
			fragment: {
				module,
				entryPoint: "blurMain",
				targets: [{ format: "rgba16float" as const }],
			},
		});
		this.addPipeline = device.createRenderPipeline({
			...shape,
			fragment: {
				module,
				entryPoint: "addMain",
				targets: [
					{
						format: sceneFormat,
						// Colour adds; alpha is the scene's own coverage and
						// is kept exactly as the world pass left it.
						blend: {
							color: { srcFactor: "one", dstFactor: "one" },
							alpha: { srcFactor: "zero", dstFactor: "one" },
						},
					},
				],
			},
		});
		// Stands in wherever a pipeline declares a texture it never reads --
		// the add pass must not have the scene bound, since it is drawing
		// into it.
		this.empty = device.createTexture({
			size: { width: 1, height: 1 },
			format: "rgba16float",
			usage: GPUTextureUsage.TEXTURE_BINDING,
		});
		this.emptyView = this.empty.createView();
	}

	/**
	 * Gather a bounce off the frame, blur it, and add it back.
	 *
	 * `scene` is what the world pass drew and `target` is the same image --
	 * they are separated so the add pass can bind a dummy in place of the one
	 * it is writing to.
	 */
	resolve(
		encoder: GPUCommandEncoder,
		depth: GPUTextureView,
		scene: GPUTextureView,
		width: number,
		height: number,
		eye: readonly [number, number, number],
		viewProj: Mat4,
		inverseViewProj: Mat4,
	): void {
		this.resize(width, height);
		if (this.boundDepth !== depth || this.boundScene !== scene)
			this.rebind(depth, scene);

		this.data.set(inverseViewProj.elements, 0);
		this.data.set(viewProj.elements, 16);
		this.data.set([eye[0], eye[1], eye[2], Math.max(1, this.reach)], 32);
		this.data.set(
			[
				Math.max(0, this.strength),
				Math.max(1, Math.round(this.samples)),
				Math.max(0, Math.round(this.blur)),
				0,
			],
			36,
		);
		this.data.set(
			[Math.max(0, this.blurApart), Math.max(0.01, this.carry), 0, 0],
			40,
		);
		this.ctx.device.queue.writeBuffer(this.uniform, 0, this.data);

		this.run(
			encoder,
			this.gatherPipeline,
			this.gatherBind!,
			this.gatherView!,
			true,
		);
		this.run(
			encoder,
			this.blurPipeline,
			this.blurBind!,
			this.blurView!,
			true,
		);
		this.run(encoder, this.addPipeline, this.addBind!, scene, false);
	}

	destroy(): void {
		this.gatherImage?.destroy();
		this.blurImage?.destroy();
		this.empty.destroy();
		this.uniform.destroy();
	}

	private run(
		encoder: GPUCommandEncoder,
		pipeline: GPURenderPipeline,
		bindGroup: GPUBindGroup,
		target: GPUTextureView,
		clear: boolean,
	): void {
		const pass = encoder.beginRenderPass({
			colorAttachments: [
				{
					view: target,
					// The add pass keeps what the world drew and blends onto
					// it; the other two own their images outright.
					loadOp: clear ? "clear" : "load",
					clearValue: { r: 0, g: 0, b: 0, a: 1 },
					storeOp: "store",
				},
			],
		});
		pass.setPipeline(pipeline);
		pass.setBindGroup(0, bindGroup);
		pass.draw(3);
		pass.end();
	}

	private rebind(depth: GPUTextureView, scene: GPUTextureView): void {
		const { device } = this.ctx;
		this.boundDepth = depth;
		this.boundScene = scene;
		const bind = (
			sceneSlot: GPUTextureView,
			gatheredSlot: GPUTextureView,
		): GPUBindGroup =>
			device.createBindGroup({
				layout: this.layout,
				entries: [
					{ binding: 0, resource: { buffer: this.uniform } },
					{ binding: 1, resource: depth },
					{ binding: 2, resource: sceneSlot },
					{ binding: 3, resource: gatheredSlot },
				],
			});
		this.gatherBind = bind(scene, this.emptyView);
		this.blurBind = bind(this.emptyView, this.gatherView!);
		this.addBind = bind(this.emptyView, this.blurView!);
	}

	private resize(width: number, height: number): void {
		if (
			this.gatherImage &&
			this.gatherImage.width === width &&
			this.gatherImage.height === height
		)
			return;
		this.gatherImage?.destroy();
		this.blurImage?.destroy();
		const usage =
			GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
		this.gatherImage = this.ctx.device.createTexture({
			size: { width, height },
			format: "rgba16float",
			usage,
		});
		this.blurImage = this.ctx.device.createTexture({
			size: { width, height },
			format: "rgba16float",
			usage,
		});
		this.gatherView = this.gatherImage.createView();
		this.blurView = this.blurImage.createView();
		// Both images are new, so every bind group points at ones that are
		// gone.
		this.boundDepth = null;
	}
}
