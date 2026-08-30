import { CUTOUT } from "./opacityOf.js";

/**
 * Whether a cell hiding `here` draws its face toward a cell hiding `there`.
 *
 * The ordinary answer is the comparison {@link opacityOf} was built for: a
 * cell draws where it hides more than what is next to it, so exactly one of
 * any two neighbours draws the wall between them and nothing is drawn twice.
 *
 * **A cutout breaks the comparison and not the "exactly one".** A leaf against
 * a leaf hides more than nothing on both sides at once -- a look through a hole
 * in the near one reaches the far one, and if the far one drew no face the look
 * would carry on to the sky behind the tree. Measured on four chunks of real
 * forest, a leaf meets another leaf across **65.8%** of all leaf faces and its
 * own trunk across another **10.7%**, so a canopy with none of them is a hollow
 * shell: **5,938 of 19,835** leaf cells have no face at all.
 *
 * So both of those boundaries get a face -- **one face, drawn from both
 * sides**, never two coincident ones. Back-face culling would have thrown one
 * of a pair away from any given eye, so a pair costs twice the vertices and
 * twice the memory to rasterise exactly as many fragments. Which of the two
 * cells emits it:
 *
 * - **A cutout against solid: the solid one.** Its face has no holes in it,
 *   which is what a look through a leaf at a trunk has to find. The leaf's own
 *   face there would be see-through with nothing behind it.
 * - **A cutout against air or water: the cutout.** It hides more, which is the
 *   ordinary rule.
 * - **A cutout against a cutout: whichever `mine` says.** Nothing about the two
 *   cells distinguishes them, so the caller settles it -- and it must settle it
 *   the same way from either side, or a boundary gets two faces or none.
 */
export function showsFace(here: number, there: number, mine = true): boolean {
	if (here === 0) return false;
	if (here === CUTOUT) return there === CUTOUT ? mine : there < 2;
	if (there === CUTOUT) return here === 2;
	return here > there;
}
