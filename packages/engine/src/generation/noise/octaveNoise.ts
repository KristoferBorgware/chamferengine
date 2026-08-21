import type { NoiseSettings } from "./NoiseSettings.js";
import { hash3 } from "./hash3.js";
import { valueNoise3 } from "./valueNoise3.js";

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
 * How fast a ridged octave hands its detail to the one below it.
 *
 * Above 1 the fine octaves land on ground the coarse ones already raised, which
 * is what leaves the flats flat and puts the roughness on the mountains.
 */
const RIDGE_GAIN = 2.2;

/**
 * Octaves of value noise, with the shape and the parameters of the reference
 * implementation, in `[-1, 1]`.
 *
 * `frequency` is
 * how many times the largest feature repeats around the planet, `persistence`
 * is what each octave's amplitude is multiplied by, `lacunarity` is what its
 * frequency is multiplied by, and `offsetX` and `offsetY` slide the sample
 * point through the field so the same seed gives different ground.
 *
 * Three things about the loop are fixed rather than incidental.
 *
 * **Every octave gets its own offset, hashed from the seed.** Without one, two
 * octaves of the same seeded lattice share their zero crossings wherever their
 * frequencies happen to be near a whole multiple of each other, and the ground
 * grows a faint repeating grain.
 *
 * **Octaves accumulate low frequency first.** Floating-point addition is not
 * associative, so summing them the other way round moves the result -- by
 * `1.4e-17` at four and five octaves, and by nothing at all at six and eight.
 * An error that appears at some octave counts and not others is the kind
 * testing never finds.
 *
 * **`ridge` turns a sum of smooth things into something with edges.** A sum of
 * smooth functions is smooth, so plain octaves give a field whose every summit
 * is a dome and whose every valley is a bowl -- hills, at any steepness. A
 * mountain ridge is a **crease**, and the only place a crease can come from is
 * an absolute value: `1 - |n|` folds each octave at its own zero crossing. Each
 * ridged octave is then weighted by the one above it, so the fine detail lands
 * on ground the coarse octaves already raised and the flats stay flat. At `0`
 * this is bit-for-bit the plain sum.
 *
 * **The sum is divided by the total amplitude**, so the octave count is a
 * control over shape rather than over height: adding an octave adds detail
 * without making the world taller. The result is bounded by `[-1, 1]` and does
 * not fill it -- over 200,000 directions the standard deviation is `0.244` of
 * the amplitude for the value basis, so ground stated as 600 m tall swings
 * about 150 m typically and reaches 600 only where several octaves align.
 */
export function octaveNoise(
	x: number,
	y: number,
	z: number,
	seed: number,
	settings: NoiseSettings,
): number {
	let sum = 0;
	let amplitude = 1;
	let total = 0;
	let f = settings.frequency;
	let weight = 1;
	const ridge = settings.ridge;
	for (let o = 0; o < settings.octaves; o++) {
		const ox =
			(2 * hash3(o, 0, 0, seed) - 1) * OCTAVE_SPREAD + settings.offsetX;
		const oy =
			(2 * hash3(o, 1, 0, seed) - 1) * OCTAVE_SPREAD + settings.offsetY;
		const oz = (2 * hash3(o, 2, 0, seed) - 1) * OCTAVE_SPREAD;
		const n = valueNoise3(x * f + ox, y * f + oy, z * f + oz, seed);
		let signal = n;
		if (ridge > 0) {
			// `1 - |n|` folds the octave at its own zero crossing, and the fold
			// is a crease. Squaring sharpens it and pulls the low ground down.
			const fold = 1 - Math.abs(n);
			const crease = fold * fold;
			signal = n * (1 - ridge) + (crease * 2 - 1) * ridge;
			signal *= weight;
			weight = Math.min(
				1,
				Math.max(0, 1 - ridge + ridge * crease * RIDGE_GAIN),
			);
		}
		sum += amplitude * signal;
		total += amplitude;
		amplitude *= settings.persistence;
		f *= settings.lacunarity;
	}
	return total > 0 ? sum / total : 0;
}
