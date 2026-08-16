import {
	CORNER_BITS,
	FACE_BITS,
	LAYER_BITS,
	PLANET_BITS,
} from "./cellIdLayout.js";

/** Where each field starts, counting from the least significant bit. */
export function shifts(depth: number) {
	const corner = LAYER_BITS;
	const path = corner + CORNER_BITS;
	const face = path + 2 * depth;
	const planet = face + FACE_BITS;
	return { corner, path, face, planet, width: planet + PLANET_BITS };
}
