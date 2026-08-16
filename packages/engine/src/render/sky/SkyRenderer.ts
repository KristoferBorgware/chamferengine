import type { Frame } from "../Frame.js";
import type { GpuContext } from "../gpu/GpuContext.js";
import type { Mat4 } from "../../math/Mat4.js";
import type { PassLayer } from "../PassLayer.js";
import type { Vec3 } from "../../math/Vec3.js";
import { CLOUD_SHADER } from "./CLOUD_SHADER.js";
import { SKY_SHADER } from "./SKY_SHADER.js";

/** Where the moon is, how big it looks, and how far off it stands. */
export interface Moon {
	/** Unit direction from the planet's centre. */
	readonly direction: Vec3;

	/** Half the angle it covers, in radians. */
	readonly angularRadius: number;
}

/** The inverse matrix, the moon, and the two numbers the sky needs. */
const SKY_BYTES = 64 + 16 + 16;

/**
 * Draws the sky before the terrain and the clouds after it.
 *
 * The atmosphere is Earth's whatever size the planet is, because optical depth
 * is a property of air times a path length and only the path shrinks. The
 * camera's real height is lifted onto Earth's radius by one scale factor, and
 * the sun's direction is the only thing taken from the world.
 */
export class SkyRenderer implements PassLayer {
	private readonly ctx: GpuContext;
	private readonly skyPipeline: GPURenderPipeline;
	private readonly cloudPipeline: GPURenderPipeline;
	private readonly uniform: GPUBuffer;
	private readonly bindGroup: GPUBindGroup;
	private readonly data = new Float32Array(SKY_BYTES / 4);

	private clouds: {
		vertices: GPUBuffer;
		indices: GPUBuffer;
		count: number;
	} | null = null;

	/** The planet's own radius, and how much of a metre here is one there. */
	surfaceRadius = 1700;

	/** Where the moon sits, and how much sky it takes. */
	moon: Moon;

	/** The inverse of the frame's view-projection, for casting rays per pixel. */
	inverseViewProj: Mat4 | null = null;

	constructor(ctx: GpuContext, moon: Moon) {
		this.ctx = ctx;
		this.moon = moon;
		const { device, format } = ctx;

		const layout = device.createBindGroupLayout({
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
					buffer: { type: "uniform" },
				},
			],
		});
		this.uniform = device.createBuffer({
			size: SKY_BYTES,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		this.bindGroup = device.createBindGroup({
			layout,
			entries: [{ binding: 0, resource: { buffer: this.uniform } }],
		});

		// The sky shares the frame's bind group, so it reads the same sun and
		// the same fog the terrain does.
		const frameLayout = device.createBindGroupLayout({
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
					buffer: { type: "uniform" },
				},
			],
		});
		const pipelineLayout = device.createPipelineLayout({
			bindGroupLayouts: [frameLayout, layout],
		});

		this.skyPipeline = device.createRenderPipeline({
			layout: pipelineLayout,
			vertex: {
				module: device.createShaderModule({ code: SKY_SHADER }),
				entryPoint: "vertexMain",
			},
			fragment: {
				module: device.createShaderModule({ code: SKY_SHADER }),
				entryPoint: "fragmentMain",
				targets: [{ format }],
			},
			primitive: { topology: "triangle-list" },
			// Fills every pixel at the far plane and writes no depth, so the
			// ground draws over it without a comparison.
			depthStencil: {
				format: "depth24plus",
				depthWriteEnabled: false,
				depthCompare: "always",
			},
		});

		const cloudModule = device.createShaderModule({ code: CLOUD_SHADER });
		this.cloudPipeline = device.createRenderPipeline({
			layout: pipelineLayout,
			vertex: {
				module: cloudModule,
				entryPoint: "vertexMain",
				buffers: [
					{
						arrayStride: 16,
						attributes: [
							{
								shaderLocation: 0,
								offset: 0,
								format: "float32x3",
							},
							{
								shaderLocation: 1,
								offset: 12,
								format: "float32",
							},
						],
					},
				],
			},
			fragment: {
				module: cloudModule,
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
	 * Replace the cloud geometry.
	 *
	 * A cloud has no address, so there is nothing to update in place: the
	 * buffer is thrown away and refilled as the wind turns.
	 */
	setClouds(
		vertices: Float32Array<ArrayBuffer>,
		indices: Uint32Array<ArrayBuffer>,
	): void {
		this.clouds?.vertices.destroy();
		this.clouds?.indices.destroy();
		this.clouds = null;
		if (indices.length === 0) return;

		const { device } = this.ctx;
		const vertexBuffer = device.createBuffer({
			size: vertices.byteLength,
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
		});
		device.queue.writeBuffer(vertexBuffer, 0, vertices);
		const indexBuffer = device.createBuffer({
			size: indices.byteLength,
			usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
		});
		device.queue.writeBuffer(indexBuffer, 0, indices);
		this.clouds = {
			vertices: vertexBuffer,
			indices: indexBuffer,
			count: indices.length,
		};
	}

	before(pass: GPURenderPassEncoder, frame: Frame): void {
		if (!this.inverseViewProj) return;
		this.data.set(this.inverseViewProj.elements, 0);
		this.data.set(
			[
				this.moon.direction.x,
				this.moon.direction.y,
				this.moon.direction.z,
				this.moon.angularRadius,
			],
			16,
		);
		// The planet's radius, and the factor lifting a height here onto
		// Earth's atmosphere.
		this.data[20] = this.surfaceRadius;
		this.data[21] = 6371000 / this.surfaceRadius;
		this.ctx.device.queue.writeBuffer(this.uniform, 0, this.data);

		pass.setPipeline(this.skyPipeline);
		pass.setBindGroup(1, this.bindGroup);
		pass.draw(3);
		void frame;
	}

	after(pass: GPURenderPassEncoder, frame: Frame): void {
		if (!this.clouds) return;
		pass.setPipeline(this.cloudPipeline);
		pass.setBindGroup(1, this.bindGroup);
		pass.setVertexBuffer(0, this.clouds.vertices);
		pass.setIndexBuffer(this.clouds.indices, "uint32");
		pass.drawIndexed(this.clouds.count);
		void frame;
	}
}
