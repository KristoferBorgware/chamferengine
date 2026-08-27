import type { GpuContext } from "../gpu/GpuContext.js";
import type { Mat4 } from "../../math/Mat4.js";
import { CASCADE_SHADER } from "./CASCADE_SHADER.js";

/** One matrix, which is all a depth-only pass reads. */
const VIEW_BYTES = 64;

/**
 * Where the geometry is, from the camera, before anything is shaded.
 *
 * **A screen-space effect has to run before the light it changes.** Ambient
 * occlusion scales the sky's share of a surface's light, and that share is
 * decided inside the terrain shader while the world is being drawn -- so a
 * pass reading the depth the world pass *wrote* is already too late to change
 * it. This draws the same geometry with no fragment stage at all, which hands
 * {@link Ssao} a depth buffer one pass early.
 *
 * It is the cascades' own shader with the view matrix in place of the light's,
 * because *how far is the nearest surface* is one question however it is
 * asked. What it draws is the caller's business: the caller already worked out
 * which chunks the camera can see, and a second opinion here would be a second
 * chance to disagree.
 *
 * **Its own depth texture, not the one the world pass uses.** Sharing one
 * would let the world pass load these depths rather than clearing them and
 * reject the fragments it is about to overdraw -- which would pay for most of
 * this pass -- but it needs the terrain pipeline's depth test widened to
 * `less-equal`, since it would then be re-drawing depths already exactly
 * there. That is a change to what every existing pixel does, and this is a
 * change to nothing.
 */
export class ScreenDepth {
	private readonly ctx: GpuContext;
	private readonly pipeline: GPURenderPipeline;
	private readonly layout: GPUBindGroupLayout;
	private readonly uniform: GPUBuffer;
	private readonly bindGroup: GPUBindGroup;
	private readonly matrix = new Float32Array(VIEW_BYTES / 4);

	private image: GPUTexture | null = null;
	private imageView: GPUTextureView | null = null;

	constructor(ctx: GpuContext, chunkLayout: GPUBindGroupLayout) {
		this.ctx = ctx;
		const { device } = ctx;
		const module = device.createShaderModule({ code: CASCADE_SHADER });
		this.layout = device.createBindGroupLayout({
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.VERTEX,
					buffer: { type: "uniform" },
				},
			],
		});
		this.uniform = device.createBuffer({
			size: VIEW_BYTES,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		this.bindGroup = device.createBindGroup({
			layout: this.layout,
			entries: [{ binding: 0, resource: { buffer: this.uniform } }],
		});
		this.pipeline = device.createRenderPipeline({
			layout: device.createPipelineLayout({
				bindGroupLayouts: [this.layout, chunkLayout],
			}),
			vertex: {
				module,
				entryPoint: "vertexMain",
				buffers: [
					{
						arrayStride: 24,
						attributes: [
							{
								shaderLocation: 0,
								offset: 0,
								format: "float32x3",
							},
						],
					},
				],
			},
			// **Both sides**, for the reason the cascades give: a chunk mesh
			// is a shell with no underside, so culling by facing drops exactly
			// the faces whose own depth this is recording.
			primitive: { topology: "triangle-list", cullMode: "none" },
			depthStencil: {
				format: "depth32float",
				depthWriteEnabled: true,
				depthCompare: "less",
			},
		});
	}

	/** The depths this pass last wrote, for a screen-space pass to read. */
	get view(): GPUTextureView | null {
		return this.imageView;
	}

	/**
	 * Draw the camera's depth.
	 *
	 * `fill` is handed a pass with the view matrix bound at group 0 and the
	 * depth-only pipeline set. It binds each chunk at group 1 and draws, the
	 * same way it would into a cascade.
	 */
	render(
		encoder: GPUCommandEncoder,
		viewProj: Mat4,
		width: number,
		height: number,
		fill: (pass: GPURenderPassEncoder) => void,
	): void {
		this.resize(width, height);
		this.matrix.set(viewProj.elements);
		this.ctx.device.queue.writeBuffer(this.uniform, 0, this.matrix);
		const pass = encoder.beginRenderPass({
			colorAttachments: [],
			depthStencilAttachment: {
				view: this.imageView!,
				depthClearValue: 1,
				depthLoadOp: "clear",
				depthStoreOp: "store",
			},
		});
		pass.setPipeline(this.pipeline);
		pass.setBindGroup(0, this.bindGroup);
		fill(pass);
		pass.end();
	}

	destroy(): void {
		this.image?.destroy();
		this.uniform.destroy();
	}

	private resize(width: number, height: number): void {
		if (
			this.image &&
			this.image.width === width &&
			this.image.height === height
		)
			return;
		this.image?.destroy();
		this.image = this.ctx.device.createTexture({
			size: { width, height },
			format: "depth32float",
			usage:
				GPUTextureUsage.RENDER_ATTACHMENT |
				GPUTextureUsage.TEXTURE_BINDING,
		});
		this.imageView = this.image.createView();
	}
}
