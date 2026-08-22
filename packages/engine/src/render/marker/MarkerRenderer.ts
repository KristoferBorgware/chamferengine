import type { Frame } from "../Frame.js";
import type { GpuContext } from "../gpu/GpuContext.js";
import type { PassLayer } from "../PassLayer.js";
import type { ViewMarker } from "./ViewMarker.js";
import { MARKER_SHADER } from "./MARKER_SHADER.js";
import { MARKER_STRIDE, markerGeometry } from "./markerGeometry.js";

/** One buffer and how many vertices of it are filled. */
interface Held {
	buffer: GPUBuffer;
	count: number;
}

/**
 * Draws a camera as a box and a wire cone, after the terrain and inside its
 * depth.
 *
 * Depth-tested and depth-writing, so a marker behind a hill is behind it. That
 * is the point: a marker that floated over the ground would say nothing about
 * where it actually stands.
 *
 * Two pipelines over one shader, because the two halves are different shapes
 * of thing: the box is solid and says where the camera is, the cone is lines
 * and says what it could see. A solid cone would hide the ground inside it,
 * which is the whole of what the marker was put there to show.
 *
 * Set {@link MarkerRenderer.marker} to draw one and `null` to stop.
 */
export class MarkerRenderer implements PassLayer {
	private readonly ctx: GpuContext;
	private readonly solidPipeline: GPURenderPipeline;
	private readonly linePipeline: GPURenderPipeline;
	private box: Held | null = null;
	private cone: Held | null = null;
	private drawn: ViewMarker | null = null;

	/** The camera to draw, or `null` for none. */
	marker: ViewMarker | null = null;

	constructor(ctx: GpuContext) {
		this.ctx = ctx;
		const { device, sceneFormat: format } = ctx;

		// The frame's own bindings, declared again so these pipelines can be
		// laid out against them. Group 0 is bound once for the whole pass.
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
		const shared = {
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
								format: "float32x3" as const,
							},
							{
								shaderLocation: 1,
								offset: 12,
								format: "float32x3" as const,
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
				format: "depth24plus" as const,
				depthWriteEnabled: true,
				depthCompare: "less" as const,
			},
		};
		this.solidPipeline = device.createRenderPipeline({
			...shared,
			primitive: { topology: "triangle-list", cullMode: "back" },
		});
		this.linePipeline = device.createRenderPipeline({
			...shared,
			primitive: { topology: "line-list" },
		});
	}

	after(pass: GPURenderPassEncoder, frame: Frame): void {
		if (!this.marker) return;
		if (this.marker !== this.drawn) this.upload(this.marker);
		if (this.box) {
			pass.setPipeline(this.solidPipeline);
			pass.setVertexBuffer(0, this.box.buffer);
			pass.draw(this.box.count);
		}
		if (this.cone) {
			pass.setPipeline(this.linePipeline);
			pass.setVertexBuffer(0, this.cone.buffer);
			pass.draw(this.cone.count);
		}
		void frame;
	}

	/** Throw both buffers away. */
	destroy(): void {
		this.box?.buffer.destroy();
		this.cone?.buffer.destroy();
		this.box = null;
		this.cone = null;
		this.drawn = null;
	}

	private upload(marker: ViewMarker): void {
		const { box, cone } = markerGeometry(marker);
		this.box = this.fill(this.box, box);
		this.cone = this.fill(this.cone, cone);
		this.drawn = marker;
	}

	/** Grow the buffer if it has to, write it, and say what is in it. */
	private fill(held: Held | null, data: Float32Array<ArrayBuffer>): Held {
		let buffer = held?.buffer;
		if (!buffer || buffer.size < data.byteLength) {
			buffer?.destroy();
			buffer = this.ctx.device.createBuffer({
				size: data.byteLength,
				usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
			});
		}
		this.ctx.device.queue.writeBuffer(buffer, 0, data);
		return { buffer, count: data.length / MARKER_STRIDE };
	}
}
