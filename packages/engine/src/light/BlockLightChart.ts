/**
 * Whether a cell stops light, named by an extended lattice coordinate on one
 * face and a layer.
 *
 * The coordinate is the chart's, not a canonical address: `(i, j)` may sit
 * outside its face's own triangle, and `latticeCell` is what turns one into
 * the cell it names.
 */
export type SolidAt = (
	face: number,
	i: number,
	j: number,
	layer: number,
) => boolean;

/**
 * A light source's reach, as a cube of levels around the cell it stands in.
 *
 * **The lattice of one face, extended.** A cell is named by how far it is from
 * the source along the source's own face coordinates -- `di`, `dj` and a layer
 * offset `dl` -- and a coordinate that leaves the face still names exactly one
 * cell, because a lattice point is integer weights on global vertex numbers
 * and crossing an edge only rewrites the name. So the whole neighbourhood is
 * one dense array with a constant stride, and a fragment shader finds its own
 * entry from the same three numbers: the face's barycentric solve gives a
 * fractional `(i, j)` directly, and the radius gives the layer.
 *
 * `levels` runs `side` entries along each of `di`, `dj` and `dl`, with `di`
 * fastest. A level is the fraction of full brightness the cell holds, so it
 * needs no scale to read: full at the source and falling by `1 / (range + 1)`
 * a step, which leaves the cell `range` steps out with the dimmest level
 * there is.
 *
 * `side` is `2 * range + 3` at the widest range the source can carry, which is
 * one entry of margin past the furthest lit cell in each direction so a
 * filtered read at the rim has neighbours to blend with.
 */
export interface BlockLightChart {
	/** The face whose lattice names every entry. */
	readonly face: number;

	/** The source cell, in that face's own coordinates. */
	readonly i: number;
	readonly j: number;
	readonly layer: number;

	/** How many steps the light carries, and what it is worth at the source. */
	readonly range: number;

	/** Entries along one axis. */
	readonly side: number;

	/** `side^3` levels, `di` fastest and `dl` slowest. */
	readonly levels: Uint8Array<ArrayBuffer>;
}
