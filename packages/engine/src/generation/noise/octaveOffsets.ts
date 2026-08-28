import { hash3 } from "./hash3.js";

/**
 * How far an octave's own offset may reach, in lattice units.
 *
 * Its only job is to put each octave somewhere else in the field, so two
 * octaves never line up their features. The reference implementation this
 * follows draws from `-100000` to `100000`; a thousand is as good and keeps
 * the lattice coordinate small enough that the integer floor inside
 * the noise basis is exact at every frequency the panel can reach.
 */
const OCTAVE_SPREAD = 1000;

/**
 * Every octave's own offset, held per seed rather than hashed per sample.
 *
 * **An octave's offset is a property of the octave and the seed.** It does not
 * depend on the point being sampled, so it is three hashes that would otherwise
 * run at every sample of every octave -- over a coarse map, three per cell per
 * octave; over a leaf cut, where one octave is read at every candidate cell of
 * every cluster, the larger half of what {@link octaveNoise} itself costs.
 *
 * The stored value is `(2 * hash - 1) * OCTAVE_SPREAD`, and the settings' own
 * offset is added at the point of use, so the argument handed to the basis is a
 * `double` either way.
 *
 * Keyed by seed and grown to the deepest octave count that seed has been asked
 * for. A world uses a handful of seeds -- one per layer, plus the few a lab
 * adds for a bend or a cut -- so this never grows into a leak.
 */
const OCTAVE_OFFSETS = new Map<number, Float64Array>();

/**
 * One seed's octave offsets, as `x, y, z` per octave.
 *
 * A caller that reads a single octave directly uses these: one octave with no
 * fold **is** the basis at that octave's own offset, because `octaveNoise`
 * scales it by an amplitude of 1 and divides by a summed amplitude of 1. So the
 * basis read with these three numbers returns the same double, without a map
 * lookup, a loop and a divide at every sample.
 */
export function octaveOffsets(seed: number, octaves: number): Float64Array {
	const held = OCTAVE_OFFSETS.get(seed);
	if (held && held.length >= octaves * 3) return held;
	const made = new Float64Array(octaves * 3);
	for (let o = 0; o < octaves; o++) {
		made[o * 3] = (2 * hash3(o, 0, 0, seed) - 1) * OCTAVE_SPREAD;
		made[o * 3 + 1] = (2 * hash3(o, 1, 0, seed) - 1) * OCTAVE_SPREAD;
		made[o * 3 + 2] = (2 * hash3(o, 2, 0, seed) - 1) * OCTAVE_SPREAD;
	}
	OCTAVE_OFFSETS.set(seed, made);
	return made;
}
