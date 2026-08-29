import type { CoarseMap } from "chamfer/generation";
import type { WorldShape } from "chamfer/world";
import { BiomeField, biomeWorldFor } from "chamfer/generation";
import type { PlanetSettings } from "./PlanetSettings.js";

/**
 * The world's biome table, built for the main thread's own generators.
 *
 * **One field for every level, the way the worker builds one.** The main
 * thread keeps its own `TerrainGenerator` per level of detail for queries
 * that cannot wait on a worker round trip -- the spawn scan, a player's own
 * block reads -- and every one of them has to name the same ground the
 * chunks a worker draws do, so this is the same construction
 * {@link biomeWorldFor} gives a worker's setup, called from the thread that
 * already holds the map. `null` for a plain planet, which has no coarse map
 * for a landform to read.
 */
export function biomeFieldFor(
	seed: number,
	shape: WorldShape,
	map: CoarseMap,
	settings: PlanetSettings,
): BiomeField | null {
	if (!settings.coarseMapRuns) return null;
	const table = settings.biomeTable;
	return new BiomeField(
		biomeWorldFor(
			seed,
			shape,
			map,
			settings.layerFor("continent"),
			settings.layerFor("erosion"),
			settings.layerFor("peaks"),
		),
		table.biomes,
		table.grid,
		settings.biomeOptions(),
	);
}
