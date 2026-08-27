import type { GpuContext } from "../gpu/GpuContext.js";
import type { Mat4 } from "../../math/Mat4.js";
import { SCREEN_AMBIENT_SHADER } from "./SCREEN_AMBIENT_SHADER.js";

/** Two matrices, the eye and its reach, and four dials. */
const AMBIENT_BYTES = 64 + 64 + 16 + 16;

/**
 * How much sky each pixel can see, as a single-channel image.
 *
 * The pass runs between {@link ScreenDepth} and the world pass, so what it
 * writes is ready for the terrain shader to read while it is deciding a
 * surface's light. See {@link SCREEN_AMBIENT_SHADER} for what it computes and
 * why it may only touch the ambient share.
 *
 * **Two pipelines and two images, because a few samples a pixel are noisy.**
 * The first writes raw occlusion, the second blurs it without crossing a
 * depth step. Both are `r8unorm`: occlusion is a fraction, and a byte
 * resolves it more finely than the blur that follows can preserve.
 */
export class ScreenAmbient {
	private readonly ctx: GpuContext;
	private readonly occlusionPipeline: GPURenderPipeline;
	private readonly blurPipeline: GPURenderPipeline;
	private readonly layout: GPUBindGroupLayout;
	private readonly uniform: GPUBuffer;
	private readonly data = new Float32Array(AMBIENT_BYTES / 4);

	private rawImage: GPUTexture | null = null;
	private rawView: GPUTextureView | null = null;
	private blurImage: GPUTexture | null = null;
	private blurView: GPUTextureView | null = null;
	private flatImage: GPUTexture;
	private flatView: GPUTextureView;

	private occlusionBind: GPUBindGroup | null = null;
	private blurBind: GPUBindGroup | null = null;
	private boundDepth: GPUTextureView | null = null;

	/** How far over a surface the hemisphere reaches, in metres. */
	reach = 1.6;

	/** How much of the sky a fully blocked pixel loses. */
	strength = 0.9;

	/**
	 * How far in front a surface must stand before it counts, in metres.
	 *
	 * Without it a surface occludes itself: the reconstructed position and
	 * the sampled one are the same point to within a rounding, so half the
	 * samples read as blocked and flat ground comes out grey.
	 */
	bias = 0.05;

	/** Directions tried per pixel. */
	samples = 12;

	/** Half the width of the blur window, in pixels. */
	blur = 2;

	constructor(ctx: GpuContext) {
		this.ctx = ctx;
		const { device } = ctx;
		const module = device.createShaderModule({
			code: SCREEN_AMBIENT_SHADER,
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
			],
		});
		this.uniform = device.createBuffer({
			size: AMBIENT_BYTES,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		const shape = {
			layout: device.createPipelineLayout({
				bindGroupLayouts: [this.layout],
			}),
			vertex: { module, entryPoint: "vertexMain" },
			primitive: { topology: "triangle-list" as const },
		};
		this.occlusionPipeline = device.createRenderPipeline({
			...shape,
			fragment: {
				module,
				entryPoint: "occlusionMain",
				targets: [{ format: "r8unorm" as const }],
			},
		});
		this.blurPipeline = device.createRenderPipeline({
			...shape,
			fragment: {
				module,
				entryPoint: "blurMain",
				targets: [{ format: "r8unorm" as const }],
			},
		});
		// **What the world reads when this is switched off.** The terrain
		// shader multiplies its ambient by whatever is bound here, so with the
		// effect off it has to be handed a 1 rather than left unbound -- a
		// pipeline missing a binding is refused, and the whole frame with it.
		this.flatImage = device.createTexture({
			size: { width: 1, height: 1 },
			format: "r8unorm",
			usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
		});
		device.queue.writeTexture(
			{ texture: this.flatImage },
			new Uint8Array([255]),
			{ bytesPerRow: 256 },
			{ width: 1, height: 1 },
		);
		this.flatView = this.flatImage.createView();
	}

	/** One texel of pure openness, for a frame with the effect switched off. */
	get openView(): GPUTextureView {
		return this.flatView;
	}

	/** The blurred occlusion, or the flat texel if nothing has been drawn. */
	get view(): GPUTextureView {
		return this.blurView ?? this.flatView;
	}

	/** Compute occlusion from a depth buffer, then blur it. */
	resolve(
		encoder: GPUCommandEncoder,
		depth: GPUTextureView,
		width: number,
		height: number,
		eye: readonly [number, number, number],
		viewProj: Mat4,
		inverseViewProj: Mat4,
	): void {
		this.resize(width, height);
		if (this.boundDepth !== depth) this.rebind(depth);

		this.data.set(inverseViewProj.elements, 0);
		this.data.set(viewProj.elements, 16);
		this.data.set([eye[0], eye[1], eye[2], Math.max(0.01, this.reach)], 32);
		this.data.set(
			[
				Math.max(0, this.strength),
				Math.max(0, this.bias),
				Math.max(1, Math.round(this.samples)),
				Math.max(0, Math.round(this.blur)),
			],
			36,
		);
		this.ctx.device.queue.writeBuffer(this.uniform, 0, this.data);

		this.run(
			encoder,
			this.occlusionPipeline,
			this.occlusionBind!,
			this.rawView!,
		);
		this.run(encoder, this.blurPipeline, this.blurBind!, this.blurView!);
	}

	destroy(): void {
		this.rawImage?.destroy();
		this.blurImage?.destroy();
		this.flatImage.destroy();
		this.uniform.destroy();
	}

	private run(
		encoder: GPUCommandEncoder,
		pipeline: GPURenderPipeline,
		bindGroup: GPUBindGroup,
		target: GPUTextureView,
	): void {
		const pass = encoder.beginRenderPass({
			colorAttachments: [
				{
					view: target,
					loadOp: "clear",
					clearValue: { r: 1, g: 1, b: 1, a: 1 },
					storeOp: "store",
				},
			],
		});
		pass.setPipeline(pipeline);
		pass.setBindGroup(0, bindGroup);
		pass.draw(3);
		pass.end();
	}

	/**
	 * The two bind groups differ only in which image the second slot reads.
	 *
	 * The occlusion pass never touches it -- it is there because one layout
	 * serves both pipelines -- and the blur pass reads what the occlusion
	 * pass just wrote.
	 */
	private rebind(depth: GPUTextureView): void {
		const { device } = this.ctx;
		this.boundDepth = depth;
		this.occlusionBind = device.createBindGroup({
			layout: this.layout,
			entries: [
				{ binding: 0, resource: { buffer: this.uniform } },
				{ binding: 1, resource: depth },
				{ binding: 2, resource: this.flatView },
			],
		});
		this.blurBind = device.createBindGroup({
			layout: this.layout,
			entries: [
				{ binding: 0, resource: { buffer: this.uniform } },
				{ binding: 1, resource: depth },
				{ binding: 2, resource: this.rawView! },
			],
		});
	}

	private resize(width: number, height: number): void {
		if (
			this.rawImage &&
			this.rawImage.width === width &&
			this.rawImage.height === height
		)
			return;
		this.rawImage?.destroy();
		this.blurImage?.destroy();
		const usage =
			GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
		this.rawImage = this.ctx.device.createTexture({
			size: { width, height },
			format: "r8unorm",
			usage,
		});
		this.blurImage = this.ctx.device.createTexture({
			size: { width, height },
			format: "r8unorm",
			usage,
		});
		this.rawView = this.rawImage.createView();
		this.blurView = this.blurImage.createView();
		// The raw image is new, so the blur's own bind group points at one
		// that no longer exists.
		this.boundDepth = null;
	}
}
