/**
 * How a set of pictures is laid onto however many array layers a device gives.
 *
 * **The layer count is the scarce thing, not the memory.** An adapter
 * guarantees 256 array layers and commonly allows 2,048, and a set that gives
 * every picture a layer of its own is the best arrangement there is: each
 * layer carries its own mip chain down to one texel with nothing beside it to
 * bleed in, and a wall merged down a column repeats its picture by asking the
 * sampler. So that is what happens whenever the device allows it, and this
 * returns the identity.
 *
 * Past that the pictures share layers, `perSide` of them across and down.
 * **Every mip level is packed separately from the bake's own per-picture
 * levels**, so a tile's mips are still its own -- a level of the packed layer
 * is the grid of that level's tiles, which is exactly the size the layer
 * should be at that level. What packing costs is not mip quality but
 * filtering at a tile's edge, which is why {@link lodCeiling} stops the chain
 * before tiles get small enough for that to show.
 */
export interface Packing {
	/** Array layers the texture needs. */
	readonly layers: number;

	/** Tiles across one layer, and down it. `1` is a picture to a layer. */
	readonly perSide: number;

	/** Texels a side of one layer at the finest level. */
	readonly side: number;

	/**
	 * Where each picture is: `(layer, offsetU, offsetV, scale)`, four apiece.
	 *
	 * The table the shader reads. Scale is `1 / perSide`, so an unpacked set
	 * gets `uv * 1 + 0` and the frame is what it always was.
	 */
	readonly places: Float32Array<ArrayBuffer>;

	/**
	 * The coarsest mip level worth keeping, counted from the finest.
	 *
	 * A packed layer's levels stay correct while a tile is big enough that
	 * filtering inside it does not reach the tile beside it. One texel is not:
	 * at that level a tile IS a texel and any filtering at all crosses into
	 * its neighbour. Unpacked there is no neighbour, so the whole chain is
	 * kept.
	 */
	readonly levels: number;
}

/** Tiles this small in a shared layer are where filtering starts crossing. */
const SMALLEST_TILE = 4;

/**
 * Lay `count` pictures of `tile` texels onto at most `limit` array layers.
 *
 * Throws when they will not fit at all, which is a set too large for the
 * device rather than a mistake a caller can recover from.
 */
export function packPictures(
	count: number,
	tile: number,
	levels: number,
	limit: number,
): Packing {
	const pictures = Math.max(1, count);
	// A picture to a layer whenever the device allows it, which is the
	// arrangement with nothing wrong with it.
	let perSide = 1;
	while (Math.ceil(pictures / (perSide * perSide)) > limit) perSide++;
	const layers = Math.ceil(pictures / (perSide * perSide));
	const side = tile * perSide;
	const places = new Float32Array<ArrayBuffer>(
		new ArrayBuffer(pictures * 4 * 4),
	);
	const each = perSide * perSide;
	for (let at = 0; at < pictures; at++) {
		const within = at % each;
		places[at * 4] = Math.floor(at / each);
		places[at * 4 + 1] = (within % perSide) / perSide;
		places[at * 4 + 2] = Math.floor(within / perSide) / perSide;
		places[at * 4 + 3] = 1 / perSide;
	}
	// Unpacked, every level is a picture's own and the chain runs to one
	// texel. Packed, it stops where a tile would be too small to filter
	// inside.
	let keep = levels;
	if (perSide > 1) {
		keep = 1;
		while (keep < levels && tile >> keep >= SMALLEST_TILE) keep++;
	}
	return { layers, perSide, side, places, levels: keep };
}
