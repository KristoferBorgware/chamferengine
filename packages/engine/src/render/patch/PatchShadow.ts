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
 * **Small, because the normal offset does the work now.** A depth bias moves a
 * sample along the light, which shortens every shadow by the same distance --
 * on terracing whose steps cast a metre or two that is the whole shadow. Pushing
 * the sample along its own **normal** instead moves it out of its own surface
 * without moving it along the light at all, so a short shadow keeps its length.
 * This is what is left over for the depth the offset cannot reach.
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
const BIAS_METRES = 0.02;

/**
 * One shadow map per light, for the landscape bench.
 *
 * **Two cascades a light, and the first attempt at one map was wrong.** The
 * argument against cascades was that a bench patch is a box whose corners are
 * all known before anything is drawn, so one map fitted to it beats any number
 * of pieces over it. The box is bounded; what it holds is not proportionate to
 * it. Measured (`tools/probe-shadow-fit.ts`), the shipped patch fits in a map
 * **672 m** across, which at 2,048 texels is **0.657 m** a texel -- and a 1 m
 * step of terracing casts **1.73 m**. Between a normal offset of a texel and a
 * half and a 3x3 blur a texel wide, the whole shadow was inside the error: on
 * against off measured **0.00** of 255, everywhere.
 *
 * That is the cascade case exactly -- the near ground wants centimetres a texel
 * and the far ground cannot have them -- and it arrives here because the
 * features are three orders of magnitude smaller than the box, not because the
 * box is unbounded.
 *
 * **The near cascade is sized from the camera rather than from the patch**, so
 * it tightens as the viewer zooms in and the texels follow what is being looked
 * at. The far one covers the whole patch and catches everything the near one
 * does not reach.
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

	/** One matrix per light and cascade, in the order the world pass reads them. */
	readonly matrices: Float32Array[] = [];

	/** Per light and cascade: what a texel is worth on the ground, and the bias. */
	readonly fit: Float32Array = new Float32Array(16);

	constructor(ctx: GpuContext, lights: number, cascades: number) {
		this.ctx = ctx;
		for (let n = 0; n < lights * cascades; n++)
			this.matrices.push(new Float32Array(16));
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
		for (let n = 0; n < lights * cascades; n++) {
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

	/** How wide one texel is across the map, for the blur. */
	get texel(): number {
		return 1 / SIZE;
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
		slot: number,
		direction: readonly [number, number, number],
		box: ShadowBox,
		vertices: GPUBuffer,
		count: number,
	): void {
		const { device } = this.ctx;
		const len = Math.hypot(direction[0], direction[1], direction[2]) || 1;
		const to: [number, number, number] = [
			direction[0] / len,
			direction[1] / len,
			direction[2] / len,
		];
		// The light's own three axes, so the box can be measured in them.
		const up: [number, number, number] =
			Math.abs(to[1]) > 0.999 ? [1, 0, 0] : [0, 1, 0];
		const rx = [
			up[1] * to[2] - up[2] * to[1],
			up[2] * to[0] - up[0] * to[2],
			up[0] * to[1] - up[1] * to[0],
		];
		const rl = Math.hypot(rx[0]!, rx[1]!, rx[2]!) || 1;
		const ax: [number, number, number] = [
			rx[0]! / rl,
			rx[1]! / rl,
			rx[2]! / rl,
		];
		const ay: [number, number, number] = [
			to[1] * ax[2] - to[2] * ax[1],
			to[2] * ax[0] - to[0] * ax[2],
			to[0] * ax[1] - to[1] * ax[0],
		];

		// **Fitted in the light's own axes, not by the box's diagonal.** A
		// diagonal covers the box whichever way the light points and is simple;
		// it is also far too big here, because a bench patch is a wide, shallow
		// slab with several hundred metres of crust hanging under it, and the
		// crust runs mostly along the light's depth -- which costs nothing --
		// while the diagonal charges for it laterally. Measured on the shipped
		// patch, the diagonal asks for 1,712 m across and the real extent is
		// 1,127 m: a third of every texel spent on nothing.
		let loU = Infinity;
		let hiU = -Infinity;
		let loV = Infinity;
		let hiV = -Infinity;
		let loW = Infinity;
		let hiW = -Infinity;
		for (let corner = 0; corner < 8; corner++) {
			const px = (corner & 1 ? box.high : box.low)[0]!;
			const py = (corner & 2 ? box.high : box.low)[1]!;
			const pz = (corner & 4 ? box.high : box.low)[2]!;
			const u = px * ax[0] + py * ax[1] + pz * ax[2];
			const v = px * ay[0] + py * ay[1] + pz * ay[2];
			const w = px * to[0] + py * to[1] + pz * to[2];
			if (u < loU) loU = u;
			if (u > hiU) hiU = u;
			if (v < loV) loV = v;
			if (v > hiV) hiV = v;
			if (w < loW) loW = w;
			if (w > hiW) hiW = w;
		}
		const half = Math.max(1, Math.max(hiU - loU, hiV - loV) / 2);
		const deep = Math.max(1, hiW - loW);
		// The middle of the box in the light's axes, put back in the patch's.
		const midU = (loU + hiU) / 2;
		const midV = (loV + hiV) / 2;
		const midW = (loW + hiW) / 2;
		const middle: [number, number, number] = [
			ax[0] * midU + ay[0] * midV + to[0] * midW,
			ax[1] * midU + ay[1] * midV + to[1] * midW,
			ax[2] * midU + ay[2] * midV + to[2] * midW,
		];
		const back = deep;
		const eye: [number, number, number] = [
			middle[0] + to[0] * back,
			middle[1] + to[1] * back,
			middle[2] + to[2] * back,
		];
		const view = Mat4.lookAt(eye, middle, up);
		const proj = Mat4.orthographic(half, back - deep / 2, back + deep / 2);
		const matrix = proj.multiply(view).elements;
		this.matrices[slot]!.set(matrix);
		// **What one texel is worth on the ground, in metres.** The world pass
		// pushes its sample along the surface normal by about this, which is
		// what stops a face shadowing itself without eating the length off
		// every short shadow the way a depth bias does.
		this.fit[slot * 4] = (half * 2) / SIZE;
		this.fit[slot * 4 + 1] = BIAS_METRES / deep;
		device.queue.writeBuffer(this.uniforms[slot]!, 0, matrix);

		const pass = encoder.beginRenderPass({
			colorAttachments: [],
			depthStencilAttachment: {
				view: this.views[slot]!,
				depthClearValue: 1,
				depthLoadOp: "clear",
				depthStoreOp: "store",
			},
		});
		if (count > 0) {
			pass.setPipeline(this.pipeline);
			pass.setBindGroup(0, this.groups[slot]!);
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
