import type { GpuContext } from "../gpu/GpuContext.js";
import { type Packing, packPictures } from "./packPictures.js";
import { slotToReuse } from "./slotToReuse.js";

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

	/** How the set was laid out, which says whether layers are shared. */
	readonly packing: Packing;

	/**
	 * The decoded pictures, held so one can be taken in later.
	 *
	 * **In RAM rather than on the GPU**, which is the trade this whole thing
	 * makes: video memory is the scarce one, and a picture nothing draws costs
	 * nothing there while still being ready the moment something does.
	 */
	private readonly decoded: readonly Uint8Array<ArrayBuffer>[];

	/** Which slot each stored picture sits in, and where the free ones start. */
	private readonly slotOf = new Map<number, number>();
	private readonly pictureAt: number[] = [];
	private readonly usedAt: number[] = [];
	private filled = 0;

	/** Ticks up per admission, which is all the recency this needs. */
	private clock = 0;

	/**
	 * How many pictures have been taken back, and how often that was refused.
	 *
	 * **Reported because a pool that thrashes and a pool that never fills look
	 * the same from outside**: both draw the right picture. Taken back climbing
	 * steadily while somebody walks is the first sign the pool is too small for
	 * the way the world is being played, and refused climbing means slots are
	 * all holding something visible.
	 */
	private takenBack = 0;
	private refused = 0;

	constructor(
		ctx: GpuContext,
		atlas: BlockAtlas,
		levels: readonly Uint8Array<ArrayBuffer>[],
		/** Layers to fit into, for a test that wants the packed path. */
		limit?: number,
		/** Pictures to store, or nothing for all of them. */
		resident?: ReadonlySet<number>,
		/** Slots to lay out, when more are wanted than are filled now. */
		capacity?: number,
	) {
		this.atlas = atlas;
		this.table = Int32Array.from(atlas.table);
		const { device } = ctx;
		// **Asked of the device, not assumed.** 256 array layers are
		// guaranteed everywhere and 2,048 is common, so most machines give
		// every picture a layer of its own and this is the identity.
		// **The coarsest level a bake writes is one texel a picture, which IS
		// that picture's average.** So the colour a missing picture falls back
		// to costs nothing to work out and nothing to carry.
		const flattest = levels[atlas.levels - 1];
		const averageOf = (picture: number): [number, number, number] => {
			const at = picture * 4;
			return flattest
				? [
						(flattest[at] ?? 255) / 255,
						(flattest[at + 1] ?? 255) / 255,
						(flattest[at + 2] ?? 255) / 255,
					]
				: [1, 1, 1];
		};
		const packing = packPictures(
			atlas.layers.length,
			atlas.size,
			atlas.levels,
			Math.max(1, limit ?? device.limits.maxTextureArrayLayers),
			resident,
			averageOf,
			capacity,
		);
		this.packing = packing;
		this.texture = device.createTexture({
			size: [packing.side, packing.side, packing.layers],
			dimension: "2d",
			format: "rgba8unorm-srgb",
			mipLevelCount: packing.levels,
			usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
		});
		// One write a level. {@link load} has already turned the grid the bake
		// wrote into the order an array wants -- layer 0's rows, then layer
		// 1's -- so this is the same single upload it always was.
		if (packing.order.length > 0)
			levels.slice(0, packing.levels).forEach((bytes, level) => {
				const wide = atlas.size >> level;
				const side = packing.side >> level;
				// Unpacked this is the bytes as they came; packed it is the same
				// tiles laid into shared layers, level by level, so a tile's mips
				// stay its own rather than being averaged with its neighbours'.
				const whole =
					packing.perSide === 1 &&
					packing.order.length === atlas.layers.length;
				const laid = whole ? bytes : intoLayers(bytes, wide, packing);
				device.queue.writeTexture(
					{ texture: this.texture, mipLevel: level },
					laid,
					{ bytesPerRow: side * 4, rowsPerImage: side },
					[side, side, packing.layers],
				);
			});
		this.decoded = levels;
		packing.order.forEach((picture, slot) => {
			this.slotOf.set(picture, slot);
			this.pictureAt[slot] = picture;
			this.usedAt[slot] = 0;
		});
		this.filled = packing.order.length;
		this.places = device.createBuffer({
			size: Math.max(16, packing.places.byteLength),
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
		});
		device.queue.writeBuffer(this.places, 0, packing.places);
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

	/** Whether a picture is on the GPU rather than drawing as a flat colour. */
	holds(picture: number): boolean {
		return this.slotOf.has(picture);
	}

	/** Pictures actually on the GPU, against the room there is for them. */
	get held(): number {
		return this.filled;
	}

	/** Pictures taken back to make room, and times there was nothing to take. */
	get churn(): { taken: number; refused: number } {
		return { taken: this.takenBack, refused: this.refused };
	}

	/** Slots left for pictures nobody expected. */
	get room(): number {
		return this.packing.slots - this.filled;
	}

	/**
	 * Put a picture the world turned out to need into a free slot.
	 *
	 * **One tile written, not the whole texture.** A world finds out what it
	 * needs by drawing itself, so this runs while somebody is walking around:
	 * re-laying every picture to take one in would be a hitch every time a
	 * block nobody predicted came on screen. A tile is a sub-rectangle of one
	 * layer at each level, which is a handful of small copies, and the table
	 * entry is sixteen bytes.
	 *
	 * Returns false when there is no room, and the picture goes on drawing as
	 * its own average colour -- which is a worse picture and never a wrong one.
	 */
	admit(
		picture: number,
		device: GPUDevice,
		/**
		 * Pictures something is drawing, which must not be taken back.
		 *
		 * **Required rather than optional**, because the safe default is not
		 * writable: forgetting it would have to mean protecting everything,
		 * and a caller who meant to protect nothing would then silently get a
		 * pool that never evicts. Saying what is on screen is the caller's
		 * job, and it is the only thing it has to get right.
		 */
		keep: ReadonlySet<number>,
	): boolean {
		const already = this.slotOf.get(picture);
		if (already !== undefined) {
			this.usedAt[already] = ++this.clock;
			return true;
		}
		let slot: number;
		if (this.filled < this.packing.slots) slot = this.filled++;
		else {
			// Full. Take back the picture nobody is drawing that was named
			// longest ago, or give up and draw flat if they are all on screen.
			slot = slotToReuse(this.usedAt, this.pictureAt, keep);
			if (slot < 0) {
				this.refused++;
				return false;
			}
			this.takenBack++;
			this.release(slot, device);
		}
		this.slotOf.set(picture, slot);
		this.pictureAt[slot] = picture;
		this.usedAt[slot] = ++this.clock;
		const { perSide } = this.packing;
		const each = perSide * perSide;
		const layer = Math.floor(slot / each);
		const within = slot % each;
		for (let level = 0; level < this.packing.levels; level++) {
			const wide = this.atlas.size >> level;
			const bytes = this.decoded[level];
			if (!bytes) break;
			const from = picture * wide * wide * 4;
			device.queue.writeTexture(
				{
					texture: this.texture,
					mipLevel: level,
					origin: {
						x: (within % perSide) * wide,
						y: Math.floor(within / perSide) * wide,
						z: layer,
					},
				},
				bytes.subarray(from, from + wide * wide * 4),
				{ bytesPerRow: wide * 4, rowsPerImage: wide },
				[wide, wide, 1],
			);
		}
		// The table entry alone: where it now is, rather than the colour it
		// was standing in for.
		const place = new Float32Array([
			layer,
			(within % perSide) / perSide,
			Math.floor(within / perSide) / perSide,
			1 / perSide,
		]);
		device.queue.writeBuffer(this.places, picture * 16, place);
		this.packing.places.set(place, picture * 4);
		return true;
	}

	/**
	 * Hand a slot's picture back, so it draws as its own colour again.
	 *
	 * The texels are left where they are: nothing reads them once the table
	 * stops pointing at them, and the picture taking the slot overwrites them
	 * immediately.
	 */
	private release(slot: number, device: GPUDevice): void {
		const picture = this.pictureAt[slot];
		if (picture === undefined) return;
		this.slotOf.delete(picture);
		const colour = this.averageOf(picture);
		const place = new Float32Array([-1, colour[0], colour[1], colour[2]]);
		device.queue.writeBuffer(this.places, picture * 16, place);
		this.packing.places.set(place, picture * 4);
	}

	/**
	 * A picture's own average colour, which is its coarsest mip level.
	 *
	 * One texel a picture at that level, so this is a read rather than a sum.
	 */
	private averageOf(picture: number): [number, number, number] {
		const flattest = this.decoded[this.atlas.levels - 1];
		const at = picture * 4;
		return flattest
			? [
					(flattest[at] ?? 255) / 255,
					(flattest[at + 1] ?? 255) / 255,
					(flattest[at + 2] ?? 255) / 255,
				]
			: [1, 1, 1];
	}

	/**
	 * Give back the texture and the table.
	 *
	 * **A rebuild replaces this whole object**, so what it held has to go with
	 * it: a device does not free a texture because nothing refers to it any
	 * more, and moving a knob that rebuilds this is something a person does
	 * repeatedly.
	 */
	destroy(): void {
		this.texture.destroy();
		this.places.destroy();
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
 * Layer-order tiles laid into shared array layers, `perSide` across and down.
 *
 * **Every level is packed from that level's own tiles**, so a picture's mips
 * are still the ones the bake computed for it and never an average with the
 * picture beside it. What sharing a layer really costs is filtering at a
 * tile's edge, which is why the chain stops before tiles get small.
 *
 * Cells past the last picture are left transparent and never read.
 */
function intoLayers(
	tiles: Uint8Array<ArrayBuffer>,
	wide: number,
	packing: Packing,
): Uint8Array<ArrayBuffer> {
	const side = packing.perSide * wide;
	const out = new Uint8Array<ArrayBuffer>(
		new ArrayBuffer(packing.layers * side * side * 4),
	);
	const each = packing.perSide * packing.perSide;
	packing.order.forEach((picture, slot) => {
		const layer = Math.floor(slot / each);
		const within = slot % each;
		const x = (within % packing.perSide) * wide * 4;
		const y = Math.floor(within / packing.perSide) * wide;
		for (let row = 0; row < wide; row++) {
			const from = (picture * wide + row) * wide * 4;
			out.set(
				tiles.subarray(from, from + wide * 4),
				(layer * side + y + row) * side * 4 + x,
			);
		}
	});
	return out;
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
