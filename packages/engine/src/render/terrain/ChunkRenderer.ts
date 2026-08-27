import type { Box } from "../../math/Box.js";
import type { ChunkMesh } from "../../mesh/ChunkMesh.js";
import type { Frame } from "../Frame.js";
import type { Geometry } from "../../mesh/Geometry.js";
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
import { SunViews } from "../light/SunViews.js";
import { ScreenDepth } from "../light/ScreenDepth.js";
import { Ssao } from "../light/Ssao.js";
import { Ssgi } from "../light/Ssgi.js";
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
	readonly water: Buffers | null;

	/** This chunk's own probe volume, or null where it shares the empty one. */
	readonly probes: GPUTexture | null;
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
	private readonly waterPipeline: GPURenderPipeline;
	private readonly frameLayout: GPUBindGroupLayout;
	private readonly chunkLayout: GPUBindGroupLayout;
	private readonly noProbes: GPUTexture;
	private readonly noProbesView: GPUTextureView;
	private readonly probeSampler: GPUSampler;
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
	 * The cascades and the cloud cover as one bind group.
	 *
	 * WebGPU guarantees four groups and the world spends all four, so the two
	 * things the sun looks at share the last one.
	 */
	readonly sunViews: SunViews;

	/**
	 * Where the geometry is, before the world is shaded.
	 *
	 * Only drawn when something needs it. See {@link ScreenDepth}.
	 */
	readonly screenDepth: ScreenDepth;

	/**
	 * How much sky each pixel can see, scaling the ambient term alone.
	 *
	 * Off by default: it costs a whole extra geometry pass to find out where
	 * the geometry is, and this world already bakes two occlusion terms the
	 * mesher can compute for nothing.
	 */
	readonly ssao: Ssao;

	/** One bounce of light between surfaces, gathered off the frame. */
	readonly ssgi: Ssgi;

	/**
	 * The radius the crust's top sits at, and how tall one layer is.
	 *
	 * A probe is filed by the layer it stands at, and a vertex arrives
	 * knowing only its radius -- these two are what turn one into the other.
	 * Set by whoever owns the world's shape; a zero layer height leaves every
	 * probe lookup on the volume's first row, which is harmless because a
	 * chunk with no volume reads nothing anyway.
	 */
	crustTopRadius = 0;

	/** How tall one layer is, in metres. */
	layerHeight = 1;

	/** What a probe's carried light is worth on a surface. Zero is off. */
	probeStrength = 0;

	/** Whether {@link ssao} runs at all. */
	ssaoOn = false;

	/** Whether {@link ssgi} runs at all. */
	ssgiOn = false;

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
		// **Group 1 is the chunk's own, and the sea does not share it.** The
		// sea patch declares a layout of its own at the same index, so a
		// resource that belongs to a chunk can go here without every other
		// pipeline in the pass having to learn about it -- which is what
		// group 2 would have cost.
		this.chunkLayout = device.createBindGroupLayout({
			entries: [
				uniformEntry,
				{
					binding: 1,
					visibility: GPUShaderStage.FRAGMENT,
					texture: { sampleType: "float", viewDimension: "3d" },
				},
				{
					binding: 2,
					visibility: GPUShaderStage.FRAGMENT,
					sampler: { type: "filtering" },
				},
			],
		});
		// One texel of nothing, for every chunk built without probes. A
		// pipeline missing a binding is refused and the whole frame with it,
		// so off has to be a texture rather than an absence.
		this.noProbes = device.createTexture({
			size: { width: 1, height: 1, depthOrArrayLayers: 1 },
			dimension: "3d",
			format: "rgba8unorm",
			usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
		});
		device.queue.writeTexture(
			{ texture: this.noProbes },
			new Uint8Array([128, 128, 255, 0]),
			{ bytesPerRow: 256, rowsPerImage: 1 },
			{ width: 1, height: 1, depthOrArrayLayers: 1 },
		);
		this.noProbesView = this.noProbes.createView({ dimension: "3d" });
		// Probes are metres apart, so what is between two of them is a blend
		// rather than a step -- the whole reason a coarse grid can stand in
		// for a fine one.
		this.probeSampler = device.createSampler({
			magFilter: "linear",
			minFilter: "linear",
			addressModeU: "clamp-to-edge",
			addressModeV: "clamp-to-edge",
			addressModeW: "clamp-to-edge",
		});
		this.cascades = new CascadeShadow(ctx, this.chunkLayout, 1024);
		this.cloudShadow = new CloudShadow(ctx, 1024);
		this.screenDepth = new ScreenDepth(ctx, this.chunkLayout);
		this.ssao = new Ssao(ctx);
		this.ssgi = new Ssgi(ctx);
		this.sunViews = new SunViews(
			ctx,
			this.cascades,
			this.cloudShadow,
			this.ssao.openView,
		);
		this.casters.push(this);

		const common = {
			layout: device.createPipelineLayout({
				bindGroupLayouts: [
					this.frameLayout,
					this.chunkLayout,
					this.sunViews.layout,
				],
			}),
			vertex: {
				module,
				entryPoint: "vertexMain",
				buffers: [
					{
						arrayStride: 24,
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
		const probes = this.uploadProbes(mesh);
		const volume = mesh.probes;
		device.queue.writeBuffer(
			uniform,
			0,
			new Float32Array([
				mesh.origin.x,
				mesh.origin.y,
				mesh.origin.z,
				0,
				// How to find a probe from a cell: how many cells apart they
				// are, how many there are each way, and which layer the top
				// row sits at. Zero probes across says there is no volume,
				// which is how the shader knows without a second uniform.
				volume ? volume.spacing : 0,
				volume ? volume.across : 0,
				volume ? volume.down : 0,
				volume ? volume.firstLayer : 0,
				// The three corner directions inverted, a column per row, with
				// the triangle's side, the crust's top and a layer's height
				// riding in the spare lanes.
				volume ? volume.basis[0]! : 0,
				volume ? volume.basis[1]! : 0,
				volume ? volume.basis[2]! : 0,
				volume ? volume.side : 0,
				volume ? volume.basis[3]! : 0,
				volume ? volume.basis[4]! : 0,
				volume ? volume.basis[5]! : 0,
				this.crustTopRadius,
				volume ? volume.basis[6]! : 0,
				volume ? volume.basis[7]! : 0,
				volume ? volume.basis[8]! : 0,
				this.layerHeight,
				// And the corners themselves, which is what turns the lattice
				// direction a probe stores into a world one.
				volume ? volume.corners[0]! : 0,
				volume ? volume.corners[1]! : 0,
				volume ? volume.corners[2]! : 0,
				0,
				volume ? volume.corners[3]! : 0,
				volume ? volume.corners[4]! : 0,
				volume ? volume.corners[5]! : 0,
				0,
				volume ? volume.corners[6]! : 0,
				volume ? volume.corners[7]! : 0,
				volume ? volume.corners[8]! : 0,
				0,
			]),
		);
		this.resident.set(mesh.key, {
			key: mesh.key,
			origin: [mesh.origin.x, mesh.origin.y, mesh.origin.z],
			bound: mesh.bound,
			uniform,
			bindGroup: device.createBindGroup({
				layout: this.chunkLayout,
				entries: [
					{ binding: 0, resource: { buffer: uniform } },
					{
						binding: 1,
						resource: probes
							? probes.createView({ dimension: "3d" })
							: this.noProbesView,
					},
					{ binding: 2, resource: this.probeSampler },
				],
			}),
			opaque: this.uploadGeometry(mesh.opaque),
			water: this.uploadGeometry(mesh.translucent),
			probes,
		});
	}

	/**
	 * Put a chunk's probe volume on the GPU, or nothing where it has none.
	 *
	 * A 3D texture per chunk rather than one atlas for the world: a chunk
	 * arrives and leaves on its own, and an atlas would need a free list and
	 * a way to say where in it each chunk sits. At 24 KB a chunk the whole
	 * resident set is a few megabytes.
	 */
	private uploadProbes(mesh: ChunkMesh): GPUTexture | null {
		const volume = mesh.probes;
		if (!volume) return null;
		const { device } = this.ctx;
		const texture = device.createTexture({
			size: {
				width: volume.across,
				height: volume.across,
				depthOrArrayLayers: volume.down,
			},
			dimension: "3d",
			format: "rgba8unorm",
			usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
		});
		device.queue.writeTexture(
			{ texture },
			volume.data,
			{
				bytesPerRow: volume.across * 4,
				rowsPerImage: volume.across,
			},
			{
				width: volume.across,
				height: volume.across,
				depthOrArrayLayers: volume.down,
			},
		);
		return texture;
	}

	/** Take a chunk off the GPU. */
	drop(key: number): void {
		const held = this.resident.get(key);
		if (!held) return;
		held.uniform.destroy();
		held.opaque?.vertices.destroy();
		held.opaque?.indices.destroy();
		held.water?.vertices.destroy();
		held.water?.indices.destroy();
		held.probes?.destroy();
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
		for (const chunk of this.resident.values()) {
			if (!chunk.opaque) continue;
			if (!box.holds(chunk.bound)) continue;
			pass.setBindGroup(1, chunk.bindGroup);
			pass.setVertexBuffer(0, chunk.opaque.vertices);
			pass.setIndexBuffer(chunk.opaque.indices, "uint32");
			pass.drawIndexed(chunk.opaque.count);
		}
	}

	render(frame: Frame): void {
		const { device, context, canvas } = this.ctx;
		const [drawWidth, drawHeight] = this.drawSize();
		const depth = this.ensureDepth(drawWidth, drawHeight);

		this.frameData.set(frame.viewProj.elements, 0);
		this.frameData.set(frame.eye, 16);
		// `eye.w`. What a probe's carried light is worth, riding in the spare
		// lane a position leaves behind.
		this.frameData[19] = this.probeStrength;
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

		// Turning is instant and building a chunk is not, so what is held is a
		// disc around the player and what is drawn is the part of it being
		// looked at. Dropping the rest instead would put a hole in the world
		// every time someone spun round.
		//
		// `cullViewProj` is the frame's own matrix unless a caller froze one,
		// and then the sort below still runs against the live eye: which water
		// surface is in front of which is a fact about the picture being
		// taken, not about the camera that chose the chunks.
		//
		// **Worked out before the passes rather than inside the world pass**,
		// because the depth prepass has to draw the same list: a second
		// opinion about what is visible is a second chance to disagree, and
		// occlusion computed from geometry the world pass does not draw would
		// shade the pixels around a chunk that is not there.
		const view = new Frustum(frame.cullViewProj ?? frame.viewProj);
		const visible: Resident[] = [];
		for (const chunk of this.resident.values())
			if (view.holdsBox(chunk.bound)) visible.push(chunk);
		this.lastDrawn = visible.length;

		// **Ambient occlusion runs before the light it changes.** The sky's
		// share of a surface is decided inside the terrain shader while the
		// world is being drawn, so a pass reading the depth that pass wrote
		// would be a frame too late to touch it. What this costs is finding
		// out where the geometry is twice, which is why it only happens when
		// the effect is on.
		// Both screen-space passes reconstruct a world position from a depth,
		// which is one inverse between them rather than one each.
		const unproject =
			this.ssaoOn || this.ssgiOn ? frame.viewProj.inverse() : null;
		this.sunViews.openSky = this.ssao.openView;
		if (this.ssaoOn) {
			this.screenDepth.render(
				encoder,
				frame.viewProj,
				drawWidth,
				drawHeight,
				(pass) => {
					for (const chunk of visible)
						draw(pass, chunk, chunk.opaque);
				},
			);
			this.ssao.resolve(
				encoder,
				this.screenDepth.view!,
				drawWidth,
				drawHeight,
				frame.eye,
				frame.viewProj,
				unproject!,
			);
			this.sunViews.openSky = this.ssao.view;
		}

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

		pass.setPipeline(this.opaquePipeline);
		// **After the layers, not before them.** A pipeline whose layout is
		// shorter than this one's drops every binding past the end of its own,
		// so a sky drawn with two groups leaves group 2 unset -- and the next
		// terrain draw is refused, taking the whole command buffer with it.
		// The water pass sets it again for the same reason.
		pass.setBindGroup(2, this.sunViews.bindGroup);
		for (const chunk of visible) draw(pass, chunk, chunk.opaque);

		// Water back to front. Sorting per chunk is enough: generated water has
		// no vertical sides, so two chunks' surfaces never cross each other.
		pass.setBindGroup(0, this.frameBindGroup);
		pass.setBindGroup(2, this.sunViews.bindGroup);
		pass.setPipeline(this.waterPipeline);
		for (const chunk of this.byDistance(visible, frame.eye))
			draw(pass, chunk, chunk.water);

		for (const layer of this.layers) layer.after?.(pass, frame);

		pass.end();
		this.clock.resolve(encoder);
		// **The bounce goes before the air and after the world**, because what
		// it gathers is the lit colour the pass above just wrote. Indirect
		// light adds rather than scaling anything, so it needs nothing
		// separated out of that colour -- which is what lets it run here at
		// all, where ambient occlusion could not.
		if (this.ssgiOn) {
			this.ssgi.resolve(
				encoder,
				depth.createView(),
				this.atmosphere.sceneTarget(drawWidth, drawHeight),
				drawWidth,
				drawHeight,
				frame.eye,
				frame.viewProj,
				unproject!,
			);
		}
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

/** Draw one of a chunk's two buffers. */
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
