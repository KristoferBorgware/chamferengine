import type { BoundsBall } from "./BoundsBall.js";
import { MARKER_STRIDE } from "../marker/markerGeometry.js";

/** How many segments each ring is drawn with. */
const SEGMENTS = 24;

/**
 * A list of balls as three rings each, one on each pair of world axes.
 *
 * Rings rather than a shaded sphere: what is being read is where a boundary
 * sits and how big it is against the ground inside it, and a solid would hide
 * the ground it is drawn around. Three is what says "ball" rather than "circle
 * facing the camera" from any direction.
 *
 * Three positions and three color components a vertex, matching the marker's
 * layout so both draw through one shader.
 */
export function boundsGeometry(
	balls: readonly BoundsBall[],
): Float32Array<ArrayBuffer> {
	const out = new Float32Array(
		balls.length * 3 * SEGMENTS * 2 * MARKER_STRIDE,
	);
	let at = 0;

	const put = (x: number, y: number, z: number, c: BoundsBall): void => {
		out[at] = c.center[0] + x;
		out[at + 1] = c.center[1] + y;
		out[at + 2] = c.center[2] + z;
		out[at + 3] = c.color[0];
		out[at + 4] = c.color[1];
		out[at + 5] = c.color[2];
		at += MARKER_STRIDE;
	};

	for (const ball of balls) {
		const r = ball.radius;
		for (let s = 0; s < SEGMENTS; s++) {
			const a = (s / SEGMENTS) * Math.PI * 2;
			const b = ((s + 1) / SEGMENTS) * Math.PI * 2;
			const ca = Math.cos(a) * r;
			const sa = Math.sin(a) * r;
			const cb = Math.cos(b) * r;
			const sb = Math.sin(b) * r;
			put(ca, sa, 0, ball);
			put(cb, sb, 0, ball);
			put(ca, 0, sa, ball);
			put(cb, 0, sb, ball);
			put(0, ca, sa, ball);
			put(0, cb, sb, ball);
		}
	}
	return out;
}
