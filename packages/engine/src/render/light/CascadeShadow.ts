import type { Box } from "../../math/Box.js";
import type { Frame } from "../Frame.js";
import type { GpuContext } from "../gpu/GpuContext.js";
import type { ShadowCaster } from "./ShadowCaster.js";
import { CASCADE_SHADER } from "./CASCADE_SHADER.js";
import { Mat4 } from "../../math/Mat4.js";

/**
 * How many boxes the view is cut into for the sun to look down.
 *
 * Three. A shadow map is a fixed number of texels however far it is stretched,
 * so one box covering everything in view spends the same resolution on the
 * ground underfoot as on the hillside at the edge of sight -- which is the
 * wrong way round, because a shadow underfoot is the one being looked at. Each
 * box here covers four times the distance of the one before it and holds the
 * same texels, so the nearest is the sharpest.
 */
export const CASCADES = 3;

/** A light matrix, padded to the alignment a uniform binding needs. */
const SLOT_BYTES = 256;

/** Three matrices, the reaches, and how the sampling behaves. */
const LOOK_BYTES = CASCADES * 64 + 16 + 16;

/**
 * How far past a cascade the sun still looks for something to cast into it.
 *
 * A box tight around what the camera sees holds no caster standing outside
 * it, so a wall just up-sun of the view would throw no shadow into it. This
 * is how far up-sun the box is stretched to catch one, and past it the walk
 * over the coarse map is what answers -- so it need only reach what a shadow
 * map can say and the map cannot, which is a thing standing near.
 */
const REACH_UP_SUN = 2.0;
const REACH_LEAST = 120;
const REACH_MOST = 900;

/** How the cut between one cascade and the next is placed. */
const SPLIT_GROWTH = 4;

/**
 * Cascaded shadow maps: the sun's own view of what is near the camera.
 *
 * **This is the half of a shadow the coarse map cannot give.** The map holds
 * one height per 32 m cell, so it knows where a mountain is and nothing about
 * a block, a mob or a player -- and it is a picture of the *generated* world,
 * so nothing anybody builds or carries appears in it at all. A shadow map is
 * a picture of what is actually there, taken from the sun, and anything that
 * can draw itself can be in it.
 *
 * The two answer different distances and are combined by taking the darker.
 * Near the camera the cascades are sharp and hold everything; far away they
 * run out of texels and out of box, and the walk over the map carries on to
 * the horizon.
 *
 * Each cascade is fitted to a **sphere** around its slice of the view rather
 * than to the slice itself: a sphere is the same size whichever way the camera
 * turns, so the box does not grow and shrink as a player looks around and the
 * shadows do not crawl. The sphere's centre is then snapped to whole texels,
 * which is what stops them crawling as the player walks.
 */
export class CascadeShadow {
	private readonly ctx: GpuContext;
	private readonly pipeline: GPURenderPipeline;
	private readonly slotLayout: GPUBindGroupLayout;

	/** One light matrix per cascade, each in its own aligned slot. */
	private readonly slots: GPUBuffer;
	private readonly slotGroups: GPUBindGroup[] = [];
	private readonly slotData = new Float32Array(16);

	/** What a shader reads: the matrices, the reaches, the softness. */
	private readonly look: GPUBuffer;
	private readonly lookData = new Float32Array(LOOK_BYTES / 4);

	private depth: GPUTexture;
	private views: GPUTextureView[] = [];

	/** Bumped whenever the texture is replaced, so a bind group can follow. */
	revision = 0;

	/** Texels along one side of each cascade. */
	private size = 0;

	/** Where each cascade sits, for a caster to test what it holds. */
	private readonly boxes: {
		centre: [number, number, number];
		sun: [number, number, number];
		radius: number;
		back: number;
	}[] = [];

	/** Whether the last frame had a sun worth drawing from. */
	private live = false;

	/**
	 * The chunk layout a caster's own geometry is drawn with.
	 *
	 * Handed out rather than built here, because the thing that owns the
	 * chunks owns their bind groups and this pipeline has to match them.
	 */
	readonly chunkLayout: GPUBindGroupLayout;

	constructor(
		ctx: GpuContext,
		chunkLayout: GPUBindGroupLayout,
		size: number,
	) {
		this.ctx = ctx;
		this.chunkLayout = chunkLayout;
		const { device } = ctx;

		this.slotLayout = device.createBindGroupLayout({
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.VERTEX,
					buffer: { type: "uniform" },
				},
			],
		});
		this.slots = device.createBuffer({
			size: CASCADES * SLOT_BYTES,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		for (let at = 0; at < CASCADES; at++)
			this.slotGroups.push(
				device.createBindGroup({
					layout: this.slotLayout,
					entries: [
						{
							binding: 0,
							resource: {
								buffer: this.slots,
								offset: at * SLOT_BYTES,
								size: 64,
							},
						},
					],
				}),
			);
		this.look = device.createBuffer({
			size: LOOK_BYTES,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});

		const module = device.createShaderModule({ code: CASCADE_SHADER });
		this.pipeline = device.createRenderPipeline({
			layout: device.createPipelineLayout({
				bindGroupLayouts: [this.slotLayout, chunkLayout],
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
						],
					},
				],
			},
			// **Both sides.** A chunk's mesh is a shell with no underside, so
			// culling by which way a face turns from the sun would drop the
			// faces turned away from it -- which are exactly the ones whose
			// own shadow this is meant to record.
			primitive: { topology: "triangle-list", cullMode: "none" },
			depthStencil: {
				format: "depth32float",
				depthWriteEnabled: true,
				depthCompare: "less",
			},
		});

		// The comparison is the whole of the read: a sampler that answers
		// "nearer than this?" per texel averages four answers rather than four
		// depths, which is a soft edge for the price of one lookup.
		const sampler = device.createSampler({
			compare: "less",
			magFilter: "linear",
			minFilter: "linear",
		});
		for (let at = 0; at < CASCADES; at++)
			this.boxes.push({
				centre: [0, 0, 0],
				sun: [0, 1, 0],
				radius: 1,
				back: 1,
			});
		this.depth = this.makeDepth(size);
		this.sampler = sampler;
	}

	/** The comparison sampler a shader reads the maps through. */
	readonly sampler: GPUSampler;

	/** The buffer holding the three matrices and how they are sampled. */
	get uniformBuffer(): GPUBuffer {
		return this.look;
	}

	/** All three cascades as one array a shader indexes by slot. */
	get arrayView(): GPUTextureView {
		return this.depth.createView({ dimension: "2d-array" });
	}

	/** How far the furthest cascade carries, and how dark a shadow goes. */
	private reach = 240;
	private strength = 0;

	/** What the cascades are worth and how far they run. */
	setLook(strength: number, reach: number): void {
		this.strength = strength;
		this.reach = Math.max(2, reach);
	}

	/** How many texels a side each cascade holds. */
	setSize(size: number): void {
		const wanted = Math.max(256, Math.min(4096, Math.round(size)));
		if (wanted === this.size) return;
		this.depth.destroy();
		this.depth = this.makeDepth(wanted);
		this.revision++;
	}

	/**
	 * Fit the cascades to this frame and write what a shader will read.
	 *
	 * `reach` is how far the furthest cascade carries, in metres. Each one
	 * before it covers a quarter of the one after, so the nearest is the
	 * smallest and the sharpest.
	 */
	update(frame: Frame): void {
		const reach = this.reach;
		const strength = this.strength;
		const sun = frame.sun;
		// A sun under the horizon casts nothing, and neither does no sun.
		const up = unit(frame.eye);
		this.live =
			strength > 0 &&
			reach > 1 &&
			up[0] * sun[0] + up[1] * sun[1] + up[2] * sun[2] > -0.05;
		this.lookData[CASCADES * 16 + 6] = this.live ? strength : 0;
		if (!this.live) {
			this.ctx.device.queue.writeBuffer(this.look, 0, this.lookData);
			return;
		}

		const inverse = frame.viewProj.inverse();
		// The four rays out of the eye through the corners of the screen, and
		// the direction the middle of it looks along.
		const corners = [
			unproject(inverse, -1, -1, 1),
			unproject(inverse, 1, -1, 1),
			unproject(inverse, -1, 1, 1),
			unproject(inverse, 1, 1, 1),
		];
		const rays = corners.map((c) =>
			unit([
				c[0] - frame.eye[0],
				c[1] - frame.eye[1],
				c[2] - frame.eye[2],
			]),
		);
		const ahead = unit([
			rays[0]![0] + rays[1]![0] + rays[2]![0] + rays[3]![0],
			rays[0]![1] + rays[1]![1] + rays[2]![1] + rays[3]![1],
			rays[0]![2] + rays[1]![2] + rays[2]![2] + rays[3]![2],
		]);

		// Splits: the last covers `reach`, and each is a quarter of the next.
		const spans: number[] = [];
		let span = reach;
		for (let at = CASCADES - 1; at >= 0; at--) {
			spans[at] = span;
			span /= SPLIT_GROWTH;
		}

		let near = 0.5;
		for (let at = 0; at < CASCADES; at++) {
			const far = spans[at]!;
			const { centre, radius } = sliceBall(
				frame.eye,
				rays,
				ahead,
				near,
				far,
			);
			this.writeCascade(at, centre, radius, sun, up);
			this.lookData[CASCADES * 16 + at] = far;
			near = far;
		}
		// How far the last one fades out over, so a shadow does not stop at a
		// line across the ground.
		this.lookData[CASCADES * 16 + 3] = spans[CASCADES - 1]! * 0.15;
		this.lookData[CASCADES * 16 + 7] = this.size;
		this.ctx.device.queue.writeBuffer(this.look, 0, this.lookData);
	}

	/**
	 * What one cascade can see, as a test a caster can run per thing.
	 *
	 * A cylinder rather than a box: the cascade is fitted to a ball, and what
	 * casts into it is anything within that ball's radius of the light axis
	 * through its centre and not so far back up the light as to be outside the
	 * depth the pass records.
	 *
	 * A caster names an oriented box, so how far it reaches along the light and
	 * how far it stands off the axis are each a sum over its three axes: the
	 * cosine of an axis against the light for the first and the sine for the
	 * second. A shaft dug straight down under a low sun barely widens the
	 * second sum, where the ball around it would.
	 */
	boxOf(at: number): { holds: (bound: Box) => boolean } {
		const box = this.boxes[at]!;
		return {
			holds: (bound) => {
				const dx = bound.center[0] - box.centre[0];
				const dy = bound.center[1] - box.centre[1];
				const dz = bound.center[2] - box.centre[2];
				let reach = 0;
				let wide = 0;
				for (let n = 0; n < 3; n++) {
					const axis = bound.axes[n]!;
					const half = bound.halves[n]!;
					const cosine =
						axis[0] * box.sun[0] +
						axis[1] * box.sun[1] +
						axis[2] * box.sun[2];
					reach += Math.abs(cosine) * half;
					wide += Math.sqrt(Math.max(0, 1 - cosine * cosine)) * half;
				}
				const along =
					dx * box.sun[0] + dy * box.sun[1] + dz * box.sun[2];
				if (along > box.radius + box.back + reach) return false;
				if (along < -box.radius - reach) return false;
				const across = Math.sqrt(
					Math.max(0, dx * dx + dy * dy + dz * dz - along * along),
				);
				return across <= box.radius + wide;
			},
		};
	}

	/** Draw every caster into every cascade. */
	render(encoder: GPUCommandEncoder, casters: readonly ShadowCaster[]): void {
		if (!this.live) return;
		for (let at = 0; at < CASCADES; at++) {
			const pass = encoder.beginRenderPass({
				colorAttachments: [],
				depthStencilAttachment: {
					view: this.views[at]!,
					depthClearValue: 1,
					depthLoadOp: "clear",
					depthStoreOp: "store",
				},
			});
			pass.setPipeline(this.pipeline);
			pass.setBindGroup(0, this.slotGroups[at]!);
			for (const caster of casters) caster.castShadow(pass, at);
			pass.end();
		}
	}

	/** Whether a caster is being asked for anything this frame. */
	get casting(): boolean {
		return this.live;
	}

	destroy(): void {
		this.depth.destroy();
		this.slots.destroy();
		this.look.destroy();
	}

	/**
	 * One cascade's light matrix, written to its slot and to the read buffer.
	 *
	 * The centre is snapped to whole texels along the light's own two lateral
	 * axes. Without it the box slides continuously as the camera moves, every
	 * texel covers a slightly different patch of ground each frame, and the
	 * edge of every shadow crawls.
	 */
	private writeCascade(
		at: number,
		centre: readonly [number, number, number],
		radius: number,
		sun: readonly [number, number, number],
		up: readonly [number, number, number],
	): void {
		// A frame across the light. The planet's own up will do unless the sun
		// is nearly overhead, and then anything across it does.
		let side = cross(up, sun);
		if (length(side) < 1e-3) side = cross([1, 0, 0], sun);
		side = unit(side);
		const other = unit(cross(sun, side));

		const texel = (2 * radius) / Math.max(1, this.size);
		const along = dot(centre, side);
		const across = dot(centre, other);
		const snapped: [number, number, number] = [
			centre[0] +
				side[0] * (Math.round(along / texel) * texel - along) +
				other[0] * (Math.round(across / texel) * texel - across),
			centre[1] +
				side[1] * (Math.round(along / texel) * texel - along) +
				other[1] * (Math.round(across / texel) * texel - across),
			centre[2] +
				side[2] * (Math.round(along / texel) * texel - along) +
				other[2] * (Math.round(across / texel) * texel - across),
		];

		const back = Math.min(
			REACH_MOST,
			Math.max(REACH_LEAST, radius * REACH_UP_SUN),
		);
		const from: [number, number, number] = [
			snapped[0] + sun[0] * (radius + back),
			snapped[1] + sun[1] * (radius + back),
			snapped[2] + sun[2] * (radius + back),
		];
		const view = Mat4.lookAt(from, snapped, other);
		const toLight = Mat4.orthographic(
			radius,
			0,
			2 * radius + back,
		).multiply(view);

		this.boxes[at] = {
			centre: snapped,
			sun: [sun[0], sun[1], sun[2]],
			radius,
			back,
		};
		this.slotData.set(toLight.elements);
		this.ctx.device.queue.writeBuffer(
			this.slots,
			at * SLOT_BYTES,
			this.slotData,
		);
		this.lookData.set(toLight.elements, at * 16);
	}

	private makeDepth(size: number): GPUTexture {
		this.size = size;
		const texture = this.ctx.device.createTexture({
			size: [size, size, CASCADES],
			format: "depth32float",
			usage:
				GPUTextureUsage.RENDER_ATTACHMENT |
				GPUTextureUsage.TEXTURE_BINDING,
		});
		this.views = [];
		for (let at = 0; at < CASCADES; at++)
			this.views.push(
				texture.createView({
					dimension: "2d",
					baseArrayLayer: at,
					arrayLayerCount: 1,
				}),
			);
		return texture;
	}
}

/** The ball around one slice of the view, from the eye's four corner rays. */
function sliceBall(
	eye: readonly [number, number, number],
	rays: readonly (readonly [number, number, number])[],
	ahead: readonly [number, number, number],
	near: number,
	far: number,
): { centre: [number, number, number]; radius: number } {
	const points: [number, number, number][] = [];
	for (const ray of rays) {
		// A ray reaches a given depth ahead further than that along itself.
		const stretch = 1 / Math.max(0.05, dot(ray, ahead));
		for (const depth of [near, far])
			points.push([
				eye[0] + ray[0] * depth * stretch,
				eye[1] + ray[1] * depth * stretch,
				eye[2] + ray[2] * depth * stretch,
			]);
	}
	const centre: [number, number, number] = [0, 0, 0];
	for (const point of points) {
		centre[0] += point[0] / points.length;
		centre[1] += point[1] / points.length;
		centre[2] += point[2] / points.length;
	}
	let radius = 0;
	for (const point of points)
		radius = Math.max(
			radius,
			length([
				point[0] - centre[0],
				point[1] - centre[1],
				point[2] - centre[2],
			]),
		);
	return { centre, radius: Math.max(1, radius) };
}

/** A clip-space corner back in the world. */
function unproject(
	inverse: Mat4,
	x: number,
	y: number,
	z: number,
): [number, number, number] {
	const m = inverse.elements;
	const w = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!;
	const scale = 1 / (Math.abs(w) < 1e-12 ? 1e-12 : w);
	return [
		(m[0]! * x + m[4]! * y + m[8]! * z + m[12]!) * scale,
		(m[1]! * x + m[5]! * y + m[9]! * z + m[13]!) * scale,
		(m[2]! * x + m[6]! * y + m[10]! * z + m[14]!) * scale,
	];
}

function dot(
	a: readonly [number, number, number],
	b: readonly [number, number, number],
): number {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(
	a: readonly [number, number, number],
	b: readonly [number, number, number],
): [number, number, number] {
	return [
		a[1] * b[2] - a[2] * b[1],
		a[2] * b[0] - a[0] * b[2],
		a[0] * b[1] - a[1] * b[0],
	];
}

function length(a: readonly [number, number, number]): number {
	return Math.sqrt(dot(a, a));
}

function unit(a: readonly [number, number, number]): [number, number, number] {
	const size = length(a) || 1;
	return [a[0] / size, a[1] / size, a[2] / size];
}
