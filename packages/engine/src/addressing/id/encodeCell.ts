import type { CellFields } from "./CellFields.js";
import type { CellId } from "./CellId.js";
import { canonicalCell } from "../neighbours/canonicalCell.js";
import { splitPath } from "../lattice/splitPath.js";
import { CORNER_OFFSETS } from "./cellIdLayout.js";
import { shifts } from "./shifts.js";

/**
 * Pack a cell into two 32-bit halves.
 *
 * The offset is canonicalised first, so the same cell reached from either side
 * of a face edge produces the same number.
 *
 * The word is built as a `bigint`, which is exact arbitrary-precision integer
 * arithmetic and never rounds, then split into the two halves at the end. A
 * word this wide has no other way to reach every bit exactly: the fields do
 * not line up on a 32-bit boundary, so no single field's shift and mask stays
 * inside one half.
 */
export function encodeCell(fields: CellFields, depth: number): CellId {
	const n = 1 << depth;
	const c = canonicalCell(fields.face, n, fields.i, fields.j);
	const { path, q, r } = splitPath(c.i, c.j, depth, depth);

	let corner = 0;
	for (let x = 0; x < 3; x++) {
		const [cq, cr] = CORNER_OFFSETS[x]!;
		if (cq === q && cr === r) corner = x;
	}

	let pathValue = 0n;
	for (const d of path) pathValue = (pathValue << 2n) | BigInt(d);

	const s = shifts(depth);
	const word =
		(BigInt(fields.planet) << BigInt(s.planet)) |
		(BigInt(c.face) << BigInt(s.face)) |
		(pathValue << BigInt(s.path)) |
		(BigInt(corner) << BigInt(s.corner)) |
		BigInt(fields.layer);

	return [Number(word >> 32n), Number(word & 0xffffffffn)];
}
