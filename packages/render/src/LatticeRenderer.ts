import type { GpuContext } from "./gpuContext.js";
import type { Geometry } from "./latticeGeometry.js";
import type { Mat4 } from "./mat4.js";
import { LATTICE_SHADER } from "./latticeShader.js";

/** One drawable copy of the lattice, with its own buffers and blend state. */
interface Pass {
	readonly geometry: Geometry;
	readonly vertexBuffer: GPUBuffer;
	readonly indexBuffer: GPUBuffer;
	readonly uniformBuffer: GPUBuffer;
	readonly bindGroup: GPUBindGroup;
	readonly tint: readonly [number, number, number, number];
}

/** A view matrix, a projection matrix, and the size they were built for. */
export interface Frame {
	readonly viewProj: Mat4;
}

/**
 * Draws the bare lattice: an opaque sphere of flat-coloured cells, and a
 * translucent shell over it.
 *
 * The shell carries no terrain and exists to exercise the translucent pass —
 * depth test on, depth write off, drawn after everything opaque — against real
 * geometry before anything depends on it.
 */
export class LatticeRenderer {
	private readonly ctx: GpuContext;
	private readonly opaquePipeline: GPURenderPipeline;
	private readonly blendPipeline: GPURenderPipeline;
	private readonly layout: GPUBindGroupLayout;
	private readonly passes: Pass[] = [];
	private depth: GPUTexture | null = null;

	constructor(ctx: GpuContext) {
		this.ctx = ctx;
		const { device, format } = ctx;
		const module = device.createShaderModule({ code: LATTICE_SHADER });

		this.layout = device.createBindGroupLayout({
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
					buffer: { type: "uniform" },
				},
			],
		});
		const pipelineLayout = device.createPipelineLayout({
			bindGroupLayouts: [this.layout],
		});

		const vertex: GPUVertexState = {
			module,
			entryPoint: "vertexMain",
			buffers: [
				{
					arrayStride: 24,
					attributes: [
						{ shaderLocation: 0, offset: 0, format: "float32x3" },
						{ shaderLocation: 1, offset: 12, format: "float32x3" },
					],
				},
			],
		};

		const common = {
			layout: pipelineLayout,
			vertex,
			primitive: { topology: "triangle-list", cullMode: "back" },
		} as const;

		this.opaquePipeline = device.createRenderPipeline({
			...common,
			fragment: {
				module,
				entryPoint: "fragmentMain",
				targets: [{ format }],
			},
			depthStencil: {
				format: "depth24plus",
				depthWriteEnabled: true,
				depthCompare: "less",
			},
		});

		this.blendPipeline = device.createRenderPipeline({
			...common,
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
			// The translucent pass reads depth and does not write it, so the shell
			// never hides the shell behind it.
			depthStencil: {
				format: "depth24plus",
				depthWriteEnabled: false,
				depthCompare: "less",
			},
		});
	}

	/** Upload one copy of the lattice. Passes draw in the order they are added. */
	addPass(
		geometry: Geometry,
		tint: readonly [number, number, number, number],
	): void {
		const { device } = this.ctx;
		const vertexBuffer = device.createBuffer({
			size: geometry.vertices.byteLength,
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
		});
		device.queue.writeBuffer(vertexBuffer, 0, geometry.vertices);

		const indexBuffer = device.createBuffer({
			size: geometry.indices.byteLength,
			usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
		});
		device.queue.writeBuffer(indexBuffer, 0, geometry.indices);

		// A 4x4 matrix and a tint: 64 bytes plus 16.
		const uniformBuffer = device.createBuffer({
			size: 80,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		const bindGroup = device.createBindGroup({
			layout: this.layout,
			entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
		});
		this.passes.push({
			geometry,
			vertexBuffer,
			indexBuffer,
			uniformBuffer,
			bindGroup,
			tint,
		});
	}

	/** Rebuild the depth texture to match the canvas. */
	private ensureDepth(): GPUTexture {
		const { device, canvas } = this.ctx;
		if (
			this.depth &&
			this.depth.width === canvas.width &&
			this.depth.height === canvas.height
		)
			return this.depth;
		this.depth?.destroy();
		this.depth = device.createTexture({
			size: { width: canvas.width, height: canvas.height },
			format: "depth24plus",
			usage: GPUTextureUsage.RENDER_ATTACHMENT,
		});
		return this.depth;
	}

	/** Draw every pass for one frame. */
	render(frame: Frame): void {
		const { device, context } = this.ctx;
		const depth = this.ensureDepth();

		for (const pass of this.passes) {
			const data = new Float32Array(20);
			data.set(frame.viewProj, 0);
			data.set(pass.tint, 16);
			device.queue.writeBuffer(pass.uniformBuffer, 0, data);
		}

		const encoder = device.createCommandEncoder();
		const view = context.getCurrentTexture().createView();
		const draw = encoder.beginRenderPass({
			colorAttachments: [
				{
					view,
					clearValue: { r: 0.02, g: 0.03, b: 0.05, a: 1 },
					loadOp: "clear",
					storeOp: "store",
				},
			],
			depthStencilAttachment: {
				view: depth.createView(),
				depthClearValue: 1,
				depthLoadOp: "clear",
				depthStoreOp: "store",
			},
		});

		this.passes.forEach((pass, index) => {
			draw.setPipeline(
				index === 0 ? this.opaquePipeline : this.blendPipeline,
			);
			draw.setBindGroup(0, pass.bindGroup);
			draw.setVertexBuffer(0, pass.vertexBuffer);
			draw.setIndexBuffer(pass.indexBuffer, "uint32");
			draw.drawIndexed(pass.geometry.indices.length);
		});

		draw.end();
		device.queue.submit([encoder.finish()]);
	}
}
