import type { Mat4 } from "../math/Mat4.js";

/** What one frame needs: where the camera is, and where it is looking. */
export interface Frame {
	readonly viewProj: Mat4;
	readonly eye: readonly [number, number, number];
}
