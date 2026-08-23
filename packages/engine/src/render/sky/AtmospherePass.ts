import type { GpuContext } from "../gpu/GpuContext.js";
import type { Mat4 } from "../../math/Mat4.js";
import type { PlanetAtmosphere } from "../../sky/ATMOSPHERE.js";
import { ATMOSPHERE_SHADER } from "./ATMOSPHERE_SHADER.js";

/** The matrix, the eye, the sun, the shape, the coefficients, the march. */
const AIR_BYTES = 64 + 16 * 5;

/**
 * The air, marched over the finished frame.
 *
 * It owns the two images either side of itself: the world is drawn into
 * {@link AtmospherePass.sceneTarget}, this pass reads that and the depth beside
 * it, and what comes out of {@link AtmospherePass.view} is what the tone curve
 * is applied to. Both are half-float, because the sun on the limb is brighter
 * than white and has to survive being written down twice on its way out.
 *
 * **The depth is why this is a pass and not a layer.** A layer draws inside the
 * frame's own render pass, where the depth buffer is an attachment and cannot
 * also be read; the air has to know how far away every pixel's surface is, so
 * it runs after that pass ends and reads the depth as a texture.
 *
 * With the air switched off it still runs, and copies. That costs one
 * full-screen pass and keeps the frame one shape rather than two.
 */
export class AtmospherePass {
	private readonly ctx: GpuContext;
	private readonly pipeline: GPURenderPipeline;
	private readonly layout: GPUBindGroupLayout;
	private readonly uniform: GPUBuffer;
	private readonly data = new Float32Array(AIR_BYTES / 4);

	private sceneImage: GPUTexture | null = null;
	private sceneView: GPUTextureView | null = null;
	private litImage: GPUTexture | null = null;
	private litView: GPUTextureView | null = null;
	private bindGroup: GPUBindGroup | null = null;
	private boundDepth: GPUTextureView | null = null;

	/** How bright the scattered light is, and whether there is any air. */
	brightness = 45;

	/** Steps along the view ray, and along each sample's ray to the sun. */
	viewSteps = 16;
	sunSteps = 4;

	constructor(ctx: GpuContext) {
		this.ctx = ctx;
		const { device, sceneFormat: format } = ctx;
		const module = device.createShaderModule({ code: ATMOSPHERE_SHADER });
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
					texture: { sampleType: "unfilterable-float" },
				},
				{
					binding: 2,
					visibility: GPUShaderStage.FRAGMENT,
					texture: { sampleType: "depth" },
				},
			],
		});
		this.uniform = device.createBuffer({
			size: AIR_BYTES,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		this.pipeline = device.createRenderPipeline({
			layout: device.createPipelineLayout({
				bindGroupLayouts: [this.layout],
			}),
			vertex: { module, entryPoint: "vertexMain" },
			fragment: {
				module,
				entryPoint: "fragmentMain",
				targets: [{ format }],
			},
			primitive: { topology: "triangle-list" },
		});
	}

	/** Where the world is drawn, matched to the canvas. */
	sceneTarget(width: number, height: number): GPUTextureView {
		this.resize(width, height);
		return this.sceneView!;
	}

	/** What the world looks like through the air, for the tone curve to read. */
	get view(): GPUTextureView {
		return this.litView!;
	}

	/**
	 * Draw the frame again with the air in front of it.
	 *
	 * `depth` is the buffer the world pass just wrote, and it is what tells
	 * each pixel how much air stands between the eye and whatever it is
	 * looking at. `air` being null is a world with no atmosphere, which still
	 * runs so the frame keeps one shape.
	 */
	resolve(
		encoder: GPUCommandEncoder,
		depth: GPUTextureView,
		eye: readonly [number, number, number],
		sun: readonly [number, number, number],
		inverseViewProj: Mat4,
		air: PlanetAtmosphere | null,
	): void {
		if (!this.sceneView || !this.litView) return;
		if (this.boundDepth !== depth) this.rebind(depth);

		this.data.set(inverseViewProj.elements, 0);
		this.data.set([eye[0], eye[1], eye[2], air ? 1 : 0], 16);
		this.data.set([sun[0], sun[1], sun[2], this.brightness], 20);
		if (air) {
			this.data.set(
				[
					air.planetRadius,
					air.topRadius,
					air.rayleighScaleHeight,
					air.mieScaleHeight,
				],
				24,
			);
			this.data.set(
				[air.rayleigh[0], air.rayleigh[1], air.rayleigh[2], air.mie],
				28,
			);
			this.data.set(
				[
					air.mieDirection,
					Math.max(2, Math.round(this.viewSteps)),
					Math.max(1, Math.round(this.sunSteps)),
					0,
				],
				32,
			);
		}
		this.ctx.device.queue.writeBuffer(this.uniform, 0, this.data);

		const pass = encoder.beginRenderPass({
			colorAttachments: [
				{
					view: this.litView,
					loadOp: "clear",
					clearValue: { r: 0, g: 0, b: 0, a: 1 },
					storeOp: "store",
				},
			],
		});
		pass.setPipeline(this.pipeline);
		pass.setBindGroup(0, this.bindGroup!);
		pass.draw(3);
		pass.end();
	}

	destroy(): void {
		this.sceneImage?.destroy();
		this.litImage?.destroy();
		this.uniform.destroy();
	}

	private resize(width: number, height: number): void {
		if (
			this.sceneImage &&
			this.sceneImage.width === width &&
			this.sceneImage.height === height
		)
			return;
		const { device, sceneFormat: format } = this.ctx;
		this.sceneImage?.destroy();
		this.litImage?.destroy();
		const usage =
			GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
		this.sceneImage = device.createTexture({
			size: { width, height },
			format,
			usage,
		});
		this.litImage = device.createTexture({
			size: { width, height },
			format,
			usage,
		});
		this.sceneView = this.sceneImage.createView();
		this.litView = this.litImage.createView();
		this.boundDepth = null;
	}

	private rebind(depth: GPUTextureView): void {
		this.boundDepth = depth;
		this.bindGroup = this.ctx.device.createBindGroup({
			layout: this.layout,
			entries: [
				{ binding: 0, resource: { buffer: this.uniform } },
				{ binding: 1, resource: this.sceneView! },
				{ binding: 2, resource: depth },
			],
		});
	}
}
