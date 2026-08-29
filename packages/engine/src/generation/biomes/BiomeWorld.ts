import type { TerrainLayer } from "../coarse/TerrainLayer.js";

/**
 * What the biome model reads its world through, and nothing else crosses.
 *
 * The three layers are the world's own -- the same stacks and curves the map
 * was built from -- so the landform the biome names and the ground under it
 * are one description. The height comes back as a function rather than a
 * field, because the map owns it: erosion droplets move ground after the
 * layers have spoken, and a shore band read off the layers alone would miss
 * the beach the droplets left.
 */
export interface BiomeWorld {
	readonly seed: number;

	/** The sea-level radius in metres, which turns a feature size into a frequency. */
	readonly radius: number;

	readonly continent: TerrainLayer;
	readonly erosion: TerrainLayer;
	readonly peaks: TerrainLayer;

	/** Metres above sea level at a unit direction, off the map. */
	heightAt(x: number, y: number, z: number): number;
}
