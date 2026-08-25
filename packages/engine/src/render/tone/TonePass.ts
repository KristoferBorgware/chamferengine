import type { GpuContext } from "../gpu/GpuContext.js";
import { TONE_SHADER } from "./TONE_SHADER.js";

/** The exposure, the supersample scale, and two spare. */
const TONE_BYTES = 16;

/**
 * Where a value over white is decided, which is the whole of what one pixel
 * of sun on snow looks like.
 *
 * Everything is drawn into a floating-point image first, so the sun and the
 * sky and the moon can be added together without anything being lost to the
 * top of the range on the way. This pass is what turns that image into
 * something a screen can show: multiply by an exposure and run the ACES
 * filmic curve, which bends everything over white toward it rather than
 * clipping to a flat patch.
 *
 * **This is also where supersampling lands.** The world can be drawn into an
 * image larger than the canvas; this pass is the one that has to put it back,
 * so it averages the block of source texels each output pixel covers. At a
 * scale of 1 that block is one texel and the read is exact, with no filtering
 * of any kind -- so nothing is softened by a feature nobody turned on.
 */
export class TonePass {
	private readonly ctx: GpuContext;
	private readonly pipeline: GPURenderPipeline;
	private readonly layout: GPUBindGroupLayout;
	private readonly uniform: GPUBuffer;
	private readonly sampler: GPUSampler;
	private readonly data = new Float32Array(TONE_BYTES / 4);

	private bindGroup: GPUBindGroup | null = null;
	private bound: GPUTextureView | null = null;

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
					texture: { sampleType: "float" },
				},
				{
					binding: 2,
					visibility: GPUShaderStage.FRAGMENT,
					sampler: { type: "filtering" },
				},
			],
		});
		// Only the downsample reads through this. At a scale of 1 the shader
		// takes the `textureLoad` path and the sampler is never touched.
		this.sampler = device.createSampler({
			magFilter: "linear",
			minFilter: "linear",
			addressModeU: "clamp-to-edge",
			addressModeV: "clamp-to-edge",
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

	/** Draw an image onto the canvas, exposed and rolled off. */
	resolve(
		encoder: GPUCommandEncoder,
		canvas: GPUTextureView,
		exposure: number,
		source: GPUTextureView,
		superSample = 1,
	): void {
		// The image is handed in rather than owned, because what reaches the
		// tone curve is the frame **after** the air in front of it, and the
		// pass that marches the air is the one that owns both images.
		if (this.bound !== source) {
			this.bound = source;
			this.bindGroup = this.ctx.device.createBindGroup({
				layout: this.layout,
				entries: [
					{ binding: 0, resource: { buffer: this.uniform } },
					{ binding: 1, resource: source },
					{ binding: 2, resource: this.sampler },
				],
			});
		}
		this.data[0] = Math.max(0, exposure);
		this.data[1] = Math.max(1, superSample);
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
		this.uniform.destroy();
	}
}
