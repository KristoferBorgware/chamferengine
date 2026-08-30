import type { Box } from "../../math/Box.js";
import type { ChunkMesh } from "../../mesh/ChunkMesh.js";
import type { Frame } from "../Frame.js";
import type { Geometry } from "../../mesh/Geometry.js";
import { CHUNK_VERTEX_FLOATS } from "../../mesh/CHUNK_VERTEX_FLOATS.js";
import type { GpuContext } from "../gpu/GpuContext.js";
import type { PassLayer } from "../PassLayer.js";
import { Frustum } from "../../math/Frustum.js";
import { GpuClock } from "../gpu/GpuClock.js";
import type { CloudCaster } from "../light/CloudShadow.js";
import type { PlanetAtmosphere } from "../../sky/ATMOSPHERE.js";
import type { ShadowCaster } from "../light/ShadowCaster.js";
import { CascadeShadow } from "../light/CascadeShadow.js";
import { AtmospherePass } from "../sky/AtmospherePass.js";
import { BloomPass } from "../bloom/BloomPass.js";
import { CloudShadow } from "../light/CloudShadow.js";
import { BlockLightMap } from "../light/BlockLightMap.js";
import type { BlockTextures } from "./BlockTextures.js";
import { LightViews } from "../light/LightViews.js";
import { TonePass } from "../tone/TonePass.js";
import { TERRAIN_SHADER } from "./TERRAIN_SHADER.js";

/** One geometry uploaded, or nothing if it had no triangles. */
interface Buffers {
	readonly vertices: GPUBuffer;
	readonly indices: GPUBuffer;
	readonly count: number;
}

/** One chunk on the GPU: its two buffers and where it sits. */
interface Resident {
	readonly key: number;
	readonly origin: readonly [number, number, number];
	readonly bound: Box;
	readonly uniform: GPUBuffer;
	readonly bindGroup: GPUBindGroup;
	readonly opaque: Buffers | null;
	readonly cutout: Buffers | null;
	readonly water: Buffers | null;
}

/** A matrix, the eye, the sun, the fog, the daylight, the sky, and the moon. */
const FRAME_BYTES = 64 + 16 + 16 + 16 + 16 + 16 + 16;

/** A chunk's origin, padded to the alignment a uniform binding needs. */
const CHUNK_BYTES = 256;

/**
 * Draws meshed chunks, opaque first and water after.
 *
 * The opaque pass writes depth. The water pass tests against that depth and
 * does not write it, so one water surface never hides another, and the sort is
 * per chunk rather than per triangle: a view crosses one water surface 82.3% of
 * the time and generated water has no vertical sides to interpenetrate with.
 */
export class ChunkRenderer implements ShadowCaster {
	private readonly ctx: GpuContext;
	private readonly opaquePipeline: GPURenderPipeline;
	private readonly cutoutPipeline: GPURenderPipeline;
	private readonly waterPipeline: GPURenderPipeline;
	private readonly frameLayout: GPUBindGroupLayout;
	private readonly chunkLayout: GPUBindGroupLayout;
	private readonly frameUniform: GPUBuffer;
	private readonly frameBindGroup: GPUBindGroup;
	private readonly frameData = new Float32Array(FRAME_BYTES / 4);
	private readonly resident = new Map<number, Resident>();
	private depth: GPUTexture | null = null;

	/**
	 * The sun's own view of what stands near the camera.
	 *
	 * The chunks put themselves into it, and anything else that wants a shadow
	 * adds itself to {@link ChunkRenderer.casters}.
	 */
	readonly cascades: CascadeShadow;

	/**
	 * Everything that draws itself into the shadow maps.
	 *
	 * The chunks are always the first of them. A mob, a player or anything
	 * else with geometry joins the list and is drawn into each cascade with
	 * its own pipeline.
	 */
	readonly casters: ShadowCaster[] = [];

	/**
	 * What the sun sees of the clouds, as how much light each beam loses.
	 *
	 * A second thing the sun looks at, and nothing like the first: the decks
	 * sit kilometres up, so no cascade box reaches them, and a cloud is
	 * translucent, so what is recorded is how much of it a beam passes through
	 * rather than how far away the nearest surface is.
	 */
	readonly cloudShadow: CloudShadow;

	/** Everything that draws itself into that cover -- the cloud renderer. */
	readonly cloudCasters: CloudCaster[] = [];

	/**
	 * The cascades, the cloud cover and the light standing in the world, as
	 * one bind group.
	 *
	 * WebGPU guarantees four groups and the world spends all four, so the
	 * three things a surface has to look up share the last one.
	 */
	readonly lightViews: LightViews;

	/**
	 * The light a source in the world casts, as a cube of levels around it.
	 *
	 * Held here because it is bound with the sun's own views, and filled from
	 * outside: what stands where is the world's business, not the renderer's.
	 */
	readonly blockLight: BlockLightMap;

	/** What a pipeline declares as its group 3: the block pictures. */
	private readonly blockLayout: GPUBindGroupLayout;

	/**
	 * One texel of nothing, bound until a bake arrives.
	 *
	 * A pipeline layout names group 3 whether or not there are pictures yet,
	 * and a draw with a group unset is refused -- taking the whole command
	 * buffer with it. Every vertex carries a layer of `-1` until then, so
	 * nothing is ever read out of this.
	 */
	private readonly blankBlocks: GPUBindGroup;

	private blocks: GPUBindGroup | null = null;

	/**
	 * The pictures every chunk reads, or nothing until a bake has loaded.
	 *
	 * Handed in rather than loaded here: fetching is the client's business and
	 * a renderer that fetches is a renderer that cannot be built without a
	 * server.
	 */
	setBlockTextures(textures: BlockTextures | null): void {
		this.blocks = textures
			? this.blockGroup(
					textures.view,
					textures.sampler,
					textures.bandSampler,
				)
			: null;
	}

	private blockGroup(
		view: GPUTextureView,
		sampler: GPUSampler,
		band: GPUSampler,
	): GPUBindGroup {
		return this.ctx.device.createBindGroup({
			layout: this.blockLayout,
			entries: [
				{ binding: 0, resource: view },
				{ binding: 1, resource: sampler },
				{ binding: 2, resource: band },
			],
		});
	}

	/**
	 * The air, marched over the finished frame.
	 *
	 * It owns the image the world is drawn into and the image that comes out
	 * of it, because it is the pass that stands between them. **The depth is
	 * why it is a pass and not a layer**: a layer draws inside the frame's own
	 * render pass, where the depth buffer is an attachment and cannot also be
	 * read, and the air has to know how far away every pixel's surface is.
	 */
	readonly atmosphere: AtmospherePass;

	/** The planet's own air, or null for a world drawn without any. */
	air: PlanetAtmosphere | null = null;

	/**
	 * How many times the canvas the world is drawn at before it is put back.
	 *
	 * **The one antialiasing a world of hard edges answers to.** Nothing here
	 * sets `multisample`, and multisampling would only soften geometry edges
	 * anyway -- most of what aliases on a voxel hillside is the *shading*
	 * across its steps, which only more samples of the whole picture fix. At
	 * `2` every pass inside the frame runs at four times the pixels and the
	 * tone curve averages each block back down.
	 *
	 * `1` is off, and off is exact: the tone pass reads one texel per pixel
	 * with no filtering, so a world that does not ask for this is drawn
	 * exactly as it was before it existed.
	 */
	superSample = 1;

	/**
	 * The radius the ground sits at, for anything that has to put a box on it.
	 *
	 * The cloud shadow box is centred on the ground under the camera rather
	 * than on the camera itself, so it needs to know where that is without
	 * asking the coarse map -- which no longer has a GPU copy here to ask.
	 */
	groundRadius = 0;

	/**
	 * The glare around anything brighter than a screen can show.
	 *
	 * It runs between the air and the tone curve and adds into the air's own
	 * image in place, because what makes a sun read as a sun is not how bright
	 * its disc is -- a screen has one white -- but what that brightness does to
	 * the sky around it.
	 */
	readonly bloom: BloomPass;

	/**
	 * Where the frame is exposed and rolled off on its way to the canvas.
	 *
	 * Everything is drawn into a floating-point image first, so the sun, the
	 * sky and the moon add together without anything over white being lost on
	 * the way.
	 */
	readonly tone: TonePass;

	/** How long the GPU spent on the last pass it would report. */
	readonly clock: GpuClock;

	/**
	 * The box each resident chunk is tested against before it is drawn.
	 *
	 * The box the built geometry actually fits inside, which is a different
	 * question from the one the selection asked before the chunk was built.
	 * Reported so both can be looked at.
	 */
	bounds(): Box[] {
		const out: Box[] = [];
		for (const chunk of this.resident.values()) out.push(chunk.bound);
		return out;
	}

	/** How many resident chunks the last frame actually drew. */
	private lastDrawn = 0;

	/** The color a pass clears to when nothing covers the sky. */
	sky: readonly [number, number, number] = [0.46, 0.62, 0.82];

	/**
	 * Drawn around the terrain: a sky before it, clouds and markers after.
	 *
	 * In order, so a layer added later draws over one added earlier. The
	 * renderer knows only the two moments; what fills them is not its concern.
	 */
	layers: PassLayer[] = [];

	constructor(ctx: GpuContext) {
		this.ctx = ctx;
		const { device, sceneFormat: format } = ctx;
		const module = device.createShaderModule({ code: TERRAIN_SHADER });
		this.atmosphere = new AtmospherePass(ctx);
		this.bloom = new BloomPass(ctx);
		this.tone = new TonePass(ctx);

		const uniformEntry: GPUBindGroupLayoutEntry = {
			binding: 0,
			visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
			buffer: { type: "uniform" },
		};
		this.frameLayout = device.createBindGroupLayout({
			entries: [uniformEntry],
		});
		this.chunkLayout = device.createBindGroupLayout({
			entries: [uniformEntry],
		});
		// **A group of its own, and there was one free.** The frame, the chunk
		// and what lights it spend three; the pictures are the fourth, set
		// once for the pass because every chunk reads the same array.
		this.blockLayout = device.createBindGroupLayout({
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.FRAGMENT,
					texture: { sampleType: "float", viewDimension: "2d-array" },
				},
				{
					binding: 1,
					visibility: GPUShaderStage.FRAGMENT,
					sampler: { type: "filtering" },
				},
				// The same array read without the repeat, for the band over a
				// wall's brink: one brink a wall, however many layers it
				// merged.
				{
					binding: 2,
					visibility: GPUShaderStage.FRAGMENT,
					sampler: { type: "filtering" },
				},
			],
		});
		// **Before the cascades, which need it.** A leaf shadows through the
		// holes in its own picture or a tree throws a solid cube, so the sun's
		// own pass reads the same array the world pass does.
		this.cascades = new CascadeShadow(
			ctx,
			this.chunkLayout,
			this.blockLayout,
			1024,
		);
		this.cloudShadow = new CloudShadow(ctx, 1024);
		this.blockLight = new BlockLightMap(ctx);
		this.blankBlocks = this.blockGroup(
			device
				.createTexture({
					size: [1, 1, 1],
					format: "rgba8unorm-srgb",
					usage: GPUTextureUsage.TEXTURE_BINDING,
				})
				.createView({ dimension: "2d-array" }),
			device.createSampler(),
			device.createSampler(),
		);
		this.lightViews = new LightViews(
			ctx,
			this.cascades,
			this.cloudShadow,
			this.blockLight,
		);
		this.casters.push(this);

		const common = {
			layout: device.createPipelineLayout({
				bindGroupLayouts: [
					this.frameLayout,
					this.chunkLayout,
					this.lightViews.layout,
					this.blockLayout,
				],
			}),
			vertex: {
				module,
				entryPoint: "vertexMain",
				buffers: [
					{
						arrayStride: CHUNK_VERTEX_FLOATS * 4,
						attributes: [
							{
								shaderLocation: 0,
								offset: 0,
								format: "float32x3",
							},
							{
								shaderLocation: 1,
								offset: 12,
								format: "float32x3",
							},
							{
								shaderLocation: 2,
								offset: 24,
								format: "float32",
							},
							{
								shaderLocation: 3,
								offset: 28,
								format: "float32x2",
							},
							{
								shaderLocation: 4,
								offset: 36,
								format: "float32x2",
							},
						],
					},
				],
			},
			primitive: { topology: "triangle-list", cullMode: "back" },
		} as const satisfies Partial<GPURenderPipelineDescriptor>;

		this.opaquePipeline = device.createRenderPipeline({
			...common,
			fragment: {
				module,
				entryPoint: "fragmentMain",
				targets: [{ format }],
			},
			depthStencil: {
				format: "depth32float",
				depthWriteEnabled: true,
				depthCompare: "less",
			},
		});

		// **Depth like the opaque pass, a fragment stage like no other pass.**
		// A leaf is either there or it is not, so the pixels its picture has
		// holes in are thrown away whole and everything left writes depth --
		// which is what lets a canopy shadow, occlude and sort the way stone
		// does, with no back-to-front order to keep.
		//
		// **And both sides, because a leaf's face is drawn once.** Two cells
		// sharing a boundary would each draw it and culling would throw one
		// away from any given eye -- two sets of vertices to rasterise
		// exactly as many fragments. The mesher emits one and this shows it
		// from either side, which is why the canopy costs what it does and
		// not twice that.
		this.cutoutPipeline = device.createRenderPipeline({
			...common,
			primitive: { topology: "triangle-list", cullMode: "none" },
			fragment: {
				module,
				entryPoint: "cutoutMain",
				targets: [{ format }],
			},
			depthStencil: {
				format: "depth32float",
				depthWriteEnabled: true,
				depthCompare: "less",
			},
		});

		this.waterPipeline = device.createRenderPipeline({
			...common,
			fragment: {
				module,
				entryPoint: "waterMain",
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
			// Reads depth and does not write it, so a water surface behind
			// another is not hidden by it.
			depthStencil: {
				format: "depth32float",
				depthWriteEnabled: false,
				depthCompare: "less",
			},
		});

		this.frameUniform = device.createBuffer({
			size: FRAME_BYTES,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		this.frameBindGroup = device.createBindGroup({
			layout: this.frameLayout,
			entries: [{ binding: 0, resource: { buffer: this.frameUniform } }],
		});
		this.clock = new GpuClock(device);
	}

	get count(): number {
		return this.resident.size;
	}

	/** How many of them the last frame drew. */
	get drawn(): number {
		return this.lastDrawn;
	}

	has(key: number): boolean {
		return this.resident.has(key);
	}

	/** Put a meshed chunk on the GPU, replacing any copy already there. */
	upload(mesh: ChunkMesh): void {
		this.drop(mesh.key);
		const { device } = this.ctx;
		const uniform = device.createBuffer({
			size: CHUNK_BYTES,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		device.queue.writeBuffer(
			uniform,
			0,
			new Float32Array([mesh.origin.x, mesh.origin.y, mesh.origin.z, 0]),
		);
		this.resident.set(mesh.key, {
			key: mesh.key,
			origin: [mesh.origin.x, mesh.origin.y, mesh.origin.z],
			bound: mesh.bound,
			uniform,
			bindGroup: device.createBindGroup({
				layout: this.chunkLayout,
				entries: [{ binding: 0, resource: { buffer: uniform } }],
			}),
			opaque: this.uploadGeometry(mesh.opaque),
			cutout: this.uploadGeometry(mesh.cutout),
			water: this.uploadGeometry(mesh.translucent),
		});
	}

	/** Take a chunk off the GPU. */
	drop(key: number): void {
		const held = this.resident.get(key);
		if (!held) return;
		held.uniform.destroy();
		held.opaque?.vertices.destroy();
		held.opaque?.indices.destroy();
		held.cutout?.vertices.destroy();
		held.cutout?.indices.destroy();
		held.water?.vertices.destroy();
		held.water?.indices.destroy();
		this.resident.delete(key);
	}

	/** Take every chunk off the GPU. */
	clear(): void {
		for (const key of [...this.resident.keys()]) this.drop(key);
	}

	/**
	 * Every chunk the sun can see, drawn into one cascade.
	 *
	 * Not the chunks the camera can see: a wall standing behind the viewer
	 * still throws its shadow into the view. What is tested instead is the
	 * column of world the cascade's box sweeps out along the light.
	 */
	castShadow(pass: GPURenderPassEncoder, cascade: number): void {
		const box = this.cascades.boxOf(cascade);
		const lit: Resident[] = [];
		for (const chunk of this.resident.values())
			if (box.holds(chunk.bound)) lit.push(chunk);
		for (const chunk of lit) draw(pass, chunk, chunk.opaque);

		// The canopy, through the holes in its own picture. The pictures are
		// bound here rather than by the pass, because this is the only caster
		// that reads them -- and the plain pipeline goes back on afterwards so
		// a caster drawn after this one still finds what the pass set.
		let any = false;
		for (const chunk of lit) {
			if (!chunk.cutout) continue;
			if (!any) {
				pass.setPipeline(this.cascades.cutoutPipeline);
				pass.setBindGroup(2, this.blocks ?? this.blankBlocks);
				any = true;
			}
			draw(pass, chunk, chunk.cutout);
		}
		if (any) pass.setPipeline(this.cascades.pipeline);
	}

	render(frame: Frame): void {
		const { device, context, canvas } = this.ctx;
		const [drawWidth, drawHeight] = this.drawSize();
		const depth = this.ensureDepth(drawWidth, drawHeight);

		this.frameData.set(frame.viewProj.elements, 0);
		this.frameData.set(frame.eye, 16);
		this.frameData.set(frame.sun, 20);
		// `sun.w`. Full light, taking the whole lighting model out at once so
		// a dug hole can be looked into.
		this.frameData[23] = frame.fullbright;
		this.frameData.set(frame.fog, 24);
		this.frameData[28] = frame.daylight;
		this.frameData[29] = frame.nightLight;
		// `night.z`, which the sun-share knob used to hold. What the direct sun
		// is worth on a surface, against the sky's own brightness knob.
		this.frameData[30] = frame.sunLight;
		// `night.w`. How much a face's own angle to the sky still shades it --
		// the one term that can look directional with `sunLight` at 0, because
		// it reads a face's normal rather than the sun.
		this.frameData[31] = frame.skyShading;
		// The sky is the color of every surface the sun does not reach, so the
		// shader is given the same color the pass clears to.
		this.frameData.set(this.sky, 32);
		// `sky.w`. What the sky's own ambient light is worth on a surface --
		// the one multiplier `skyShading` does not touch, because that term
		// reshapes the ambient by a face's angle rather than scaling it.
		this.frameData[35] = frame.skyLight;
		this.frameData.set(frame.moon, 36);
		this.frameData[39] = frame.moonLight;
		device.queue.writeBuffer(this.frameUniform, 0, this.frameData);

		this.cascades.update(frame);
		// Centred on the ground under the camera rather than on the camera: a
		// player a kilometre up would otherwise carry the box up with them and
		// spend half of it on air.
		this.cloudShadow.update(frame, this.groundRadius);
		const encoder = device.createCommandEncoder();
		// The sun looks first. Its passes write what the frame then reads, so
		// they go into the same encoder ahead of everything else.
		this.cascades.render(encoder, this.casters);
		this.cloudShadow.render(encoder, this.cloudCasters);
		const timing = this.clock.writes();
		const pass = encoder.beginRenderPass({
			...(timing ? { timestampWrites: timing } : {}),
			colorAttachments: [
				{
					view: this.atmosphere.sceneTarget(drawWidth, drawHeight),
					// Black, not the sky's own color: the air pass now owns
					// every pixel nothing here draws into, stars and all, so
					// there is nothing left for a flat clear color to stand
					// in for. `this.sky` still feeds the ground's own ambient
					// tint below -- a different question from what an empty
					// pixel shows.
					//
					// **Alpha is coverage, and it clears to nothing.** Not
					// everything in this pass writes depth -- a cloud is
					// translucent and must not -- so the air pass cannot tell
					// "a cloud is here" from "nothing is here" by depth
					// alone, and it was replacing clouds beyond the planet's
					// limb with the star field behind them. What comes out of
					// here is premultiplied, so the sky composites under it.
					clearValue: { r: 0, g: 0, b: 0, a: 0 },
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
		// The frame's own bindings go on before anything draws, including a
		// layer. Every pipeline in the pass reads the sun, the fog and the
		// matrix from group 0, so a draw issued before it is bound is refused
		// and the whole command buffer with it.
		pass.setBindGroup(0, this.frameBindGroup);
		for (const layer of this.layers) layer.before?.(pass, frame);

		// Turning is instant and building a chunk is not, so what is held is a
		// disc around the player and what is drawn is the part of it being
		// looked at. Dropping the rest instead would put a hole in the world
		// every time someone spun round.
		//
		// `cullViewProj` is the frame's own matrix unless a caller froze one,
		// and then the sort below still runs against the live eye: which water
		// surface is in front of which is a fact about the picture being
		// taken, not about the camera that chose the chunks.
		const view = new Frustum(frame.cullViewProj ?? frame.viewProj);
		const visible: Resident[] = [];
		for (const chunk of this.resident.values())
			if (view.holdsBox(chunk.bound)) visible.push(chunk);
		this.lastDrawn = visible.length;

		pass.setPipeline(this.opaquePipeline);
		// **After the layers, not before them.** A pipeline whose layout is
		// shorter than this one's drops every binding past the end of its own,
		// so a sky drawn with two groups leaves group 2 unset -- and the next
		// terrain draw is refused, taking the whole command buffer with it.
		// The water pass sets it again for the same reason.
		pass.setBindGroup(2, this.lightViews.bindGroup);
		pass.setBindGroup(3, this.blocks ?? this.blankBlocks);
		for (const chunk of visible) draw(pass, chunk, chunk.opaque);

		// Cutout after opaque and before water. It writes depth, so the order
		// against the opaque pass changes nothing but how much of it is drawn
		// over; the water pass reads that depth and needs both already in it.
		pass.setPipeline(this.cutoutPipeline);
		for (const chunk of visible) draw(pass, chunk, chunk.cutout);

		// Water back to front. Sorting per chunk is enough: generated water has
		// no vertical sides, so two chunks' surfaces never cross each other.
		pass.setBindGroup(0, this.frameBindGroup);
		pass.setBindGroup(2, this.lightViews.bindGroup);
		pass.setBindGroup(3, this.blocks ?? this.blankBlocks);
		pass.setPipeline(this.waterPipeline);
		for (const chunk of this.byDistance(visible, frame.eye))
			draw(pass, chunk, chunk.water);

		for (const layer of this.layers) layer.after?.(pass, frame);

		pass.end();
		this.clock.resolve(encoder);
		// The air stands between the world and the tone curve: it reads the
		// depth the pass above just wrote, so every pixel knows how far away
		// its surface is and how much air is in front of it.
		this.atmosphere.resolve(
			encoder,
			depth.createView(),
			frame.eye,
			frame.sun,
			frame.moon,
			frame.viewProj.inverse(),
			this.air,
		);
		// The glare goes on before the curve, because what spills is the part
		// of the picture the curve is about to fold away: after it, the sun
		// and a cloud are both white and there is nothing left to tell apart.
		this.bloom.resolve(
			encoder,
			this.atmosphere.view,
			drawWidth,
			drawHeight,
		);
		this.tone.resolve(
			encoder,
			context.getCurrentTexture().createView(),
			frame.exposure,
			this.atmosphere.view,
			drawWidth / Math.max(1, canvas.width),
		);
		device.queue.submit([encoder.finish()]);
		this.clock.read();
	}

	/** Chunks holding water, furthest from the eye first. */
	private byDistance(
		among: readonly Resident[],
		eye: readonly [number, number, number],
	): Resident[] {
		const wet: { chunk: Resident; away: number }[] = [];
		for (const chunk of among) {
			if (!chunk.water) continue;
			const dx = chunk.origin[0] - eye[0];
			const dy = chunk.origin[1] - eye[1];
			const dz = chunk.origin[2] - eye[2];
			wet.push({ chunk, away: dx * dx + dy * dy + dz * dz });
		}
		wet.sort((a, b) => b.away - a.away);
		return wet.map((entry) => entry.chunk);
	}

	private uploadGeometry(geometry: Geometry): Buffers | null {
		if (geometry.indices.length === 0) return null;
		const { device } = this.ctx;
		const vertices = device.createBuffer({
			size: geometry.vertices.byteLength,
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
		});
		device.queue.writeBuffer(vertices, 0, geometry.vertices);
		const indices = device.createBuffer({
			size: geometry.indices.byteLength,
			usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
		});
		device.queue.writeBuffer(indices, 0, geometry.indices);
		return { vertices, indices, count: geometry.indices.length };
	}

	/**
	 * How many pixels the world is drawn into, before the tone curve puts it
	 * back on the canvas.
	 *
	 * Held under the device's own texture limit rather than trusting the knob:
	 * a large canvas at a scale of 2 can ask for more than the adapter will
	 * make, and a refused texture is a black frame rather than a slow one.
	 */
	private drawSize(): [number, number] {
		const { canvas, device } = this.ctx;
		const most = device.limits?.maxTextureDimension2D ?? 8192;
		const wanted = Math.max(1, Math.min(4, this.superSample));
		const fits = Math.min(
			wanted,
			most / Math.max(1, canvas.width),
			most / Math.max(1, canvas.height),
		);
		const scale = Math.max(1, fits);
		return [
			Math.max(1, Math.round(canvas.width * scale)),
			Math.max(1, Math.round(canvas.height * scale)),
		];
	}

	private ensureDepth(width: number, height: number): GPUTexture {
		const { device } = this.ctx;
		if (
			this.depth &&
			this.depth.width === width &&
			this.depth.height === height
		)
			return this.depth;
		this.depth?.destroy();
		this.depth = device.createTexture({
			size: { width, height },
			format: "depth32float",
			// Read as a texture as well as written as an attachment, because
			// the air marched over the frame is bounded by how far away each
			// pixel's surface turned out to be.
			usage:
				GPUTextureUsage.RENDER_ATTACHMENT |
				GPUTextureUsage.TEXTURE_BINDING,
		});
		return this.depth;
	}
}

/** Draw one of a chunk's three buffers, under whatever pipeline is set. */
function draw(
	pass: GPURenderPassEncoder,
	chunk: Resident,
	buffers: Buffers | null,
): void {
	if (!buffers) return;
	pass.setBindGroup(1, chunk.bindGroup);
	pass.setVertexBuffer(0, buffers.vertices);
	pass.setIndexBuffer(buffers.indices, "uint32");
	pass.drawIndexed(buffers.count);
}
