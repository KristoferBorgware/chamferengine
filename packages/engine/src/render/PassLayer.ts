import type { Frame } from "./Frame.js";

/**
 * Something drawn around the terrain in the same pass.
 *
 * `before` runs ahead of the opaque terrain, which is where a sky goes: it
 * fills every pixel at the far plane and the ground draws over it. `after` runs
 * with the translucent pass, which is where clouds go.
 *
 * The terrain renderer knows only these two moments. What fills them is not its
 * concern.
 */
export interface PassLayer {
	before?(pass: GPURenderPassEncoder, frame: Frame): void;
	after?(pass: GPURenderPassEncoder, frame: Frame): void;
}
