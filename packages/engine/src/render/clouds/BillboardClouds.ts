import type { Frame } from "../Frame.js";
import type { GpuContext } from "../gpu/GpuContext.js";
import type { PassLayer } from "../PassLayer.js";
import type { CloudPuffLayer } from "../../sky/CloudPuff.js";
import { generateCloudPuffs } from "../../sky/generateCloudPuffs.js";
import { PUFF_STRIDE, buildPuffMesh } from "./buildPuffMesh.js";
import { BILLBOARD_CLOUD_SHADER } from "./BILLBOARD_CLOUD_SHADER.js";

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

	constructor(
		ctx: GpuContext,
		seed: number,
		clusters: number,
		perCluster: number,
		layers: readonly CloudPuffLayer[],
	) {
		this.ctx = ctx;
		this.seed = seed;
		const { device, format } = ctx;

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

	after(pass: GPURenderPassEncoder, frame: Frame): void {
		if (!this.visible || this.indexCount === 0) return;
		this.windData[0] = this.time;
		this.ctx.device.queue.writeBuffer(this.windUniform, 0, this.windData);

		pass.setPipeline(this.pipeline);
		pass.setBindGroup(1, this.windBindGroup);
		pass.setVertexBuffer(0, this.vertexBuffer);
		pass.setIndexBuffer(this.indexBuffer, "uint32");
		pass.drawIndexed(this.indexCount);
		void frame;
	}

	/** Throw the GPU buffers away. */
	destroy(): void {
		this.vertexBuffer.destroy();
		this.indexBuffer.destroy();
		this.windUniform.destroy();
	}
}
