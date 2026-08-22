import type { CellRef } from "./CellRef.js";
import { joinPath } from "../addressing/index.js";

/**
 * Turn a chunk key and a slot back into a cell's lattice offset.
 *
 * The inverse of `cellSlot`, and the reason a store carries a header: a slot is
 * a rank inside a triangle of side `2 ^ (subdivisionDepth - chunkLevel)`, so it
 * names a cell only once those two numbers are known.
 *
 * The rank is unpicked by walking rows rather than by inverting the formula:
 * `rank(q, r) = q + r(2m + 3 - r) / 2` is a quadratic in `r`, and a triangle of
 * 2,145 slots is walked in a few dozen steps by subtracting row lengths.
 */
export function slotCell(
	chunkKey: number,
	slot: number,
	layer: number,
	subdivisionDepth: number,
	chunkLevel: number,
): CellRef {
	const span = 4 ** chunkLevel;
	const face = Math.floor(chunkKey / span);
	let value = chunkKey % span;
	const path = new Array<number>(chunkLevel);
	for (let level = chunkLevel - 1; level >= 0; level--) {
		path[level] = value % 4;
		value = Math.floor(value / 4);
	}

	const m = 1 << (subdivisionDepth - chunkLevel);
	let r = 0;
	let left = slot;
	while (left > m - r) {
		left -= m - r + 1;
		r++;
	}
	const [i, j] = joinPath(path, left, r, subdivisionDepth);
	return { face, i, j, layer };
}
