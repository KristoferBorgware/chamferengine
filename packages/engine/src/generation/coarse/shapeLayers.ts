import type { CoarseMapOptions } from "./CoarseMapOptions.js";
import type { LayerNoise } from "./layerNoise.js";
import type { LayeredField } from "./layeredHeight.js";
import { COARSE_MAP_DEFAULTS } from "./CoarseMapOptions.js";
import { splineAt } from "./splineAt.js";

/**
 * How much erosion takes away here: `0` leaves the ground alone, `1` takes all
 * of the relief.
 *
 * **Pulled out because the height reads it twice**, once to flatten the relief
 * and once to lower the level -- the two are one minus a share of the same cut,
 * and writing it out twice is how they drift apart.
 */
export function erosionCut(
	said: number,
	options: CoarseMapOptions = {},
): number {
	const s = { ...COARSE_MAP_DEFAULTS, ...options };
	return s.erosionLayer ? splineAt(s.erosion.curve, said) : 0;
}

/**
 * The three readings turned into one height, in metres above sea level.
 *
 * **This is the whole model.**
 *
 * - The continentalness curve **is a height, not a land-or-sea switch**. Its
 *   **middle is the waterline**, and the two halves scale apart: up to `relief`
 *   above it, down to `seaDepth` below, so its answer is already in metres --
 *   an ocean floor at one end, the top of a plateau at the other. Which of
 *   those is coast falls out of it rather than being decided by it, and **only
 *   the curve decides it**.
 * - The erosion curve answers **how much erosion takes away here**, from none
 *   of it to all of it. What is left of the relief is `1 - cut`, so a region
 *   the curve sends to `1` is flat whatever the third field is doing.
 * - The peaks-and-valleys curve is the relief, signed: its `0.5` is the level
 *   the continent set, below it cuts a valley and above it raises a peak.
 *
 * **Erosion does two things: it flattens, and it lowers.** It takes the relief
 * outright -- what survives is `1 - cut` -- and it takes the level in
 * proportion to `erosionBite`, because water wears a range down as well as
 * smoothing it. Turn that all the way up and land the curve fully cuts is
 * flattened and lowered together and ends at sea level; turn it off and the
 * level keeps all of its height while only the bumps go.
 *
 * **Below sea level nothing is worn**: the ocean floor is not what the rain is
 * falling on, and wearing it would lift the sea bed toward the surface.
 *
 * **Each layer's off is an exact statement about what it contributes**, not a
 * hidden default. Erosion off keeps all of the relief, which is the multiply's
 * own neutral; peaks off adds none, which is the sum's. Continentalness has no
 * neutral -- something has to set the level -- so off reads its curve at the
 * middle of the field, which is the one level a field with nothing to say would
 * give: a flat plain, and whatever the other two do on top of it.
 */
export function heightFrom(
	continent: number,
	erosion: number,
	peaks: number,
	options: CoarseMapOptions = {},
): number {
	const s = { ...COARSE_MAP_DEFAULTS, ...options };
	const level = splineAt(s.continent.curve, s.continentLayer ? continent : 0);
	// **Land and the sea floor scale apart, each to its own knob.** The curve's
	// middle is the waterline, so above it `relief` alone says how tall land
	// gets and below it `seaDepth` alone says how deep the floor goes. One
	// scale for the whole axis looks obvious and is what makes a sea-depth knob
	// flood the world: it rescales the metres a curve point is worth, which
	// drags sea level across the curve and moves the coast.
	const base =
		level >= 0.5
			? ((level - 0.5) / 0.5) * s.relief
			: -((0.5 - level) / 0.5) * s.seaDepth;
	const cut = erosionCut(erosion, s);
	const swing = s.peaksLayer ? splineAt(s.peaks.curve, peaks) * 2 - 1 : 0;
	const over = base - s.seaLevel;
	const worn = 1 - s.erosionBite * cut;
	// **Metres above sea level, and not metres on an absolute datum.** The
	// engine's whole downstream rests on `elevation > 0` being the question
	// "is this land": nothing stores a sea level, the shore material reads
	// zero, and the sea is a radius. The lab this model comes from carries the
	// datum in the number and compares against it everywhere, which is one
	// more thing every reader has to know. Subtracting it here makes `seaLevel`
	// a real drain -- at no erosion bite it lifts the whole field by exactly
	// its own metres and moves no ground -- and leaves the shore where the
	// curve's middle put it.
	return (over > 0 ? over * worn : over) + (1 - cut) * swing * s.peakRelief;
}

/**
 * The surface in metres, from three stacks already read.
 *
 * Everything in {@link layeredHeight} except the octave stacks: the three
 * curves, the three switches and every metre knob. Held apart because they are
 * dragged and the stacks are not -- a curve moved on the bench re-runs this
 * pass alone over fields that are already in memory.
 *
 * **There is no percentile fit and no land fraction.** The height comes out in
 * metres here rather than being scaled into them afterwards, because the
 * continentalness curve's middle *is* the waterline: how much land there is
 * falls out of the curve and is read back off the field, and no metre knob
 * moves the shore. Fitting sea level to an asked-for land share instead meant
 * that dragging Relief moved the coast, since the fit divides by the field's
 * own peak.
 */
export function shapeLayers(
	noise: LayerNoise,
	options: CoarseMapOptions = {},
): LayeredField {
	const s = { ...COARSE_MAP_DEFAULTS, ...options };
	const count = noise.continent.length;

	const raw = new Float64Array(count);
	const continentOf = new Float32Array(count);
	const erosionOf = new Float32Array(count);
	const peaksOf = new Float32Array(count);
	let dry = 0;
	for (let cell = 0; cell < count; cell++) {
		const c = noise.continent[cell]!;
		const e = noise.erosion[cell]!;
		const p = noise.peaks[cell]!;
		continentOf[cell] = splineAt(s.continent.curve, c);
		erosionOf[cell] = splineAt(s.erosion.curve, e);
		peaksOf[cell] = splineAt(s.peaks.curve, p);
		const height = heightFrom(c, e, p, s);
		raw[cell] = height;
		if (height > 0) dry++;
	}
	return {
		raw,
		continent: continentOf,
		erosion: erosionOf,
		peaks: peaksOf,
		land: dry / Math.max(1, count),
	};
}
