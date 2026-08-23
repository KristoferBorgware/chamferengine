import type { AimTarget } from "./AimTarget.js";
import { MARKER_STRIDE } from "../marker/markerGeometry.js";

/**
 * The outline of a cell as a list of line segments: the top ring, the bottom
 * ring, and one upright at each corner.
 *
 * Three positions and three color components a vertex, matching the marker's
 * layout so both draw through one shader.
 */
export function aimGeometry(target: AimTarget): Float32Array<ArrayBuffer> {
	const degree = target.corners.length;
	const segments = degree * 3;
	const out = new Float32Array(segments * 2 * MARKER_STRIDE);
	let at = 0;

	const put = (k: number, radius: number): void => {
		const c = target.corners[k]!;
		out[at] = c.x * radius;
		out[at + 1] = c.y * radius;
		out[at + 2] = c.z * radius;
		out[at + 3] = target.color[0];
		out[at + 4] = target.color[1];
		out[at + 5] = target.color[2];
		at += MARKER_STRIDE;
	};

	for (let k = 0; k < degree; k++) {
		const next = (k + 1) % degree;
		put(k, target.outer);
		put(next, target.outer);
		put(k, target.inner);
		put(next, target.inner);
		put(k, target.inner);
		put(k, target.outer);
	}
	return out;
}
