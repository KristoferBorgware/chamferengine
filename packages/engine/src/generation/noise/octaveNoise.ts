import type { NoiseCorners } from "./NoiseCorners.js";
import type { NoiseSettings } from "./NoiseSettings.js";
import { octaveOffsets } from "./octaveOffsets.js";
import { valueNoise3 } from "./valueNoise3.js";

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
	corners: NoiseCorners | null = null,
): number {
	let sum = 0;
	let amplitude = 1;
	let total = 0;
	let f = settings.frequency;
	let weight = 1;
	const ridge = settings.ridge;
	const spread = octaveOffsets(seed, settings.octaves);
	for (let o = 0; o < settings.octaves; o++) {
		const ox = spread[o * 3]! + settings.offsetX;
		const oy = spread[o * 3 + 1]! + settings.offsetY;
		const oz = spread[o * 3 + 2]!;
		const n = valueNoise3(
			x * f + ox,
			y * f + oy,
			z * f + oz,
			seed,
			corners && o < corners.slots ? corners : null,
			o,
		);
		let signal = n;
		if (ridge > 0) {
			// **The fold's crest moves; the two shapes are never mixed.**
			// Folding at the zero crossing and then blending that against the
			// plain octave adds an even function to an odd one, and the two
			// disagree about which end is high: plain noise peaks at `n = 1`
			// and a fold peaks at `n = 0`, so on the positive side they cancel.
			// Measured over the planet, that cost the whole positive half its
			// range at part settings -- the spread of the top tenth against the
			// bottom tenth ran `1 : 3.34` at a fold of `0.35`, and the field's
			// maximum fell to `0.338` against the plain sum's `0.807`. The
			// ridges piled against a ceiling with nothing above them, and a
			// curve read against the field had to rise to the *left* to find
			// any spread of height.
			//
			// One shape whose crest slides instead. `pivot` is where the crest
			// sits: `n = 1` at no fold, `n = 0` at full fold. `away` is how far
			// this sample is from it as a fraction of the furthest anything can
			// be, so the field reaches `+1` at the crest and `-1` at the far
			// end **at every setting**.
			//
			// Both ends are the arithmetic they always were. At `1` the pivot
			// is `0`, `away` is `|n|` and the crease is `(1 - |n|)²` -- bit for
			// bit. At `0` it is `(1 + n) / 2`, so the signal is `n` -- which is
			// the branch this one does not take, and the two agree in the
			// limit.
			const pivot = 1 - ridge;
			const away = Math.abs(n - pivot) / (1 + pivot);
			const crease = (1 - away) * (1 - ridge * away);
			signal = crease * 2 - 1;
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
