import type { FaceCell } from "./FaceCell.js";
import { FACES } from "../solid/icosahedron.js";

/** Turn a set of weights on global vertex numbers into an offset on `face`. */
export function offsetOn(
	face: number,
	weights: ReadonlyMap<number, number>,
): FaceCell | null {
	const ids = FACES[face]!;
	let total = 0;
	const w = ids.map((v) => {
		const x = weights.get(v) ?? 0;
		total += x;
		return x;
	});
	if (total === 0) return null;
	for (const v of weights.keys()) if (!ids.includes(v)) return null;
	return { face, i: w[1]!, j: w[2]! };
}
