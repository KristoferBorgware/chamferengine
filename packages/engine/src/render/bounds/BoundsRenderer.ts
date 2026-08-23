import type { BoundsBox } from "./BoundsBox.js";
import type { Frame } from "../Frame.js";
import type { GpuContext } from "../gpu/GpuContext.js";
import type { PassLayer } from "../PassLayer.js";
import { MARKER_SHADER } from "../marker/MARKER_SHADER.js";
import { MARKER_STRIDE } from "../marker/markerGeometry.js";
import { boundsGeometry } from "./boundsGeometry.js";

/**
 * Draws the volumes a chunk is tested against, as wire boxes over the world.
 *
 * Two different boxes decide whether a chunk reaches the screen -- the one the
 * selection tests before asking for a chunk, and the one the renderer tests
 * before drawing a resident one -- and neither is visible from the camera that
 * decides them. A selection refusing too much looks from there exactly like one
 * that does not.
 *
 * **Depth-tested and not depth-writing.** Tested, so a box behind a hill reads
 * as behind it; not writing, so a one-pixel ring leaves the depth buffer as the
 * terrain left it.
 *
 * Set {@link BoundsRenderer.boxes} to draw and an empty list to stop.
 */
export class BoundsRenderer implements PassLayer {
	private readonly ctx: GpuContext;
	private readonly pipeline: GPURenderPipeline;
	private buffer: GPUBuffer | null = null;
	private count = 0;
	private drawn: readonly BoundsBox[] | null = null;

	/** The boxes to draw. */
	boxes: readonly BoundsBox[] = [];

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
							{
								shaderLocation: 0,
								offset: 0,
								format: "float32x3",
							},
							{
								shaderLocation: 1,
								offset: 12,
								format: "float32x3",
							},
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
		if (this.boxes.length === 0) {
			this.drawn = null;
			return;
		}
		if (this.boxes !== this.drawn) this.upload(this.boxes);
		if (!this.buffer || this.count === 0) return;
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

	private upload(boxes: readonly BoundsBox[]): void {
		const data = boundsGeometry(boxes);
		if (!this.buffer || this.buffer.size < data.byteLength) {
			this.buffer?.destroy();
			this.buffer = this.ctx.device.createBuffer({
				size: Math.max(data.byteLength, 4),
				usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
			});
		}
		this.ctx.device.queue.writeBuffer(this.buffer, 0, data);
		this.count = data.length / MARKER_STRIDE;
		this.drawn = boxes;
	}
}
