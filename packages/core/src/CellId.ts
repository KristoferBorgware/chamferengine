import { canonicalCell } from "./cellRepresentations.js";
import { joinPath } from "./joinPath.js";
import { splitPath } from "./splitPath.js";

/**
 * The stored word, most significant field first:
 *
 *     [planet 12][face 5][path 2 x depth][corner 2][layer 10]
 *
 * At depth 11 that is 51 bits, which sits inside the range `float64` represents
 * exactly, so an ID is a plain `number`. JavaScript's bitwise operators work on
 * 32 bits and would silently truncate, so every field is extracted with
 * multiply and divide instead.
 */
export const PLANET_BITS = 12;
export const FACE_BITS = 5;
export const CORNER_BITS = 2;
export const LAYER_BITS = 10;

/** How many layers the layer field addresses. */
export const LAYER_COUNT = 2 ** LAYER_BITS;

/** A cell taken apart into the fields the word carries. */
export interface CellFields {
	readonly planet: number;
	readonly face: number;
	readonly i: number;
	readonly j: number;
	readonly layer: number;
}

/** Where each field starts, counting from the least significant bit. */
function shifts(depth: number) {
	const corner = LAYER_BITS;
	const path = corner + CORNER_BITS;
	const face = path + 2 * depth;
	const planet = face + FACE_BITS;
	return { corner, path, face, planet, width: planet + PLANET_BITS };
}

/** How wide the word is at a given subdivision depth. */
export function wordBits(depth: number): number {
	return shifts(depth).width;
}

/** The three corners of a depth-`depth` triangle, as leftover offsets. */
const CORNER_OFFSETS: readonly (readonly [number, number])[] = [
	[0, 0],
	[1, 0],
	[0, 1],
];

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

/** Take a packed cell apart again. */
export function decodeCell(id: number, depth: number): CellFields {
	const s = shifts(depth);
	const field = (shift: number, bits: number) =>
		Math.floor(id / 2 ** shift) % 2 ** bits;

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

/**
 * The chunk a cell belongs to, as the same word with everything below the chunk
 * cut set to zero.
 *
 * The cut is a place to read rather than a stored field, so moving it changes
 * no bit of any stored ID.
 */
export function chunkOf(id: number, depth: number, chunkLevel: number): number {
	const s = shifts(depth);
	const low = s.path + 2 * (depth - chunkLevel);
	return Math.floor(id / 2 ** low) * 2 ** low;
}
