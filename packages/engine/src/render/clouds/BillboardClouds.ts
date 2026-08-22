import type { Frame } from "../Frame.js";
import type { GpuContext } from "../gpu/GpuContext.js";
import type { PassLayer } from "../PassLayer.js";
import type { CloudPuff, CloudPuffLayer } from "../../sky/CloudPuff.js";
import { Frustum } from "../../math/Frustum.js";
import { Vec3 } from "../../math/Vec3.js";
import { WIND_AXIS } from "../../sky/WIND_AXIS.js";
import { generateCloudPuffs } from "../../sky/generateCloudPuffs.js";
import { windRotation } from "../../sky/windRotation.js";
import { PUFF_STRIDE, buildPuffMesh } from "./buildPuffMesh.js";
import { BILLBOARD_CLOUD_SHADER } from "./BILLBOARD_CLOUD_SHADER.js";

/**
 * Gather a run of puffs per formation, with a sphere that holds all of it.
 *
 * The puffs arrive formation by formation, so a mass is a run rather than a
 * set: it needs no index, only where it starts and how long it is. Every puff
 * of one formation shares a drift rate, so the whole sphere turns as one.
 *
 * The bound reaches to the outside of the furthest puff, taking a puff's size
 * as its half-width and its own lift into account, so nothing pops at the rim
 * of a mass as it crosses the edge of the screen.
 */
function groupFormations(puffs: readonly CloudPuff[]): Formation[] {
	const out: Formation[] = [];
	let at = 0;
	while (at < puffs.length) {
		const which = puffs[at]!.formation;
		let end = at;
		let x = 0;
		let y = 0;
		let z = 0;
		while (end < puffs.length && puffs[end]!.formation === which) {
			const puff = puffs[end]!;
			x += puff.direction.x * puff.radius;
			y += puff.direction.y * puff.radius;
			z += puff.direction.z * puff.radius;
			end++;
		}
		const held = end - at;
		const middle = new Vec3(x / held, y / held, z / held);
		let bound = 0;
		for (let n = at; n < end; n++) {
			const puff = puffs[n]!;
			const away = new Vec3(
				puff.direction.x * puff.radius,
				puff.direction.y * puff.radius,
				puff.direction.z * puff.radius,
			)
				.sub(middle)
				.length();
			bound = Math.max(bound, away + puff.size);
		}
		out.push({
			at: middle,
			bound,
			windRate: puffs[at]!.windRate,
			// Six triangles a puff, three indices each.
			first: at * 18,
			count: held * 18,
		});
		at = end;
	}
	return out;
}

/** One cloud mass, as the indices that draw it and a sphere holding it. */
interface Formation {
	/** Where its middle sits before the wind turns it. */
	readonly at: Vec3;

	/** Metres from that middle to the outside of its furthest puff. */
	readonly bound: number;

	readonly windRate: number;

	/** Where this mass starts in the index buffer, and how many indices it is. */
	readonly first: number;
	readonly count: number;
}

const VERTEX_STRIDE = PUFF_STRIDE * 4;

const WIND_BYTES = 16;

/**
 * Translucent hexagon billboards, turned to face the eye and drawn after the
 * terrain.
 *
 * Chosen once, at construction, from {@link generateCloudPuffs}: a puff's
 * placement never changes, so the vertex and index buffers are written once
 * and never rebuilt. The only thing that moves is the wind uniform, one
 * `f32` written before every draw -- turning every puff, and facing every
 * puff to the eye, both happen in the vertex shader.
 */
export class BillboardClouds implements PassLayer {
	private readonly ctx: GpuContext;
	private readonly pipeline: GPURenderPipeline;
	private readonly windUniform: GPUBuffer;
	private readonly windBindGroup: GPUBindGroup;
	private readonly windData = new Float32Array(WIND_BYTES / 4);
	private readonly seed: number;
	private vertexBuffer: GPUBuffer;
	private indexBuffer: GPUBuffer;
	private indexCount: number;

	/** Whether anything is drawn at all. */
	visible = true;

	/** Seconds since the wind started turning. */
	time = 0;

	/** How many hexagons the sky is built out of. */
	puffCount = 0;

	/** How many masses the last frame drew, of how many the sky holds. */
	drawnFormations = 0;

	private formations: Formation[] = [];

	constructor(
		ctx: GpuContext,
		seed: number,
		clusters: number,
		perCluster: number,
		layers: readonly CloudPuffLayer[],
	) {
		this.ctx = ctx;
		this.seed = seed;
		const { device, sceneFormat: format } = ctx;

		this.vertexBuffer = device.createBuffer({
			size: 4,
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
		});
		this.indexBuffer = device.createBuffer({
			size: 4,
			usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
		});
		this.indexCount = 0;
		this.rebuild(clusters, perCluster, layers);

		const frameLayout = device.createBindGroupLayout({
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
					buffer: { type: "uniform" },
				},
			],
		});
		const windLayout = device.createBindGroupLayout({
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.VERTEX,
					buffer: { type: "uniform" },
				},
			],
		});
		this.windUniform = device.createBuffer({
			size: WIND_BYTES,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		this.windBindGroup = device.createBindGroup({
			layout: windLayout,
			entries: [{ binding: 0, resource: { buffer: this.windUniform } }],
		});

		const module = device.createShaderModule({
			code: BILLBOARD_CLOUD_SHADER,
		});
		this.pipeline = device.createRenderPipeline({
			layout: device.createPipelineLayout({
				bindGroupLayouts: [frameLayout, windLayout],
			}),
			vertex: {
				module,
				entryPoint: "vertexMain",
				buffers: [
					{
						arrayStride: VERTEX_STRIDE,
						attributes: [
							{
								shaderLocation: 0,
								offset: 0,
								format: "float32x3",
							},
							{
								shaderLocation: 1,
								offset: 12,
								format: "float32x2",
							},
							{
								shaderLocation: 2,
								offset: 20,
								format: "float32",
							},
							{
								shaderLocation: 3,
								offset: 24,
								format: "float32",
							},
							{
								shaderLocation: 4,
								offset: 28,
								format: "float32",
							},
							{
								shaderLocation: 5,
								offset: 32,
								format: "float32",
							},
							{
								shaderLocation: 6,
								offset: 36,
								format: "float32",
							},
						],
					},
				],
			},
			fragment: {
				module,
				entryPoint: "fragmentMain",
				targets: [
					{
						format,
						blend: {
							color: {
								srcFactor: "src-alpha",
								dstFactor: "one-minus-src-alpha",
								operation: "add",
							},
							alpha: {
								srcFactor: "one",
								dstFactor: "one-minus-src-alpha",
								operation: "add",
							},
						},
					},
				],
			},
			primitive: { topology: "triangle-list", cullMode: "none" },
			depthStencil: {
				format: "depth24plus",
				depthWriteEnabled: false,
				depthCompare: "less",
			},
		});
	}

	/**
	 * Scatter the sky again, at a new size, height or density.
	 *
	 * Cheap enough to hang off a slider: the puffs are chosen and packed on
	 * the thread that draws, and even a dense sky is a few tens of
	 * milliseconds. The seed does not move, so a formation that was over a
	 * place stays over it and only what it is built out of changes.
	 */
	rebuild(
		clusters: number,
		perCluster: number,
		layers: readonly CloudPuffLayer[],
	): void {
		const { device } = this.ctx;
		const puffs = generateCloudPuffs(
			this.seed,
			clusters,
			perCluster,
			layers,
		);
		this.puffCount = puffs.length;
		const { vertices, indices } = buildPuffMesh(puffs);
		this.indexCount = indices.length;
		this.formations = groupFormations(puffs);

		this.vertexBuffer.destroy();
		this.indexBuffer.destroy();
		this.vertexBuffer = device.createBuffer({
			size: Math.max(4, vertices.byteLength),
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
		});
		device.queue.writeBuffer(this.vertexBuffer, 0, vertices);
		this.indexBuffer = device.createBuffer({
			size: Math.max(4, indices.byteLength),
			usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
		});
		device.queue.writeBuffer(this.indexBuffer, 0, indices);
	}

	/**
	 * Draw the masses the view reaches, a run of them at a time.
	 *
	 * **A formation is the unit, never a puff.** Testing hexagons one at a
	 * time would cost more than drawing them, and a mass half on screen wants
	 * all of itself drawn anyway. Puffs come out of the scatter formation by
	 * formation, so a mass is one run of indices, and neighbouring masses that
	 * are both in view are drawn together rather than a call each.
	 *
	 * The wind turns every mass about one axis, so a bound moves by rotating
	 * its middle -- a few hundred of those a frame, against tens of thousands
	 * of hexagons that would otherwise be sent whether they are in front of
	 * the camera or behind it.
	 */
	after(pass: GPURenderPassEncoder, frame: Frame): void {
		this.drawnFormations = 0;
		if (!this.visible || this.indexCount === 0) return;
		this.windData[0] = this.time;
		this.ctx.device.queue.writeBuffer(this.windUniform, 0, this.windData);

		pass.setPipeline(this.pipeline);
		pass.setBindGroup(1, this.windBindGroup);
		pass.setVertexBuffer(0, this.vertexBuffer);
		pass.setIndexBuffer(this.indexBuffer, "uint32");

		const view = new Frustum(frame.cullViewProj ?? frame.viewProj);
		let runFirst = -1;
		let runEnd = 0;
		for (const mass of this.formations) {
			const turned = windRotation(
				mass.at,
				WIND_AXIS,
				this.time * mass.windRate,
			);
			if (view.holds(turned.x, turned.y, turned.z, mass.bound)) {
				this.drawnFormations++;
				if (runFirst < 0) runFirst = mass.first;
				runEnd = mass.first + mass.count;
				continue;
			}
			if (runFirst >= 0) {
				pass.drawIndexed(runEnd - runFirst, 1, runFirst);
				runFirst = -1;
			}
		}
		if (runFirst >= 0) pass.drawIndexed(runEnd - runFirst, 1, runFirst);
	}

	/** Throw the GPU buffers away. */
	destroy(): void {
		this.vertexBuffer.destroy();
		this.indexBuffer.destroy();
		this.windUniform.destroy();
	}
}
