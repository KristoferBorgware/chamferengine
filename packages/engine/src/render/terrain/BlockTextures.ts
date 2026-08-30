import type { GpuContext } from "../gpu/GpuContext.js";

/** What a bake writes beside its grids: the layer order and the block table. */
export interface BlockAtlas {
	/** Texels a side, at the finest level. */
	readonly size: number;

	/**
	 * How many tiles across the transport image holds.
	 *
	 * The file is a grid and the texture is an array, and the two were never
	 * required to have the same shape -- this is what turns one into the
	 * other. A bake from before the grid says nothing, and one tile across is
	 * the tall column those wrote.
	 */
	readonly columns?: number;

	/** Mip levels the bake wrote, one image apiece. */
	readonly levels: number;

	/** Every picture, in the order the layers are numbered. */
	readonly layers: readonly string[];

	/** Numbers a block holds in {@link table}. */
	readonly slots: number;

	/**
	 * Which layer each block wears, `block * slots + which`.
	 *
	 * `0` is its cap, `1` its side, `2` its underside and `3` the band drawn
	 * over the side, `-1` where there is none.
	 */
	readonly table: readonly number[];
}

/** The slot a face reads, which is the order the bake writes them in. */
export const SLOT_TOP = 0;
export const SLOT_SIDE = 1;
export const SLOT_BOTTOM = 2;
export const SLOT_OVERLAY = 3;

/**
 * Every block picture on the GPU, as one array texture.
 *
 * **An array rather than an atlas.** A layer mips down to one texel with
 * nothing beside it to bleed in, and a wall merged over several layers repeats
 * its picture by asking the sampler rather than by arithmetic in the shader --
 * neither of which an atlas gives without gutters and a manual wrap.
 *
 * Filtered on the way down and **nearest on the way up**: a block seen close is
 * meant to read as texels, which is the whole look, and a block seen far is
 * meant to stop flickering. That pair rules out anisotropy, which a sampler
 * may only have when it filters both ways.
 */
export class BlockTextures {
	readonly atlas: BlockAtlas;
	readonly texture: GPUTexture;

	/**
	 * Where each picture is, as `(layer, offsetU, offsetV, scale)` apiece.
	 *
	 * **The identity today** -- picture `n` is layer `n` at offset zero and
	 * scale one -- because every picture has a layer to itself. It is the one
	 * place that changes when a device cannot give the set a layer each and
	 * several have to share one, and filling it differently is the whole of
	 * that change: no new pipeline, no new bind group, no new draw call, and
	 * nothing the mesher or the vertex format knows about.
	 */
	readonly places: GPUBuffer;
	readonly view: GPUTextureView;
	readonly sampler: GPUSampler;

	/**
	 * The same filtering without the repeat, for the band over a wall's brink.
	 *
	 * A wall merged down a column runs its picture past 1 in `v` so the block
	 * tiles down it. The band must not tile -- a wall has one brink, at the
	 * top -- so it is read through a sampler that clamps instead, and the
	 * rows below the band, which the picture leaves transparent, are what the
	 * rest of the wall gets.
	 */
	readonly bandSampler: GPUSampler;

	/** Which layer each block wears, flat, for the mesher to index. */
	readonly table: Int32Array;

	constructor(
		ctx: GpuContext,
		atlas: BlockAtlas,
		levels: readonly Uint8Array<ArrayBuffer>[],
	) {
		this.atlas = atlas;
		this.table = Int32Array.from(atlas.table);
		const { device } = ctx;
		this.texture = device.createTexture({
			size: [atlas.size, atlas.size, atlas.layers.length],
			dimension: "2d",
			format: "rgba8unorm-srgb",
			mipLevelCount: atlas.levels,
			usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
		});
		// One write a level. {@link load} has already turned the grid the bake
		// wrote into the order an array wants -- layer 0's rows, then layer
		// 1's -- so this is the same single upload it always was.
		levels.forEach((bytes, level) => {
			const wide = atlas.size >> level;
			device.queue.writeTexture(
				{ texture: this.texture, mipLevel: level },
				bytes,
				{ bytesPerRow: wide * 4, rowsPerImage: wide },
				[wide, wide, atlas.layers.length],
			);
		});
		const places = new Float32Array(atlas.layers.length * 4);
		for (let at = 0; at < atlas.layers.length; at++) {
			places[at * 4] = at;
			places[at * 4 + 3] = 1;
		}
		this.places = device.createBuffer({
			size: Math.max(16, places.byteLength),
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
		});
		device.queue.writeBuffer(this.places, 0, places);
		this.view = this.texture.createView({ dimension: "2d-array" });
		this.sampler = device.createSampler({
			magFilter: "nearest",
			minFilter: "linear",
			mipmapFilter: "linear",
			// A wall merged down a column runs its picture past 1 in `v`, so
			// the repeat is what makes a three-layer wall three pictures tall.
			addressModeU: "repeat",
			addressModeV: "repeat",
			// **No anisotropy**, because it is only allowed where all three
			// filters are linear and magnifying is nearest here. Blurring a
			// texel to gain it would give up the whole look for a sharper
			// grazing angle.
		});
		this.bandSampler = device.createSampler({
			magFilter: "nearest",
			minFilter: "linear",
			mipmapFilter: "linear",
			addressModeU: "clamp-to-edge",
			addressModeV: "clamp-to-edge",
		});
	}

	/**
	 * Fetch a bake and decode every level into the order an array texture wants.
	 *
	 * Decoded through a canvas rather than uploaded as an image, because
	 * `copyExternalImageToTexture` writes one layer at a time.
	 *
	 * **The image is a grid and the upload is layer-major**, so the rows are
	 * walked once on the way through. That indirection is the whole fix for
	 * F-134: a tall column of layers is already the byte order the upload
	 * wants and needs no walk, but its height is the tile size times the layer
	 * count, and a canvas past a maximum side returns wrong data with nothing
	 * raised. A grid keeps both sides small whatever the set grows to.
	 */
	static async load(base: string): Promise<{
		atlas: BlockAtlas;
		levels: Uint8Array<ArrayBuffer>[];
	}> {
		const atlas = (await (
			await fetch(`${base}blocks.json`)
		).json()) as BlockAtlas;
		// A bake from before the grid wrote one tile across, which walks
		// through the same code as a straight copy.
		const columns = Math.max(1, atlas.columns ?? 1);
		const rows = Math.ceil(atlas.layers.length / columns);
		const levels: Uint8Array<ArrayBuffer>[] = [];
		for (let level = 0; level < atlas.levels; level++) {
			const wide = atlas.size >> level;
			const blob = await (
				await fetch(`${base}blocks-${level}.png`)
			).blob();
			const bitmap = await createImageBitmap(blob);
			const canvas = new OffscreenCanvas(columns * wide, rows * wide);
			const flat = canvas.getContext("2d", { willReadFrequently: true })!;
			flat.drawImage(bitmap, 0, 0);
			const grid = flat.getImageData(
				0,
				0,
				columns * wide,
				rows * wide,
			).data;
			levels.push(unpackGrid(grid, wide, columns, atlas.layers.length));
		}
		return { atlas, levels };
	}
}

/**
 * A grid of tiles read out in layer order, which is what the upload wants.
 *
 * Layer `n` sits at column `n % columns` and row `n / columns`, the order the
 * bake writes. Exported so a test can hold it to that on its own, rather than
 * only through a picture nobody can check by looking.
 */
export function unpackGrid(
	grid: Uint8ClampedArray | Uint8Array,
	wide: number,
	columns: number,
	layers: number,
): Uint8Array<ArrayBuffer> {
	const out = new Uint8Array(layers * wide * wide * 4);
	const pitch = columns * wide * 4;
	for (let at = 0; at < layers; at++) {
		const x = (at % columns) * wide * 4;
		const y = Math.floor(at / columns) * wide;
		for (let row = 0; row < wide; row++) {
			const from = (y + row) * pitch + x;
			out.set(
				grid.subarray(from, from + wide * 4),
				(at * wide + row) * wide * 4,
			);
		}
	}
	return out;
}
