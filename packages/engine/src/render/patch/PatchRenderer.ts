import type { GpuContext } from "../gpu/GpuContext.js";
import type { PatchGeometry } from "../../mesh/PatchGeometry.js";
import { PATCH_SHADER } from "./PATCH_SHADER.js";
import { PATCH_STRIDE } from "../../mesh/PatchGeometry.js";

/** How the patch is drawn, beyond where the camera is. */
export interface PatchLook {
	/** Which picture: ground, height, raw, or one control layer. */
	readonly picture: number;

	/** Whether the surface, the cell rims, or both are drawn. */
	readonly surface: "solid" | "wire" | "both";

	/** Whether a ring is drawn every hundred metres. */
	readonly contours: boolean;

	/** The two elevations that cut land into three materials, in metres. */
	readonly rockLine: number;
	readonly snowLine: number;

	/** What the field reached in this patch, which Raw is drawn against. */
	readonly rawLow: number;
	readonly rawHigh: number;
}

/** A matrix, the light, the mode, and the four numbers the pictures read. */
const VIEW_BYTES = 64 + 16 + 16 + 16;

/**
 * Draws one patch of the surface, cell by cell.
 *
 * A bench rather than a world: one mesh, one uniform, no chunks and no
 * residency. The mesh is uploaded when the ground changes and the pictures are
 * a uniform, so switching between them costs a frame rather than a rebuild.
 */
export class PatchRenderer {
	private readonly ctx: GpuContext;
	private readonly solidPipeline: GPURenderPipeline;
	private readonly linePipeline: GPURenderPipeline;
	/**
	 * Two of everything the shader reads, because the rims are drawn in the
	 * same pass as the surface and differ by one number.
	 *
	 * A uniform cannot be rewritten between two draws of one pass: a queued
	 * write lands before the whole submission runs, so the second value would
	 * reach the first draw as well. Two buffers is the shape that says "these
	 * are two draws" rather than one buffer that pretends to change.
	 */
	private readonly uniform: GPUBuffer;
	private readonly rimUniform: GPUBuffer;
	private readonly bindGroup: GPUBindGroup;
	private readonly rimBindGroup: GPUBindGroup;
	private readonly data = new Float32Array(VIEW_BYTES / 4);

	private vertices: GPUBuffer | null = null;
	private indices: GPUBuffer | null = null;
	private lines: GPUBuffer | null = null;
	private triangleCount = 0;
	private lineCount = 0;
	private depth: GPUTexture | null = null;

	/** What the frame clears to where no ground covers it. */
	background: readonly [number, number, number] = [0.027, 0.039, 0.055];

	constructor(ctx: GpuContext) {
		this.ctx = ctx;
		const { device, format } = ctx;
		const module = device.createShaderModule({ code: PATCH_SHADER });
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
			size: VIEW_BYTES,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		this.bindGroup = device.createBindGroup({
			layout,
			entries: [{ binding: 0, resource: { buffer: this.uniform } }],
		});
		this.rimUniform = device.createBuffer({
			size: VIEW_BYTES,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		this.rimBindGroup = device.createBindGroup({
			layout,
			entries: [{ binding: 0, resource: { buffer: this.rimUniform } }],
		});

		const buffers: GPUVertexBufferLayout[] = [
			{
				arrayStride: PATCH_STRIDE * 4,
				attributes: [
					{ shaderLocation: 0, offset: 0, format: "float32x3" },
					{ shaderLocation: 1, offset: 12, format: "float32x3" },
					{ shaderLocation: 2, offset: 24, format: "float32" },
					{ shaderLocation: 3, offset: 28, format: "float32" },
					{ shaderLocation: 4, offset: 32, format: "float32" },
				],
			},
		];
		const pipelineLayout = device.createPipelineLayout({
			bindGroupLayouts: [layout],
		});
		const make = (topology: GPUPrimitiveTopology): GPURenderPipeline =>
			device.createRenderPipeline({
				layout: pipelineLayout,
				vertex: { module, entryPoint: "vertexMain", buffers },
				fragment: {
					module,
					entryPoint: "fragmentMain",
					targets: [{ format }],
				},
				// **No culling.** A preview is turned over and looked at from
				// under, and a patch seen from below is a legitimate way to read
				// what the ground does.
				primitive: { topology, cullMode: "none" },
				depthStencil: {
					format: "depth24plus",
					depthWriteEnabled: true,
					depthCompare: "less",
				},
			});
		this.solidPipeline = make("triangle-list");
		this.linePipeline = make("line-list");
	}

	/** Put a freshly built patch on the GPU, dropping whatever was there. */
	upload(patch: PatchGeometry): void {
		const { device } = this.ctx;
		this.vertices?.destroy();
		this.indices?.destroy();
		this.lines?.destroy();
		this.vertices = null;
		this.indices = null;
		this.lines = null;
		this.triangleCount = patch.triangleCount;
		this.lineCount = patch.lines.length;
		if (patch.vertices.length === 0) return;

		this.vertices = device.createBuffer({
			size: patch.vertices.byteLength,
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
		});
		device.queue.writeBuffer(this.vertices, 0, patch.vertices);
		this.indices = device.createBuffer({
			size: patch.indices.byteLength,
			usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
		});
		device.queue.writeBuffer(this.indices, 0, patch.indices);
		if (patch.lines.length > 0) {
			this.lines = device.createBuffer({
				size: patch.lines.byteLength,
				usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
			});
			device.queue.writeBuffer(this.lines, 0, patch.lines);
		}
	}

	/** Draw the patch through one view matrix. */
	draw(viewProj: Float32Array, look: PatchLook): void {
		const { device, context, canvas } = this.ctx;
		if (
			!this.depth ||
			this.depth.width !== canvas.width ||
			this.depth.height !== canvas.height
		) {
			this.depth?.destroy();
			this.depth = device.createTexture({
				size: [canvas.width, canvas.height],
				format: "depth24plus",
				usage: GPUTextureUsage.RENDER_ATTACHMENT,
			});
		}

		this.data.set(viewProj, 0);
		// A light from over the viewer's left shoulder, fixed, so the same
		// setting looks the same whenever it is looked at.
		this.data.set([0.42, 0.78, 0.46, 0], 16);
		this.data.set([look.picture, 0, look.contours ? 1 : 0, 0], 20);
		this.data.set(
			[look.rockLine, look.snowLine, look.rawLow, look.rawHigh],
			24,
		);
		device.queue.writeBuffer(this.uniform, 0, this.data);
		this.data[21] = 1;
		device.queue.writeBuffer(this.rimUniform, 0, this.data);
		this.data[21] = 0;

		const encoder = device.createCommandEncoder();
		const pass = encoder.beginRenderPass({
			colorAttachments: [
				{
					view: context.getCurrentTexture().createView(),
					clearValue: {
						r: this.background[0],
						g: this.background[1],
						b: this.background[2],
						a: 1,
					},
					loadOp: "clear",
					storeOp: "store",
				},
			],
			depthStencilAttachment: {
				view: this.depth.createView(),
				depthClearValue: 1,
				depthLoadOp: "clear",
				depthStoreOp: "store",
			},
		});
		if (this.vertices && this.indices) {
			pass.setBindGroup(0, this.bindGroup);
			pass.setVertexBuffer(0, this.vertices);
			if (look.surface !== "wire") {
				pass.setPipeline(this.solidPipeline);
				pass.setIndexBuffer(this.indices, "uint32");
				pass.drawIndexed(this.triangleCount * 3);
			}
			if (look.surface !== "solid" && this.lines) {
				// The rims are drawn with the mode bit set, which is the one
				// thing the shader reads from a second uniform write.
				this.data[21] = 1;
				device.queue.writeBuffer(
					this.uniform,
					80,
					this.data.subarray(20, 24),
				);
				pass.setPipeline(this.linePipeline);
				pass.setIndexBuffer(this.lines, "uint32");
				pass.drawIndexed(this.lineCount);
				this.data[21] = 0;
			}
		}
		pass.end();
		device.queue.submit([encoder.finish()]);
	}

	dispose(): void {
		this.vertices?.destroy();
		this.indices?.destroy();
		this.lines?.destroy();
		this.depth?.destroy();
		this.uniform.destroy();
		this.rimUniform.destroy();
	}
}
