import type { CellFields } from "./CellFields.js";
import { canonicalCell } from "../neighbours/canonicalCell.js";
import { splitPath } from "../lattice/splitPath.js";
import { CORNER_OFFSETS } from "./cellIdLayout.js";
import { shifts } from "./shifts.js";

/**
 * Pack a cell into one integer.
 *
 * The offset is canonicalised first, so the same cell reached from either side
 * of a face edge produces the same number.
 */
export function encodeCell(fields: CellFields, depth: number): number {
	const n = 1 << depth;
	const c = canonicalCell(fields.face, n, fields.i, fields.j);
	const { path, q, r } = splitPath(c.i, c.j, depth, depth);

	let corner = 0;
	for (let x = 0; x < 3; x++) {
		const [cq, cr] = CORNER_OFFSETS[x]!;
		if (cq === q && cr === r) corner = x;
	}

	let pathValue = 0;
	for (const d of path) pathValue = pathValue * 4 + d;

	const s = shifts(depth);
	return (
		fields.planet * 2 ** s.planet +
		c.face * 2 ** s.face +
		pathValue * 2 ** s.path +
		corner * 2 ** s.corner +
		fields.layer
	);
}
