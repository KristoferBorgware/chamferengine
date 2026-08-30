import { CUTOUT } from "./opacityOf.js";

/**
 * Whether a cell hiding `here` draws its face toward a cell hiding `there`.
 *
 * The ordinary answer is the comparison {@link opacityOf} was built for: a
 * cell draws where it hides more than what is next to it, so exactly one of
 * any two neighbours draws the wall between them and nothing is drawn twice.
 *
 * **A cutout breaks the "exactly one" and has to.** A leaf against a leaf
 * hides more than nothing on both sides at once -- a look through a hole in
 * the near one reaches the far one, and if the far one drew no face the look
 * carries on to the sky behind the tree. So either side being a cutout draws,
 * and a canopy is geometry all the way through rather than a hollow shell.
 * Measured on four chunks of real forest, that is **4.26x** the leaf faces and
 * puts a face on the **5,938 of 19,835** leaf cells that have none at all
 * today (`tools/trial-leaf-cutout.ts`).
 */
export function showsFace(here: number, there: number): boolean {
	if (here === 0) return false;
	if (here === CUTOUT || there === CUTOUT) return true;
	return here > there;
}
