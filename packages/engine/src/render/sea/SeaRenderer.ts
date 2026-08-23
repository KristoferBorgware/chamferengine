import type { ChunkSelection } from "../../generation/chunk/selectChunks.js";
import type { Frame } from "../Frame.js";
import type { GpuContext } from "../gpu/GpuContext.js";
import type { PassLayer } from "../PassLayer.js";
import { ChunkAddress } from "../../generation/chunk/ChunkAddress.js";
import { Vec3 } from "../../math/Vec3.js";
import { SEA_SHADER } from "./SEA_SHADER.js";
import type { SunViews } from "../light/SunViews.js";
import type { SunShadow } from "../light/SunShadow.js";
import { SEA_STRIDE, seaPatch } from "./seaPatch.js";
import { joinPath } from "../../addressing/lattice/joinPath.js";
import { latticePosition } from "../../addressing/lattice/latticePosition.js";
import { wireIndices } from "./wireIndices.js";

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

	/**
	 * How much slope a fragment is given below what a vertex can carry.
	 *
	 * A vertex stands every few metres, so the geometry stops at a wave a few
	 * times that and the water between two crests is a sheet of glass. This is
	 * how much of the missing metre-scale texture the shading puts back.
	 */
	ripple: number;

	/**
	 * How far the swell's own height rises and falls across the ocean.
	 *
	 * `0` runs one height everywhere. `0.5` leaves the calmest stretches half
	 * as tall as the roughest, and the roughest keep the height that was
	 * asked for.
	 */
	grouping: number;

	/** The color of water a look barely enters, and of water it does not leave. */
	shallow: readonly [number, number, number];
	deep: readonly [number, number, number];
}

/** Placement and look, then the three colors, then the two detail knobs. */
const SEA_BYTES = 16 * 8;

/** Three corner directions an instance carries. */
const INSTANCE_FLOATS = 9;

/** One mesh, and the lines that show it. */
interface Patch {
	vertices: GPUBuffer;
	indices: GPUBuffer;
	count: number;

	/** Where the curtain starts, which is where the surface stops. */
	surfaceCount: number;

	wire: GPUBuffer;
	wireCount: number;
}

/**
 * The finest a sea patch is ever cut, in pieces per chunk side.
 *
 * **Water does not need the resolution the ground does.** A chunk is 64 m at
 * the shipped settings and the default swell runs 45 m between crests, so 16
 * pieces put a vertex every 4 m -- eleven samples across a wave, and three
 * across the narrowest octave of one. Cutting to the block grid instead would
 * cost 4,096 triangles a chunk to draw the same curve, and everything narrower
 * than three vertices is a slope the fragment shader adds rather than
 * geometry.
 */
const FINEST = 16;

/**
 * The sea: a layer of the world at sea level, chunked like the terrain.
 *
 * **Sea level is a radius, so the sea is a sphere, and that sphere is cut into
 * the same triangles everything else is.** Each chunk the terrain selected
 * gets a patch of water at the level of detail the terrain chose for it, which
 * is what makes the water finer underfoot than at the horizon without anything
 * here deciding it a second time.
 *
 * A patch is the same shape for every chunk at a level, so the meshes are
 * built once per level and a chunk is one instance carrying three corner
 * directions. The whole ocean in view is a handful of instanced draws.
 *
 * What it does not do is hold water anywhere but at sea level. A lake up a
 * mountain or a river running down one is a body with its own surface, and
 * those stay blocks; this is the one surface the whole planet shares.
 */
export class SeaRenderer implements PassLayer {
	private readonly ctx: GpuContext;
	private readonly pipeline: GPURenderPipeline;
	private readonly wirePipeline: GPURenderPipeline;
	private readonly uniform: GPUBuffer;
	private readonly bindGroup: GPUBindGroup;
	private readonly data = new Float32Array(SEA_BYTES / 4);
	private readonly depth: number;

	/** One mesh per number of pieces a chunk side is cut into. */
	private readonly patches = new Map<number, Patch>();

	/** Corner directions, worked out once per chunk and kept. */
	private readonly corners = new Map<number, Float32Array>();

	/** What to draw this frame: where each group of patches starts. */
	private groups: { steps: number; offset: number; count: number }[] = [];
	private instances = new Float32Array(0);
	private instanceBuffer: GPUBuffer | null = null;

	/** Whether the sea is drawn at all. */
	visible = true;

	/**
	 * Draw the sea as its own mesh instead of as a surface.
	 *
	 * The mesh is what decides how a wave is shaped, and a filled surface
	 * hides it: this is how to see where the chunks fall, how much finer the
	 * near ones are cut than the far ones, and whether a wavelength has the
	 * vertices to be a wave rather than noise.
	 */
	wireframe = false;

	/** Seconds the waves have been travelling. */
	time = 0;

	/** Where the camera stands, and how far it can see from there. */
	eye = new Vec3(0, 0, 1);
	horizon = 0.2;

	/** What the sky is doing, which is what the water reflects at the horizon. */
	sky: readonly [number, number, number] = [0.46, 0.62, 0.82];

	/** The radius the sea's own surface sits at. */
	radius: number;

	look: SeaLook;

	/** How many chunks of water the last frame drew. */
	drawn = 0;

	/**
	 * The height map the water walks toward the sun, shared with the ground.
	 *
	 * The sea sits at sea level, which is the lowest thing on the planet, so
	 * it is in the shade of anything at all -- and a headland's shadow that
	 * stopped at the shoreline would stop exactly where a person standing on
	 * a beach is looking.
	 */
	private readonly shadow: SunShadow;

	/** The sun's own view of what stands near, shared with the ground. */
	private readonly sunViews: SunViews;

	constructor(
		ctx: GpuContext,
		radius: number,
		depth: number,
		look: SeaLook,
		shadow: SunShadow,
		sunViews: SunViews,
	) {
		this.ctx = ctx;
		this.radius = radius;
		this.depth = depth;
		this.look = look;
		this.shadow = shadow;
		this.sunViews = sunViews;
		const { device, sceneFormat: format } = ctx;

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
		const layout = device.createPipelineLayout({
			bindGroupLayouts: [
				frameLayout,
				seaLayout,
				shadow.layout,
				sunViews.layout,
			],
		});
		const vertex: GPUVertexState = {
			module,
			entryPoint: "vertexMain",
			buffers: [
				{
					arrayStride: SEA_STRIDE * 4,
					attributes: [
						{ shaderLocation: 0, offset: 0, format: "float32x3" },
					],
				},
				{
					arrayStride: INSTANCE_FLOATS * 4,
					stepMode: "instance",
					attributes: [
						{ shaderLocation: 1, offset: 0, format: "float32x3" },
						{ shaderLocation: 2, offset: 12, format: "float32x3" },
						{ shaderLocation: 3, offset: 24, format: "float32x3" },
					],
				},
			],
		};
		const blend: GPUBlendState = {
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
		};
		this.pipeline = device.createRenderPipeline({
			layout,
			vertex,
			fragment: {
				module,
				entryPoint: "fragmentMain",
				targets: [{ format, blend }],
			},
			// Both sides: the surface is drawn from under it as well as over.
			primitive: { topology: "triangle-list", cullMode: "none" },
			depthStencil: {
				format: "depth32float",
				// **The sea writes depth.** It is drawn before the clouds,
				// and without this a cloud on the far side of the water --
				// under the horizon, or behind the planet -- draws straight
				// through it.
				depthWriteEnabled: true,
				depthCompare: "less",
			},
		});
		this.wirePipeline = device.createRenderPipeline({
			layout,
			vertex,
			fragment: {
				module,
				entryPoint: "wireMain",
				targets: [{ format, blend }],
			},
			primitive: { topology: "line-list" },
			depthStencil: {
				format: "depth32float",
				depthWriteEnabled: false,
				depthCompare: "less",
			},
		});
	}

	/** The mesh for a chunk side cut into `steps`, built the first time. */
	private patchFor(steps: number): Patch {
		const held = this.patches.get(steps);
		if (held) return held;
		const { device } = this.ctx;
		const { vertices, indices, surfaceIndices } = seaPatch(steps);
		// The lines show the surface and never the curtain: a curtain is
		// there to fill a slit, and drawing it doubles every rim.
		const lines = wireIndices(indices.subarray(0, surfaceIndices));
		const upload = (
			data: Float32Array<ArrayBuffer> | Uint32Array<ArrayBuffer>,
			usage: number,
		): GPUBuffer => {
			const buffer = device.createBuffer({
				size: data.byteLength,
				usage: usage | GPUBufferUsage.COPY_DST,
			});
			device.queue.writeBuffer(buffer, 0, data);
			return buffer;
		};
		const built: Patch = {
			vertices: upload(vertices, GPUBufferUsage.VERTEX),
			indices: upload(indices, GPUBufferUsage.INDEX),
			count: indices.length,
			surfaceCount: surfaceIndices,
			wire: upload(lines, GPUBufferUsage.INDEX),
			wireCount: lines.length,
		};
		this.patches.set(steps, built);
		return built;
	}

	/** Where a chunk's three corners point, worked out once and kept. */
	private cornersOf(key: number, chunkLevel: number): Float32Array {
		const id = chunkLevel * 2 ** 40 + key;
		const held = this.corners.get(id);
		if (held) return held;
		const address = ChunkAddress.fromKey(key, chunkLevel);
		const n = 1 << this.depth;
		const m = 1 << (this.depth - chunkLevel);
		const out = new Float32Array(INSTANCE_FLOATS);
		let write = 0;
		for (const [q, r] of [
			[0, 0],
			[m, 0],
			[0, m],
		] as const) {
			const [i, j] = joinPath(address.path, q, r, this.depth);
			const p = latticePosition(address.face, n, i, j);
			out[write++] = p.x;
			out[write++] = p.y;
			out[write++] = p.z;
		}
		this.corners.set(id, out);
		return out;
	}

	/**
	 * Take the chunks the terrain selected, and cut water to match.
	 *
	 * The caller decides which chunks hold any sea at all -- it is the one
	 * with the map -- and the level each is drawn at is the terrain's, not a
	 * second opinion about the same distance.
	 */
	setChunks(selections: readonly ChunkSelection[]): void {
		const wanted = selections.length * INSTANCE_FLOATS;
		if (this.instances.length < wanted)
			this.instances = new Float32Array(Math.max(wanted, 256));

		// Grouped by how finely they are cut, because that is what decides
		// which mesh draws them, and one draw per group is the whole cost.
		const bySteps = new Map<number, ChunkSelection[]>();
		for (const selection of selections) {
			const full = 1 << (this.depth - selection.chunkLevel);
			const steps = Math.min(FINEST, Math.max(1, full >> selection.lod));
			const bucket = bySteps.get(steps);
			if (bucket) bucket.push(selection);
			else bySteps.set(steps, [selection]);
		}

		this.groups = [];
		let at = 0;
		for (const [steps, bucket] of bySteps) {
			this.groups.push({ steps, offset: at, count: bucket.length });
			for (const selection of bucket) {
				this.instances.set(
					this.cornersOf(selection.key, selection.chunkLevel),
					at * INSTANCE_FLOATS,
				);
				at++;
			}
		}
		this.drawn = at;
		if (at === 0) return;

		const bytes = at * INSTANCE_FLOATS * 4;
		if (!this.instanceBuffer || this.instanceBuffer.size < bytes) {
			this.instanceBuffer?.destroy();
			this.instanceBuffer = this.ctx.device.createBuffer({
				size: Math.max(bytes, 4096),
				usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
			});
		}
		this.ctx.device.queue.writeBuffer(
			this.instanceBuffer,
			0,
			this.instances,
			0,
			at * INSTANCE_FLOATS,
		);
	}

	after(pass: GPURenderPassEncoder, frame: Frame): void {
		if (!this.visible || this.drawn === 0 || !this.instanceBuffer) return;

		const up = this.eye.normalize();
		const look = this.look;
		// **The swell flattens over a distance measured in wavelengths**, so
		// moving the crests apart moves the fade out with them rather than
		// leaving a long swell flat where a short one was still resolved.
		const near = look.waveScale * 4;
		const far = look.waveScale * 16;
		this.data.set([up.x, up.y, up.z, this.radius], 0);
		this.data.set([this.horizon, this.time, near, far], 4);
		this.data.set(
			[look.waveHeight, look.waveScale, look.waveSpeed, look.foam],
			8,
		);
		this.data.set([look.opacity, look.glint, look.clarity, look.chop], 12);
		this.data.set([...look.shallow, 1], 16);
		this.data.set([...look.deep, 1], 20);
		this.data.set([...this.sky, 1], 24);
		this.data.set([look.ripple, look.grouping, 0, 0], 28);
		this.ctx.device.queue.writeBuffer(this.uniform, 0, this.data);

		pass.setPipeline(this.wireframe ? this.wirePipeline : this.pipeline);
		pass.setBindGroup(1, this.bindGroup);
		// Set here rather than relied on: whatever drew before this may have
		// had a shorter pipeline layout, which drops every binding past its
		// own end.
		pass.setBindGroup(2, this.shadow.bindGroup);
		pass.setBindGroup(3, this.sunViews.bindGroup);

		/** Bind one group's mesh and its slice of the instance buffer. */
		const bind = (group: (typeof this.groups)[number]): Patch => {
			const patch = this.patchFor(group.steps);
			pass.setVertexBuffer(0, patch.vertices);
			pass.setVertexBuffer(
				1,
				this.instanceBuffer,
				group.offset * INSTANCE_FLOATS * 4,
			);
			return patch;
		};

		if (this.wireframe) {
			for (const group of this.groups) {
				const patch = bind(group);
				pass.setIndexBuffer(patch.wire, "uint32");
				pass.drawIndexed(patch.wireCount, group.count);
			}
			void frame;
			return;
		}

		// **Every surface, then every curtain.** The surface writes depth, so
		// a curtain drawn after all of it is thrown away by the depth test
		// wherever water already covers the pixel, and survives only in the
		// slits between two patches cut at different spacings. Interleaving
		// the two would let a curtain blend under a surface drawn later, and
		// a second layer of translucent water is a dark band along every
		// chunk edge.
		for (const group of this.groups) {
			const patch = bind(group);
			pass.setIndexBuffer(patch.indices, "uint32");
			pass.drawIndexed(patch.surfaceCount, group.count);
		}
		for (const group of this.groups) {
			const patch = bind(group);
			pass.setIndexBuffer(patch.indices, "uint32");
			pass.drawIndexed(
				patch.count - patch.surfaceCount,
				group.count,
				patch.surfaceCount,
			);
		}
		void frame;
	}

	/** Throw the GPU buffers away. */
	destroy(): void {
		for (const patch of this.patches.values()) {
			patch.vertices.destroy();
			patch.indices.destroy();
			patch.wire.destroy();
		}
		this.patches.clear();
		this.instanceBuffer?.destroy();
		this.uniform.destroy();
	}
}
