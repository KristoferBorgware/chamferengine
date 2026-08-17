import type { CellFields } from "./CellFields.js";
import type { CellId } from "./CellId.js";
import { joinPath } from "../lattice/joinPath.js";
import {
	CORNER_BITS,
	CORNER_OFFSETS,
	FACE_BITS,
	LAYER_BITS,
	PLANET_BITS,
} from "./cellIdLayout.js";
import { shifts } from "./shifts.js";

/** Take a packed cell apart again. */
export function decodeCell(id: CellId, depth: number): CellFields {
	const [high, low] = id;
	const word = (BigInt(high >>> 0) << 32n) | BigInt(low >>> 0);

	const s = shifts(depth);
	const field = (shift: number, bits: number) =>
		Number((word >> BigInt(shift)) & ((1n << BigInt(bits)) - 1n));

	const planet = field(s.planet, PLANET_BITS);
	const face = field(s.face, FACE_BITS);
	const pathValue = field(s.path, 2 * depth);
	const corner = field(s.corner, CORNER_BITS);
	const layer = field(0, LAYER_BITS);

	const path: number[] = [];
	for (let l = depth - 1; l >= 0; l--)
		path.push(Math.floor(pathValue / 4 ** l) % 4);

	const [q, r] = CORNER_OFFSETS[corner]!;
	const [i, j] = joinPath(path, q, r, depth);
	return { planet, face, i, j, layer };
}
