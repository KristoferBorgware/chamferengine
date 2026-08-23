import type { Box } from "../../math/Box.js";

/** One box to draw, in world space, with the color to draw it in. */
export interface BoundsBox extends Box {
	readonly color: readonly [number, number, number];
}
