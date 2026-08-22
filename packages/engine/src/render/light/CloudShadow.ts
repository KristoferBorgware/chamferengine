import type { Frame } from "../Frame.js";
import type { GpuContext } from "../gpu/GpuContext.js";
import { Mat4 } from "../../math/Mat4.js";

/** Anything that draws itself into the cloud cover the sun sees. */
export interface CloudCaster {
	/**
	 * Draw into the coverage pass.
	 *
	 * Group 0 is already bound to the light matrix. The caster sets its own
	 * pipeline, its own group 1 onward and its own buffers -- the geometry is
	 * the cloud renderer's, and so is the pipeline that knows its layout.
	 */
	castCloudShadow(pass: GPURenderPassEncoder): void;
}

/** The matrix, then how dark and how far. */
const CLOUD_BYTES = 64 + 16;

/**
 * How far along the sun the box reaches, in metres.
 *
 * Nothing is compared for being nearest here, so this number buys no precision
 * and only has to be past the furthest cloud: the high deck sits 6 km up on a
 * planet 6.8 km across, and a low sun stretches the distance along the ray by
 * several times that.
 */
const ALONG_SUN = 40_000;

/**
 * What the sun sees of the clouds, as how much light each beam loses.
 *
 * **A cloud shadow is a coverage map, not a shadow map.** A shadow map records
 * how far the nearest surface is, which answers *is something in the way* with
 * a yes or a no. A cloud is translucent, its edge is thinner than its middle,
 * and two of them stacked stop more than one does -- so what is recorded here
 * is how much cloud a sunbeam passes through, accumulated, with nothing tested
 * for being nearest and no depth buffer at all.
 *
 * One orthographic box along the sun, centred on the player and a few
 * kilometres across. That is wide rather than deep because of where the decks
 * are: a cloud 3 km up on a planet 6.8 km across throws its shadow **8 km**
 * along the ground at a 20 degree sun, so the cloud whose shadow falls on you
 * is nowhere near overhead.
 */
export class CloudShadow {
	private readonly ctx: GpuContext;
	private readonly uniform: GPUBuffer;
	private readonly data = new Float32Array(CLOUD_BYTES / 4);

	/** The group a caster draws under: the light matrix and nothing else. */
	readonly castLayout: GPUBindGroupLayout;
	private readonly castGroup: GPUBindGroup;

	/** What the coverage is written into, for a caster's own pipeline. */
	readonly coverFormat: GPUTextureFormat = "r8unorm";

	private cover: GPUTexture;
	private target: GPUTextureView;

	readonly sampler: GPUSampler;

	/** Bumped whenever the texture is replaced, so a bind group can follow. */
	revision = 0;

	private size = 0;
	private live = false;

	/** Where the box sits, for a caster to test what is inside it. */
	private box = {
		centre: [0, 0, 0] as [number, number, number],
		sun: [0, 1, 0] as [number, number, number],
		half: 1,
	};

	private strength = 0;
	private reach = 4000;

	constructor(ctx: GpuContext, size: number) {
		this.ctx = ctx;
		const { device } = ctx;
		this.castLayout = device.createBindGroupLayout({
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.VERTEX,
					buffer: { type: "uniform" },
				},
			],
		});
		this.uniform = device.createBuffer({
			size: CLOUD_BYTES,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		this.castGroup = device.createBindGroup({
			layout: this.castLayout,
			entries: [{ binding: 0, resource: { buffer: this.uniform } }],
		});
		// Filtered, because a cloud edge is soft and the map is coarse: one
		// texel is metres across and the blend between them is most of what
		// makes the edge of a cloud shadow look like the edge of a cloud.
		this.sampler = device.createSampler({
			magFilter: "linear",
			minFilter: "linear",
			addressModeU: "clamp-to-edge",
			addressModeV: "clamp-to-edge",
		});
		this.cover = this.makeCover(size);
		this.target = this.cover.createView();
	}

	/** The buffer a shader reads the matrix and the strength out of. */
	get uniformBuffer(): GPUBuffer {
		return this.uniform;
	}

	/** The coverage itself. */
	get view(): GPUTextureView {
		return this.cover.createView();
	}

	/** How dark a cloud shadow goes, and how many metres the box spans. */
	setLook(strength: number, reach: number): void {
		this.strength = Math.max(0, strength);
		this.reach = Math.max(100, reach);
	}

	/** How many texels a side the coverage holds. */
	setSize(size: number): void {
		const wanted = Math.max(256, Math.min(4096, Math.round(size)));
		if (wanted === this.size) return;
		this.cover.destroy();
		this.cover = this.makeCover(wanted);
		this.target = this.cover.createView();
		this.revision++;
	}

	/**
	 * Point the box at the player and write what a shader will read.
	 *
	 * The box is centred on the ground under the camera rather than on the
	 * camera: a player 2 km up would otherwise carry the box up with them and
	 * spend half of it on air.
	 */
	update(frame: Frame, groundRadius: number): void {
		const sun = frame.sun;
		const up = unit(frame.eye);
		this.live =
			this.strength > 0 &&
			up[0] * sun[0] + up[1] * sun[1] + up[2] * sun[2] > -0.05;
		this.data[16 + 1] = this.live ? this.strength : 0;
		if (!this.live) {
			this.ctx.device.queue.writeBuffer(this.uniform, 0, this.data);
			return;
		}

		const centre: [number, number, number] = [
			up[0] * groundRadius,
			up[1] * groundRadius,
			up[2] * groundRadius,
		];
		const half = this.reach / 2;

		// Snapped to whole texels across the light, the same way a cascade is
		// and for the same reason: without it every texel covers new ground
		// each frame and the edge of every cloud shadow boils.
		let side = cross(up, sun);
		if (length(side) < 1e-3) side = cross([1, 0, 0], sun);
		side = unit(side);
		const other = unit(cross(sun, side));
		const texel = (2 * half) / Math.max(1, this.size);
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

		const from: [number, number, number] = [
			snapped[0] + sun[0] * ALONG_SUN,
			snapped[1] + sun[1] * ALONG_SUN,
			snapped[2] + sun[2] * ALONG_SUN,
		];
		const toLight = Mat4.orthographic(half, 0, 2 * ALONG_SUN).multiply(
			Mat4.lookAt(from, snapped, other),
		);
		this.data.set(toLight.elements, 0);
		this.data[16] = 0;
		this.box = { centre: snapped, sun: [sun[0], sun[1], sun[2]], half };
		this.ctx.device.queue.writeBuffer(this.uniform, 0, this.data);
	}

	/** Whether anything is being asked to draw itself this frame. */
	get casting(): boolean {
		return this.live;
	}

	/**
	 * What the box can see, as a test a caster runs per thing it might draw.
	 *
	 * A cylinder along the light: anything within the box's half-width of the
	 * axis through its centre casts into it, however far up the sun it stands.
	 */
	holds(centre: readonly [number, number, number], radius: number): boolean {
		const dx = centre[0] - this.box.centre[0];
		const dy = centre[1] - this.box.centre[1];
		const dz = centre[2] - this.box.centre[2];
		const along =
			dx * this.box.sun[0] + dy * this.box.sun[1] + dz * this.box.sun[2];
		// **Up-sun only.** The box is a cylinder with no far end, so without
		// this a cloud on the night side of the planet -- inside the cylinder,
		// but behind the ground rather than in front of it -- would write its
		// shape into the cover and shadow ground it stands under.
		if (along < -this.box.half - radius) return false;
		const across = Math.sqrt(
			Math.max(0, dx * dx + dy * dy + dz * dz - along * along),
		);
		return across <= this.box.half + radius;
	}

	/** Gather how much cloud stands over everything the box covers. */
	render(encoder: GPUCommandEncoder, casters: readonly CloudCaster[]): void {
		if (!this.live) return;
		const pass = encoder.beginRenderPass({
			colorAttachments: [
				{
					view: this.target,
					clearValue: { r: 0, g: 0, b: 0, a: 1 },
					loadOp: "clear",
					storeOp: "store",
				},
			],
		});
		pass.setBindGroup(0, this.castGroup);
		for (const caster of casters) caster.castCloudShadow(pass);
		pass.end();
	}

	destroy(): void {
		this.cover.destroy();
		this.uniform.destroy();
	}

	private makeCover(size: number): GPUTexture {
		this.size = size;
		return this.ctx.device.createTexture({
			size: { width: size, height: size },
			format: this.coverFormat,
			usage:
				GPUTextureUsage.RENDER_ATTACHMENT |
				GPUTextureUsage.TEXTURE_BINDING,
		});
	}
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
