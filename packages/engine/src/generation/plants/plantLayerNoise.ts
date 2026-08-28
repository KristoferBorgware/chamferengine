import type { NoiseSettings } from "../noise/NoiseSettings.js";
import type { PlantLayer } from "./PlantLayer.js";

/**
 * One layer's octave stack, from the metres its rows are stated in.
 *
 * A frequency is how many times the widest feature repeats around the planet,
 * so a width in metres is the radius divided by it. Stated in metres because a
 * stand of trees is a thing on the ground and a frequency is a number about a
 * sphere.
 */
export function plantLayerNoise(
	layer: PlantLayer,
	radius: number,
): NoiseSettings {
	return {
		frequency: radius / Math.max(1, layer.feature * layer.featureScale),
		octaves: Math.max(1, Math.round(layer.octaves)),
		persistence: layer.persistence,
		lacunarity: layer.lacunarity,
		offsetX: 0,
		offsetY: 0,
		ridge: layer.fold,
	};
}
