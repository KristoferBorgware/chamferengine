import type { Frame } from "../Frame.js";
import type { GpuContext } from "../gpu/GpuContext.js";
import type { PassLayer } from "../PassLayer.js";
import type { PlayerBody } from "./PlayerBody.js";
import { CAPSULE_STRIDE, capsuleGeometry } from "./capsuleGeometry.js";
import { MARKER_SHADER } from "../marker/MARKER_SHADER.js";

/**
 * Draws the player as a capsule, after the terrain and inside its depth.
 *
 * **Only worth drawing from outside.** The camera sits at the eye until it is
 * pulled back, and a body drawn there fills the screen with the inside of its
 * own head. The client sets {@link PlayerRenderer.body} once the camera trails
 * and `null` the rest of the time, which is the whole of the switch.
 *
 * Depth-tested and depth-writing, so a player behind a hill is behind it, and
 * one standing in a hollow is in it.
 *
 * It runs `MARKER_SHADER` -- a position and a color a vertex, transformed by
 * the frame's own matrix and drawn as handed over. The shading is baked into
 * the color by {@link capsuleGeometry} for the reason that shader exists: a
 * marker lit by the scene goes dark with the scene, and this one is how a
 * player finds themselves.
 */
export class PlayerRenderer implements PassLayer {
	private readonly ctx: GpuContext;
	private readonly pipeline: GPURenderPipeline;
	private buffer: GPUBuffer | null = null;
	private count = 0;
	private drawn: PlayerBody | null = null;

	/** The player to draw, or `null` for none. */
	body: PlayerBody | null = null;

	constructor(ctx: GpuContext) {
		this.ctx = ctx;
		const { device, sceneFormat: format } = ctx;

		// The frame's own bindings, declared again so this pipeline can be
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
		this.pipeline = device.createRenderPipeline({
			layout: device.createPipelineLayout({
				bindGroupLayouts: [frameLayout],
			}),
			vertex: {
				module,
				entryPoint: "vertexMain",
				buffers: [
					{
						arrayStride: CAPSULE_STRIDE * 4,
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
				format: "depth32float",
				depthWriteEnabled: true,
				depthCompare: "less",
			},
			primitive: { topology: "triangle-list", cullMode: "back" },
		});
	}

	after(pass: GPURenderPassEncoder, frame: Frame): void {
		if (!this.body) return;
		if (this.body !== this.drawn) this.upload(this.body);
		if (!this.buffer) return;
		pass.setPipeline(this.pipeline);
		pass.setVertexBuffer(0, this.buffer);
		pass.draw(this.count);
		void frame;
	}

	/** Throw the buffer away. */
	destroy(): void {
		this.buffer?.destroy();
		this.buffer = null;
		this.drawn = null;
	}

	private upload(body: PlayerBody): void {
		const data = capsuleGeometry(body);
		if (!this.buffer || this.buffer.size < data.byteLength) {
			this.buffer?.destroy();
			this.buffer = this.ctx.device.createBuffer({
				size: data.byteLength,
				usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
			});
		}
		this.ctx.device.queue.writeBuffer(this.buffer, 0, data);
		this.count = data.length / CAPSULE_STRIDE;
		this.drawn = body;
	}
}
