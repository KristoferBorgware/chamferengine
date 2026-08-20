import type { Frame } from "../Frame.js";
import type { GpuContext } from "../gpu/GpuContext.js";
import type { PassLayer } from "../PassLayer.js";
import type { CloudPuffLayer } from "../../sky/CloudPuff.js";
import { generateCloudPuffs } from "../../sky/generateCloudPuffs.js";
import { buildPuffMesh } from "./buildPuffMesh.js";
import { BILLBOARD_CLOUD_SHADER } from "./BILLBOARD_CLOUD_SHADER.js";

/** Direction(3), corner(2), size, cover, radius, windRate. */
const VERTEX_STRIDE = 9 * 4;

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
	private readonly vertexBuffer: GPUBuffer;
	private readonly indexBuffer: GPUBuffer;
	private readonly indexCount: number;

	/** Whether anything is drawn at all. */
	visible = true;

	/** Seconds since the wind started turning. */
	time = 0;

	constructor(
		ctx: GpuContext,
		seed: number,
		candidatesPerLayer: number,
		layers: readonly CloudPuffLayer[],
	) {
		this.ctx = ctx;
		const { device, format } = ctx;

		const puffs = generateCloudPuffs(seed, candidatesPerLayer, layers);
		const { vertices, indices } = buildPuffMesh(puffs);
		this.indexCount = indices.length;

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
