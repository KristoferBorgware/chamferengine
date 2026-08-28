import type { NoiseSettings } from "../noise/NoiseSettings.js";
import type { PlantLayer } from "./PlantLayer.js";
import { octaveNoise } from "../noise/octaveNoise.js";
import { plantSalt } from "./plantSalt.js";
import { splineAt } from "../coarse/splineAt.js";

/**
 * How much of a layer's density one place takes, in `[0, 1]`.
 *
 * The field is read in 3D world space from the direction vector, never from a
 * face's own `(i, j)`: face coordinates break at all thirty face edges, and a
 * stand of trees that stopped dead along one is that seam made visible.
 */
export function plantDensityAt(
	layer: PlantLayer,
	x: number,
	y: number,
	z: number,
	seed: number,
	settings: NoiseSettings,
): number {
	return splineAt(
		layer.curve,
		octaveNoise(x, y, z, (seed + plantSalt(layer.id)) | 0, settings),
	);
}
