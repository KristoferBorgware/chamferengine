import type { BoundsBox } from "./BoundsBox.js";
import { MARKER_STRIDE } from "../marker/markerGeometry.js";

/**
 * A list of boxes as their twelve edges each.
 *
 * Edges rather than shaded faces: what is being read is where a boundary sits
 * and how big it is against the ground inside it, and a solid would hide the
 * ground it is drawn around.
 *
 * Three positions and three color components a vertex, matching the marker's
 * layout so both draw through one shader.
 */
export function boundsGeometry(
	boxes: readonly BoundsBox[],
): Float32Array<ArrayBuffer> {
	const out = new Float32Array(boxes.length * 12 * 2 * MARKER_STRIDE);
	let at = 0;

	// The eight corners, indexed by which way each axis is taken. An edge joins
	// two corners differing in exactly one axis, which is what the pairs below
	// spell out: four along each axis in turn.
	const EDGES: [number, number][] = [];
	for (let corner = 0; corner < 8; corner++)
		for (let axis = 0; axis < 3; axis++) {
			const other = corner | (1 << axis);
			if (other !== corner) EDGES.push([corner, other]);
		}

	for (const box of boxes) {
		const corner = (which: number): [number, number, number] => {
			const p: [number, number, number] = [
				box.center[0],
				box.center[1],
				box.center[2],
			];
			for (let n = 0; n < 3; n++) {
				const axis = box.axes[n]!;
				const reach =
					(which & (1 << n)) === 0 ? -box.halves[n]! : box.halves[n]!;
				p[0] += axis[0] * reach;
				p[1] += axis[1] * reach;
				p[2] += axis[2] * reach;
			}
			return p;
		};
		for (const [a, b] of EDGES)
			for (const p of [corner(a), corner(b)]) {
				out[at] = p[0];
				out[at + 1] = p[1];
				out[at + 2] = p[2];
				out[at + 3] = box.color[0];
				out[at + 4] = box.color[1];
				out[at + 5] = box.color[2];
				at += MARKER_STRIDE;
			}
	}
	return out;
}
