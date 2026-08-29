import type { BiomeDef } from "../biomes/BiomeDef.js";
import type { PlantLayer } from "./PlantLayer.js";

/**
 * Which biome indices each layer is restricted to, or `null` for a layer
 * open to every biome.
 *
 * **A layer names its biomes, never their indices.** A table is edited by
 * inserting and removing rows, and an index a layer had memorised would
 * silently point at a different biome the moment the table moved -- the
 * same reason `BiomeDef.landform` is a key rather than a position. Resolved
 * once against whichever table is live, in the same order as `layers`, so
 * the mask a layer gets lines up with the layer whether or not some other
 * layer is off.
 */
export function plantBiomeMasks(
	layers: readonly PlantLayer[],
	biomes: readonly BiomeDef[],
): (ReadonlySet<number> | null)[] {
	return layers.map((layer) => {
		if (!layer.biomes || layer.biomes.length === 0) return null;
		const set = new Set<number>();
		for (const name of layer.biomes) {
			const at = biomes.findIndex((b) => b.name === name);
			if (at >= 0) set.add(at);
		}
		return set;
	});
}
