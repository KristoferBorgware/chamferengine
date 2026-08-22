import type { GpuContext } from "../gpu/GpuContext.js";
import { TONE_SHADER } from "./TONE_SHADER.js";

/** The exposure, the knee, and two spare. */
const TONE_BYTES = 16;

/**
 * Where the roll-off toward white starts.
 *
 * Everything under it is left exactly as it is, so the great majority of a
 * frame passes through this pass unchanged and only what the exposure pushed
 * near white is bent. High, because the curve costs the whites something
 * wherever it starts: at 0.85 a surface at exactly white comes out at 0.925
 * and one at three times white at 0.990, so a cloud stays a cloud and the sun
 * on snow keeps its shape instead of clipping to a flat patch.
 */
const KNEE = 0.85;

/**
 * Where a value over white is decided, which is the whole of what one pixel
 * of sun on snow looks like.
 *
 * Everything is drawn into a floating-point image first, so the sun and the
 * sky and the moon can be added together without anything being lost to the
 * top of the range on the way. This pass is what turns that image into
 * something a screen can show: multiply by an exposure, bend what is over the
 * knee toward 1, and write it out.
 *
 * The scene image is the size of the canvas and read one texel per pixel, so
 * there is no sampler and nothing is filtered.
 */
export class TonePass {
	private readonly ctx: GpuContext;
	private readonly pipeline: GPURenderPipeline;
	private readonly layout: GPUBindGroupLayout;
	private readonly uniform: GPUBuffer;
	private readonly data = new Float32Array(TONE_BYTES / 4);

	private scene: GPUTexture | null = null;
	private view: GPUTextureView | null = null;
	private bindGroup: GPUBindGroup | null = null;

	constructor(ctx: GpuContext) {
		this.ctx = ctx;
		const { device, format } = ctx;
		const module = device.createShaderModule({ code: TONE_SHADER });
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
			],
		});
		this.uniform = device.createBuffer({
			size: TONE_BYTES,
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

	/** The image everything is drawn into, matched to the canvas. */
	target(width: number, height: number): GPUTextureView {
		if (
			!this.scene ||
			this.scene.width !== width ||
			this.scene.height !== height
		) {
			this.scene?.destroy();
			this.scene = this.ctx.device.createTexture({
				size: { width, height },
				// Half floats: a value over white has to survive being written
				// down, and a byte per channel has nowhere to put one.
				format: "rgba16float",
				usage:
					GPUTextureUsage.RENDER_ATTACHMENT |
					GPUTextureUsage.TEXTURE_BINDING,
			});
			this.view = this.scene.createView();
			this.bindGroup = this.ctx.device.createBindGroup({
				layout: this.layout,
				entries: [
					{ binding: 0, resource: { buffer: this.uniform } },
					{ binding: 1, resource: this.view },
				],
			});
		}
		return this.view!;
	}

	/** Draw the scene onto the canvas, exposed and rolled off. */
	resolve(
		encoder: GPUCommandEncoder,
		canvas: GPUTextureView,
		exposure: number,
	): void {
		if (!this.bindGroup) return;
		this.data[0] = Math.max(0, exposure);
		this.data[1] = KNEE;
		this.ctx.device.queue.writeBuffer(this.uniform, 0, this.data);

		const pass = encoder.beginRenderPass({
			colorAttachments: [
				{
					view: canvas,
					loadOp: "clear",
					clearValue: { r: 0, g: 0, b: 0, a: 1 },
					storeOp: "store",
				},
			],
		});
		pass.setPipeline(this.pipeline);
		pass.setBindGroup(0, this.bindGroup);
		pass.draw(3);
		pass.end();
	}

	destroy(): void {
		this.scene?.destroy();
		this.uniform.destroy();
	}
}
