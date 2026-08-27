import type { GpuContext } from "../gpu/GpuContext.js";
import { Mat4 } from "../../math/Mat4.js";
import { PATCH_SHADOW_SHADER } from "./PATCH_SHADOW_SHADER.js";
import { PATCH_STRIDE } from "../../mesh/PatchGeometry.js";

/** The box a shadow map has to cover, in the patch's own frame. */
export interface ShadowBox {
	readonly low: readonly [number, number, number];
	readonly high: readonly [number, number, number];
}

/** How many texels across each map is. */
const SIZE = 2048;

/**
 * How far a sample is pushed toward the light before it is compared, in metres.
 *
 * **A surface records its own depth, so reading the map at itself is a coin
 * toss** -- half the samples come back nearer and half further, which draws as
 * stripes across every lit face.
 *
 * **In metres, because the depth range is the patch's own size.** Stated as a
 * fraction of that range instead, a figure that suits one patch is a different
 * distance on every other: at the shipped patch a bias of `0.0015` of the range
 * is **2.1 m** of offset, which on 1 m blocks detaches every shadow from the
 * step that casts it and leaves the short ones -- which is all of them on
 * terraced ground -- with nothing at all. A sixth of a block is enough to stop
 * the stripes and short enough to keep a block's shadow touching it.
 */
const BIAS_METRES = 0.15;

/**
 * One shadow map per light, for the landscape bench.
 *
 * **Not cascades, and that is the point.** Cascades exist because a view of a
 * world is unbounded: the near ground wants centimetres a texel and the far
 * ground cannot have them, so the range is cut into pieces and each gets its
 * own map. A bench patch is a box a kilometre across whose corners are all
 * known before anything is drawn, so one map fitted to that box beats any
 * number of cascades over it -- at 2,048 texels across the shipped patch it is
 * about **half a metre** a texel, which is finer than the blocks it is
 * shadowing.
 *
 * **Fitted to the mesh's own box, not to the ground's range.** A patch's width
 * says nothing about how far its crust runs down, and the lip hanging off the
 * rim is geometry that casts.
 */
export class PatchShadow {
	private readonly ctx: GpuContext;
	private readonly pipeline: GPURenderPipeline;
	private readonly uniforms: GPUBuffer[] = [];
	private readonly groups: GPUBindGroup[] = [];
	private readonly maps: GPUTexture[] = [];
	private readonly views: GPUTextureView[] = [];

	private biasDepth = 0;

	/** The light matrices the world pass reads, one per light. */
	readonly matrices: Float32Array[] = [
		new Float32Array(16),
		new Float32Array(16),
	];

	constructor(ctx: GpuContext, lights: number) {
		this.ctx = ctx;
		const { device } = ctx;
		const module = device.createShaderModule({
			code: PATCH_SHADOW_SHADER,
		});
		const layout = device.createBindGroupLayout({
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.VERTEX,
					buffer: { type: "uniform" },
				},
			],
		});
		this.pipeline = device.createRenderPipeline({
			layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
			vertex: {
				module,
				entryPoint: "vertexMain",
				buffers: [
					{
						arrayStride: PATCH_STRIDE * 4,
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
			// **Nothing is culled.** A column mesh is a shell with no underside
			// and its caps and walls are wound for the outside; culling by
			// facing would drop the faces whose own shadow this records.
			primitive: { topology: "triangle-list", cullMode: "none" },
			depthStencil: {
				format: "depth32float",
				depthWriteEnabled: true,
				depthCompare: "less",
			},
		});
		for (let n = 0; n < lights; n++) {
			const map = device.createTexture({
				size: [SIZE, SIZE],
				format: "depth32float",
				usage:
					GPUTextureUsage.RENDER_ATTACHMENT |
					GPUTextureUsage.TEXTURE_BINDING,
			});
			this.maps.push(map);
			this.views.push(map.createView());
			const uniform = device.createBuffer({
				size: 64,
				usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
			});
			this.uniforms.push(uniform);
			this.groups.push(
				device.createBindGroup({
					layout,
					entries: [{ binding: 0, resource: { buffer: uniform } }],
				}),
			);
		}
	}

	/** What the world pass binds: one depth view per light. */
	view(light: number): GPUTextureView {
		return this.views[light]!;
	}

	/** How wide one texel is in the map's own depth range, for the blur. */
	get texel(): number {
		return 1 / SIZE;
	}

	/**
	 * The bias in the depth range the last box was fitted to.
	 *
	 * Set when a light is recorded, because the range is the box's own size and
	 * the shader compares in that range rather than in metres.
	 */
	get bias(): number {
		return this.biasDepth;
	}

	/**
	 * Record one light's depth of the patch.
	 *
	 * The box is fitted by putting the camera far enough back along the light
	 * that the whole box is in front of it, and taking the half-width from the
	 * box's own diagonal -- which covers it whichever way the light points, at
	 * the cost of some texels on a box that is not a cube. A bench patch is
	 * wide and shallow, so that costs about a third of the map and buys a fit
	 * with no case in it.
	 */
	record(
		encoder: GPUCommandEncoder,
		light: number,
		direction: readonly [number, number, number],
		box: ShadowBox,
		vertices: GPUBuffer,
		count: number,
	): void {
		const { device } = this.ctx;
		const middle: [number, number, number] = [
			(box.low[0] + box.high[0]) / 2,
			(box.low[1] + box.high[1]) / 2,
			(box.low[2] + box.high[2]) / 2,
		];
		const reach =
			Math.hypot(
				box.high[0] - box.low[0],
				box.high[1] - box.low[1],
				box.high[2] - box.low[2],
			) / 2 || 1;
		const len = Math.hypot(direction[0], direction[1], direction[2]) || 1;
		const eye: [number, number, number] = [
			middle[0] + (direction[0] / len) * reach * 2,
			middle[1] + (direction[1] / len) * reach * 2,
			middle[2] + (direction[2] / len) * reach * 2,
		];
		// Any axis not along the light gives an up; the light is never straight
		// down the world's own y here, but the guard costs one comparison.
		const up: [number, number, number] =
			Math.abs(direction[1] / len) > 0.999 ? [1, 0, 0] : [0, 1, 0];
		const view = Mat4.lookAt(eye, middle, up);
		const proj = Mat4.orthographic(reach, reach, reach * 3);
		// The near and far planes are `reach` and `reach * 3`, so the depth the
		// shader compares in spans `reach * 2` metres.
		this.biasDepth = BIAS_METRES / (reach * 2);
		const matrix = proj.multiply(view).elements;
		this.matrices[light]!.set(matrix);
		device.queue.writeBuffer(this.uniforms[light]!, 0, matrix);

		const pass = encoder.beginRenderPass({
			colorAttachments: [],
			depthStencilAttachment: {
				view: this.views[light]!,
				depthClearValue: 1,
				depthLoadOp: "clear",
				depthStoreOp: "store",
			},
		});
		if (count > 0) {
			pass.setPipeline(this.pipeline);
			pass.setBindGroup(0, this.groups[light]!);
			pass.setVertexBuffer(0, vertices);
			pass.draw(count);
		}
		pass.end();
	}

	dispose(): void {
		for (const map of this.maps) map.destroy();
		for (const uniform of this.uniforms) uniform.destroy();
	}
}
