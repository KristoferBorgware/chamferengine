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

	/** Which control layer a picture of one layer draws. */
	readonly layer: "continent" | "erosion" | "peaks" | "carve";

	/** The two elevations that cut land into three materials, in metres. */
	readonly rockLine: number;
	readonly snowLine: number;

	/** What the field reached in this patch, which Raw is drawn against. */
	readonly rawLow: number;
	readonly rawHigh: number;

	/**
	 * The ground this patch reached in metres, which Height is drawn against.
	 *
	 * **A fixed scale in metres is a picture that is white wherever the world
	 * is tall.** Height used to run a `-400 m` to `400 m` ramp whatever stood
	 * there, so on the shipped world -- which reaches `1,100 m` -- everything
	 * above the rock line was one flat white and the picture said nothing about
	 * the shape of it. It reads the patch's own range now, the way Raw already
	 * did.
	 */
	readonly low: number;
	readonly high: number;

	/**
	 * Which way the camera looks from, in the patch's own frame.
	 *
	 * One of the lights comes from here. A patch turned away from the fixed
	 * lights would otherwise be a silhouette, and turning it is the whole way
	 * this preview is read.
	 *
	 * **A direction, not a place.** A light standing at the camera is one that
	 * can be walked into -- zoom until the eye is inside a hillside and it
	 * lights the rock from within, and how far off it stands depends on how
	 * wide the patch is. This is normalised here and lifted above the eye,
	 * because the camera sits low and a light exactly at it is one more thing
	 * shining sideways at the walls.
	 */
	readonly eye: readonly [number, number, number];
}

/**
 * What one upload carries.
 *
 * The vertices every time, the indices only when the patch moved: a
 * {@link PatchGeometry} satisfies this, and so does a fill of a layout that is
 * being kept. Nothing for the indices means the ones already uploaded still
 * describe this mesh.
 */
export interface PatchUpload {
	readonly vertices: Float32Array<ArrayBuffer>;
	readonly indices: Uint32Array<ArrayBuffer> | null;
	readonly lines: Uint32Array<ArrayBuffer> | null;
	readonly triangleCount: number;

	/**
	 * How many vertices the ground drew, on a mesh that is not indexed.
	 *
	 * **A column mesh shares no vertex, so there is nothing for an index to
	 * name.** Every face of it is flat and carries its own plane as its normal,
	 * where a surface patch shares one vertex round a cell -- so the two are
	 * drawn the same way and buffered differently. When this is set the draw is
	 * a plain `draw`, and the sea's own run follows the ground's.
	 */
	readonly groundVertices?: number;

	/** How many the sea drew, blended after every opaque one. */
	readonly waterVertices?: number;
}

/**
 * A matrix, the light, the mode, the numbers the pictures read, and the light
 * that follows the camera.
 */
const VIEW_BYTES = 64 + 16 + 16 + 16 + 16 + 16;

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
	private readonly seaPipeline: GPURenderPipeline;
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
	private readonly seaUniform: GPUBuffer;
	private readonly bindGroup: GPUBindGroup;
	private readonly rimBindGroup: GPUBindGroup;
	private readonly seaBindGroup: GPUBindGroup;
	private readonly data = new Float32Array(VIEW_BYTES / 4);

	private vertices: GPUBuffer | null = null;
	private indices: GPUBuffer | null = null;
	private lines: GPUBuffer | null = null;
	private triangleCount = 0;
	private lineCount = 0;
	private groundVertices = 0;
	private waterVertices = 0;
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
		this.seaUniform = device.createBuffer({
			size: VIEW_BYTES,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		this.seaBindGroup = device.createBindGroup({
			layout,
			entries: [{ binding: 0, resource: { buffer: this.seaUniform } }],
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
					{ shaderLocation: 5, offset: 36, format: "float32" },
					{ shaderLocation: 6, offset: 40, format: "float32" },
					{ shaderLocation: 7, offset: 44, format: "float32" },
					{ shaderLocation: 8, offset: 48, format: "float32" },
				],
			},
		];
		const pipelineLayout = device.createPipelineLayout({
			bindGroupLayouts: [layout],
		});
		const make = (
			topology: GPUPrimitiveTopology,
			sea = false,
		): GPURenderPipeline =>
			device.createRenderPipeline({
				layout: pipelineLayout,
				vertex: { module, entryPoint: "vertexMain", buffers },
				fragment: {
					module,
					entryPoint: "fragmentMain",
					targets: [
						sea
							? {
									format,
									blend: {
										color: {
											srcFactor: "src-alpha",
											dstFactor: "one-minus-src-alpha",
										},
										alpha: {
											srcFactor: "one",
											dstFactor: "one-minus-src-alpha",
										},
									},
								}
							: { format },
					],
				},
				// **No culling.** A preview is turned over and looked at from
				// under, and a patch seen from below is a legitimate way to read
				// what the ground does.
				primitive: { topology, cullMode: "none" },
				depthStencil: {
					format: "depth32float",
					// **The sea tests depth and does not write it.** Two water
					// faces on one pixel -- a sheet and the curtain hung off the
					// rim under it -- would otherwise blend one over the other
					// and draw a dark band round every coast.
					depthWriteEnabled: !sea,
					depthCompare: "less",
				},
			});
		this.solidPipeline = make("triangle-list");
		this.linePipeline = make("line-list");
		this.seaPipeline = make("triangle-list", true);
	}

	/** Put a freshly built patch on the GPU, dropping whatever was there. */
	upload(patch: PatchUpload): void {
		const { device } = this.ctx;
		this.vertices?.destroy();
		this.vertices = null;
		this.triangleCount = patch.triangleCount;
		this.groundVertices = patch.groundVertices ?? 0;
		this.waterVertices = patch.waterVertices ?? 0;
		// **Indices only when the patch moved.** A patch whose ground changed
		// draws the same triangles between the same vertices -- the shape of a
		// patch is where it stands, not what stands on it -- so the index
		// buffers are left alone and only the vertices are written again.
		if (patch.indices) {
			this.indices?.destroy();
			this.indices = null;
			if (patch.indices.length > 0) {
				this.indices = device.createBuffer({
					size: patch.indices.byteLength,
					usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
				});
				device.queue.writeBuffer(this.indices, 0, patch.indices);
			}
		}
		if (patch.lines) {
			this.lines?.destroy();
			this.lines = null;
			this.lineCount = patch.lines.length;
			if (patch.lines.length > 0) {
				this.lines = device.createBuffer({
					size: patch.lines.byteLength,
					usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
				});
				device.queue.writeBuffer(this.lines, 0, patch.lines);
			}
		}
		if (patch.vertices.length === 0) return;

		this.vertices = device.createBuffer({
			size: patch.vertices.byteLength,
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
		});
		device.queue.writeBuffer(this.vertices, 0, patch.vertices);
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
				format: "depth32float",
				usage: GPUTextureUsage.RENDER_ATTACHMENT,
			});
		}

		this.data.set(viewProj, 0);
		// **A high sun from over the viewer's left shoulder**, fixed, so the
		// same setting looks the same whenever it is looked at. Left, because
		// relief is read the way it is drawn on a map, with the light over the
		// reader's shoulder.
		//
		// **It used to sit at 35 degrees, and that was right for a different
		// picture.** A patch drawn one hexagon per map cell is a smooth
		// surface, where the only cue is slope and a low sun is what turns the
		// light across an 11-degree hillside -- the median of this world's
		// land. A patch drawn as columns of blocks is not that: its faces are
		// caps and vertical walls, ninety degrees apart, and what makes the
		// structure legible is that a cap is plainly brighter than a wall. A
		// sun near the horizon lights the walls and leaves the caps flat, which
		// is a landscape with the shading of a wall of bricks.
		this.data.set([-0.62, 1.0, 0.16, 0], 16);
		this.data.set(
			[
				look.picture,
				0,
				look.layer === "carve"
					? 3
					: look.layer === "peaks"
						? 2
						: look.layer === "erosion"
							? 1
							: 0,
				0,
			],
			20,
		);
		this.data.set([look.low, look.high, 0, 0], 28);
		// Lifted well above the eye, then normalised, so it is the same light at
		// every zoom and on a patch of any width.
		const lift = 1.2;
		const [ex, ey, ez] = look.eye;
		const len = Math.sqrt(ex * ex + ez * ez) || 1;
		const hx = ex / len;
		const hy = ey / len + lift;
		const hz = ez / len;
		const head = Math.sqrt(hx * hx + hy * hy + hz * hz) || 1;
		this.data.set([hx / head, hy / head, hz / head, 0], 32);
		this.data.set(
			[look.rockLine, look.snowLine, look.rawLow, look.rawHigh],
			24,
		);
		device.queue.writeBuffer(this.uniform, 0, this.data);
		this.data[21] = 1;
		device.queue.writeBuffer(this.rimUniform, 0, this.data);
		this.data[21] = 0;
		this.data[23] = 1;
		device.queue.writeBuffer(this.seaUniform, 0, this.data);
		this.data[23] = 0;

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
		if (this.vertices && (this.indices || this.groundVertices > 0)) {
			pass.setBindGroup(0, this.bindGroup);
			pass.setVertexBuffer(0, this.vertices);
			if (look.surface !== "wire") {
				pass.setPipeline(this.solidPipeline);
				if (this.groundVertices > 0) {
					pass.draw(this.groundVertices);
				} else if (this.indices) {
					pass.setIndexBuffer(this.indices, "uint32");
					pass.drawIndexed(this.triangleCount * 3);
				}
			}
			if (look.surface !== "solid" && this.lines) {
				// **The rims are drawn through their own buffer, not through a
				// second write to this one.** A queued write lands before the
				// whole submission runs, so writing the mode bit here would
				// reach the surface draw above as well and paint the whole patch
				// flat blue. That is what `rimUniform` is for, and binding it is
				// the half that was missing.
				pass.setBindGroup(0, this.rimBindGroup);
				pass.setPipeline(this.linePipeline);
				pass.setIndexBuffer(this.lines, "uint32");
				pass.drawIndexed(this.lineCount);
			}
			// **The water last, and through its own uniform.** It is blended,
			// so every opaque triangle has to be behind it in the depth buffer
			// before it is drawn; and a uniform cannot be rewritten between two
			// draws of one pass, because a queued write lands before the whole
			// submission runs.
			if (look.surface !== "wire" && this.waterVertices > 0) {
				pass.setBindGroup(0, this.seaBindGroup);
				pass.setPipeline(this.seaPipeline);
				pass.draw(this.waterVertices, 1, this.groundVertices);
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
		this.seaUniform.destroy();
	}
}
