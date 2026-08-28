import { fbm } from "../noise/fbm.js";

/**
 * Offset from the world seed, so the ceiling wanders independently of the
 * sheet it is a ceiling over.
 *
 * A mouth opens where the ground allows one **and** the sheet happens to be
 * there. Two fields from one seed would make those the same condition again.
 */
const MOUTH_SEED_OFFSET = 13;

/**
 * How many octaves the ceiling field runs.
 *
 * Two. It is read for its **top** rather than for its zero set -- where it
 * clears `rare` is where the ceiling comes down -- so the octaves sharing zero
 * crossings, which is what {@link fbm} costs against `octaveNoise`, decides
 * nothing here. What more octaves would buy is a raggedness on the edge of a
 * dip region that is smaller than one map cell.
 */
const MOUTH_OCTAVES = 2;

/**
 * How much rock this column keeps over the roof of its caves, in metres.
 *
 * **A constant ceiling is why a cave has no way in.** The gate is a yes or a
 * no on one number, so at the shipped 6 m nothing ever breaks the ground and
 * at 0 m the sheet is near the surface everywhere and opens it everywhere:
 * there is no setting between the two, because the gate has no way to say
 * *here and not there*. Letting the depth wander over the ground puts the
 * decision somewhere -- a mouth is where the ground allows one and the sheet
 * happens to be there, which is two conditions rather than one.
 *
 * **One-sided, so the ceiling only ever comes down.** A field that moves it
 * both ways pushes the caves deeper over half the world and takes a third of
 * the void away to buy a handful of mouths.
 *
 * **Only the top of the field does anything, and where its top starts is set
 * rather than assumed.** Anything reading the whole range dips the ceiling
 * over half the ground and opens it everywhere again, which is the failure the
 * constant ceiling already had. A borrowed figure does not work either: the
 * standard deviation of an octave stack depends on how many octaves it has,
 * and over a patch a few hundred metres across the field never sees its own
 * full range -- at a 60 m feature over 95 m of ground the median reading is
 * `0.461` and `46.5%` of it clears `0.5`.
 *
 * **`vary` at zero is the constant ceiling to the bit**: the dip is multiplied
 * by nothing and no world moves.
 *
 * `x`, `y`, `z` are the column's own unit direction and `radius` is the
 * planet's own, **never the radius the ground reached**. The field is a map
 * over the sphere and a direction is the whole of a place on one; scaled by the
 * ground instead, a hill three feature widths tall would read the ceiling field
 * three features along from the plain beside it, and where a cave opens would
 * be a property of how high the ground happens to be rather than of where you
 * are. The sheet is the opposite -- it is a field in space and is read at the
 * block's own radius -- and that is the whole difference between a ceiling and
 * a passage.
 *
 * The ceiling is a fact about the column, so it is read once for the whole of
 * it rather than once a layer.
 */
export function caveCeilingAt(
	x: number,
	y: number,
	z: number,
	radius: number,
	seed: number,
	ceiling: number,
	vary: number,
	rare: number,
	scale: number,
): number {
	if (vary <= 0) return ceiling;
	const n = fbm(
		x * radius,
		y * radius,
		z * radius,
		1 / scale,
		MOUTH_OCTAVES,
		(seed + MOUTH_SEED_OFFSET) | 0,
	);
	const dip = Math.max(0, (n - rare) / Math.max(1e-6, 1 - rare));
	return ceiling - vary * dip;
}
