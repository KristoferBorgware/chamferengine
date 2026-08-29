import type { CoarseMap } from "../coarse/CoarseMap.js";
import type { TerrainLayer } from "../coarse/TerrainLayer.js";
import type { WorldShape } from "../../world/WorldShape.js";
import type { BiomeWorld } from "./BiomeWorld.js";
import { Vec3 } from "../../math/Vec3.js";
import { positionToCell } from "../../addressing/lookup/positionToCell.js";

/**
 * A `BiomeWorld` reading the walkable world's own coarse map and terrain
 * layers, so the biome model names the ground the generator actually built.
 *
 * **Height comes off the map, everything else off the layers.** `heightAt`
 * goes position to cell to `map.heightAt`, the same two steps
 * {@link TerrainGenerator.blockAtPosition} already takes -- so a biome and
 * the ground under it agree at the map's own resolution, LOD included. The
 * three curves stay the raw layer definitions, because a landform reading
 * needs the field's own value at this exact point, not the map's blend of
 * its neighbours.
 */
export function biomeWorldFor(
	seed: number,
	shape: WorldShape,
	map: CoarseMap,
	continent: TerrainLayer,
	erosion: TerrainLayer,
	peaks: TerrainLayer,
): BiomeWorld {
	return {
		seed,
		radius: shape.seaLevelRadius,
		continent,
		erosion,
		peaks,
		heightAt: (x: number, y: number, z: number): number => {
			const cell = positionToCell(new Vec3(x, y, z), shape.n);
			return map.heightAt(
				cell.face,
				cell.i,
				cell.j,
				shape.subdivisionDepth,
			);
		},
	};
}
