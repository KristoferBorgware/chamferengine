import type { FaceCell } from "./FaceCell.js";
import { cellRepresentations } from "./cellRepresentations.js";

/**
 * The one representation an ID is built from.
 *
 * The face number is the most significant field below the planet, so the
 * lowest face gives the lowest packed value. That is the same rule that awards
 * a border cell to the lowest chunk containing it, applied one level up.
 */
export function canonicalCell(
	face: number,
	n: number,
	i: number,
	j: number,
): FaceCell {
	const all = cellRepresentations(face, n, i, j);
	let best = all[0]!;
	for (const c of all) if (c.face < best.face) best = c;
	return best;
}
