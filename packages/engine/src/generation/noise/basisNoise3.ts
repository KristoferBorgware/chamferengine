import type { NoiseSettings } from "./NoiseSettings.js";
import { cellularNoise3 } from "./cellularNoise3.js";
import { perlinNoise3 } from "./perlinNoise3.js";
import { psrdNoise3 } from "./psrdNoise3.js";
import { simplexNoise3 } from "./simplexNoise3.js";
import { valueNoise3 } from "./valueNoise3.js";

/**
 * One octave of whichever noise function the settings name, in `[-1, 1]`.
 *
 * Every basis takes a point and a seed and returns a scalar over that range,
 * so the octave stack above this does not know which one it is summing and
 * frequency, persistence, lacunarity, offset and ridge mean the same thing
 * under all of them.
 */
export function basisNoise3(
	x: number,
	y: number,
	z: number,
	seed: number,
	settings: NoiseSettings,
): number {
	switch (settings.basis) {
		case "perlin":
			return perlinNoise3(x, y, z, seed);
		case "simplex":
			return simplexNoise3(x, y, z, seed);
		case "psrd":
			return psrdNoise3(
				x,
				y,
				z,
				seed,
				settings.spinSin,
				settings.spinCos,
			);
		case "cellular":
			return cellularNoise3(
				x,
				y,
				z,
				seed,
				settings.jitter,
				settings.feature,
			);
		default:
			return valueNoise3(x, y, z, seed);
	}
}
