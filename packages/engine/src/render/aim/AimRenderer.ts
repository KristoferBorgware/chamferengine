import type { AimTarget } from "./AimTarget.js";
import type { Frame } from "../Frame.js";
import type { GpuContext } from "../gpu/GpuContext.js";
import type { PassLayer } from "../PassLayer.js";
import { MARKER_SHADER } from "../marker/MARKER_SHADER.js";
import { MARKER_STRIDE } from "../marker/markerGeometry.js";
import { aimGeometry } from "./aimGeometry.js";

/**
 * Draws the cell a click would act on, as a wire prism over the ground.
 *
 * Lines rather than a solid, so the block under it stays visible -- the outline
 * is there to say where, not to cover it. The color is baked into the vertices
 * and no light reaches it, so it reads the same at noon and at midnight.
 *
 * **Depth-tested and not depth-writing.** Tested, so an outline behind a hill
 * is behind it; not writing, so the lines leave the depth buffer as the terrain
 * left it and nothing drawn afterwards is cut against a one-pixel wire.
 *
 * Set {@link AimRenderer.target} to draw one and `null` to stop.
 */
export class AimRenderer implements PassLayer {
	private readonly ctx: GpuContext;
	private readonly pipeline: GPURenderPipeline;
	private buffer: GPUBuffer | null = null;
	private count = 0;
	private drawn: AimTarget | null = null;

	/** The cell to outline, or `null` for none. */
	target: AimTarget | null = null;

	constructor(ctx: GpuContext) {
		this.ctx = ctx;
		const { device, sceneFormat: format } = ctx;
		const frameLayout = device.createBindGroupLayout({
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
					buffer: { type: "uniform" },
				},
			],
		});
		const module = device.createShaderModule({ code: MARKER_SHADER });
		this.pipeline = device.createRenderPipeline({
			layout: device.createPipelineLayout({
				bindGroupLayouts: [frameLayout],
			}),
			vertex: {
				module,
				entryPoint: "vertexMain",
				buffers: [
					{
						arrayStride: MARKER_STRIDE * 4,
						attributes: [
							{ shaderLocation: 0, offset: 0, format: "float32x3" },
							{ shaderLocation: 1, offset: 12, format: "float32x3" },
						],
					},
				],
			},
			fragment: {
				module,
				entryPoint: "fragmentMain",
				targets: [{ format }],
			},
			depthStencil: {
				format: "depth24plus",
				depthWriteEnabled: false,
				depthCompare: "less",
			},
			primitive: { topology: "line-list" },
		});
	}

	after(pass: GPURenderPassEncoder, frame: Frame): void {
		if (!this.target) return;
		if (this.target !== this.drawn) this.upload(this.target);
		if (!this.buffer) return;
		pass.setPipeline(this.pipeline);
		pass.setVertexBuffer(0, this.buffer);
		pass.draw(this.count);
		void frame;
	}

	destroy(): void {
		this.buffer?.destroy();
		this.buffer = null;
		this.drawn = null;
	}

	private upload(target: AimTarget): void {
		const data = aimGeometry(target);
		if (!this.buffer || this.buffer.size < data.byteLength) {
			this.buffer?.destroy();
			this.buffer = this.ctx.device.createBuffer({
				size: data.byteLength,
				usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
			});
		}
		this.ctx.device.queue.writeBuffer(this.buffer, 0, data);
		this.count = data.length / MARKER_STRIDE;
		this.drawn = target;
	}
}
