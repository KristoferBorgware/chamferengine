import type { Frame } from "../Frame.js";
import type { GpuContext } from "../gpu/GpuContext.js";
import type { PassLayer } from "../PassLayer.js";
import { Vec3 } from "../../math/Vec3.js";
import { SEA_SHADER } from "./SEA_SHADER.js";
import { SEA_STRIDE, seaDisc } from "./seaDisc.js";

/** How the sea looks, all of it live. */
export interface SeaLook {
	/** Metres from the trough of a wave to its crest. */
	waveHeight: number;

	/** Metres between one crest and the next. */
	waveScale: number;

	/** How fast the waves travel. */
	waveSpeed: number;

	/** How narrow a crest is against its trough. `1` is a plain sine. */
	chop: number;

	/** How much white sits on a crest, `0` for none. */
	foam: number;

	/** How solid the water reads where a look has barely entered it. */
	opacity: number;

	/** How many metres of water a look reaches through before it stops. */
	clarity: number;

	/** How hard the sun's highlight is. */
	glint: number;

	/** The color of water a look barely enters, and of water it does not leave. */
	shallow: readonly [number, number, number];
	deep: readonly [number, number, number];
}

/** Five vectors of placement and look, then the three colors. */
const SEA_BYTES = 16 * 8;

/**
 * The sea, as one shell around the camera rather than a body of blocks.
 *
 * **Sea level is a radius, so the sea is a sphere**, and a sphere seen from a
 * point on it is a disc reaching to the horizon. That disc is built once and
 * carried by the vertex shader: where the camera stands and how far it can see
 * are two uniforms, so walking moves the sea without touching a buffer, and
 * the whole ocean is one draw call at any altitude.
 *
 * What it does not do is hold water anywhere but at sea level. A lake up a
 * mountain or a river running down one is a body with its own surface, and
 * those stay blocks; this is the one surface the whole planet shares.
 */
export class SeaRenderer implements PassLayer {
	private readonly ctx: GpuContext;
	private readonly pipeline: GPURenderPipeline;
	private readonly uniform: GPUBuffer;
	private readonly bindGroup: GPUBindGroup;
	private readonly data = new Float32Array(SEA_BYTES / 4);
	private readonly vertexBuffer: GPUBuffer;
	private readonly indexBuffer: GPUBuffer;
	private readonly indexCount: number;

	/** Whether the sea is drawn at all. */
	visible = true;

	/** Seconds the waves have been travelling. */
	time = 0;

	/** Where the camera stands, so the shell can be laid out under it. */
	eye = new Vec3(0, 0, 1);

	/** How far the shell reaches from there, in radians of arc. */
	reach = 0.2;

	/** What the sky is doing, which is what the water reflects at the horizon. */
	sky: readonly [number, number, number] = [0.46, 0.62, 0.82];

	look: SeaLook;

	constructor(ctx: GpuContext, radius: number, look: SeaLook) {
		this.ctx = ctx;
		this.radius = radius;
		this.look = look;
		const { device, format } = ctx;

		const { vertices, indices } = seaDisc(96, 128);
		this.indexCount = indices.length;
		this.vertexBuffer = device.createBuffer({
			size: vertices.byteLength,
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
		});
		device.queue.writeBuffer(this.vertexBuffer, 0, vertices);
		this.indexBuffer = device.createBuffer({
			size: indices.byteLength,
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
		const seaLayout = device.createBindGroupLayout({
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
					buffer: { type: "uniform" },
				},
			],
		});
		this.uniform = device.createBuffer({
			size: SEA_BYTES,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		this.bindGroup = device.createBindGroup({
			layout: seaLayout,
			entries: [{ binding: 0, resource: { buffer: this.uniform } }],
		});

		const module = device.createShaderModule({ code: SEA_SHADER });
		this.pipeline = device.createRenderPipeline({
			layout: device.createPipelineLayout({
				bindGroupLayouts: [frameLayout, seaLayout],
			}),
			vertex: {
				module,
				entryPoint: "vertexMain",
				buffers: [
					{
						arrayStride: SEA_STRIDE * 4,
						attributes: [
							{
								shaderLocation: 0,
								offset: 0,
								format: "float32x2",
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
			// Both sides: the surface is drawn from under it as well as over.
			primitive: { topology: "triangle-list", cullMode: "none" },
			depthStencil: {
				format: "depth24plus",
				depthWriteEnabled: false,
				depthCompare: "less",
			},
		});
	}

	/** The radius the sea's own surface sits at. */
	radius: number;

	after(pass: GPURenderPassEncoder, frame: Frame): void {
		if (!this.visible) return;

		// A frame at the camera: radial up, and any two directions across it.
		const up = this.eye.normalize();
		let east = new Vec3(0, 1, 0).cross(up);
		if (east.length() < 1e-6) east = new Vec3(1, 0, 0);
		east = east.normalize();
		const north = up.cross(east).normalize();

		const look = this.look;
		this.data.set([up.x, up.y, up.z, this.radius], 0);
		this.data.set([east.x, east.y, east.z, this.reach], 4);
		this.data.set([north.x, north.y, north.z, this.time], 8);
		this.data.set(
			[look.waveHeight, look.waveScale, look.waveSpeed, look.foam],
			12,
		);
		this.data.set([look.opacity, look.glint, look.clarity, look.chop], 16);
		this.data.set([...look.shallow, 1], 20);
		this.data.set([...look.deep, 1], 24);
		this.data.set([...this.sky, 1], 28);
		this.ctx.device.queue.writeBuffer(this.uniform, 0, this.data);

		pass.setPipeline(this.pipeline);
		pass.setBindGroup(1, this.bindGroup);
		pass.setVertexBuffer(0, this.vertexBuffer);
		pass.setIndexBuffer(this.indexBuffer, "uint32");
		pass.drawIndexed(this.indexCount);
		void frame;
	}

	/** Throw the GPU buffers away. */
	destroy(): void {
		this.vertexBuffer.destroy();
		this.indexBuffer.destroy();
		this.uniform.destroy();
	}
}
