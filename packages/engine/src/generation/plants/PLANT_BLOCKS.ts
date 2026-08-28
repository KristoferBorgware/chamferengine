import { BlockType } from "../terrain/BlockType.js";
import { PLANT_SPECIES_NAMES } from "./PLANT_SPECIES.js";

/** The two block types one species is built from. */
export interface PlantBlocks {
	readonly wood: number;
	readonly leaf: number;
}

/**
 * Which blocks each species writes.
 *
 * **A plant is blocks, so a species is two entries in the registry.** The wood
 * and the leaf carry the colour, the name and the collision the same way stone
 * and water do, and nothing about drawing a plant is a second system beside the
 * one that draws the ground.
 *
 * A layer keeps its species name when its numbers are dragged apart, so two
 * layers both started from `Oak` write the same two blocks -- which is what a
 * registry is for: the name says what the block *is*, and the layer says where
 * it grows and what shape it grows in.
 */
export const PLANT_BLOCKS: Readonly<Record<string, PlantBlocks>> =
	Object.fromEntries(
		PLANT_SPECIES_NAMES.map((species) => {
			const key = species.toUpperCase();
			return [
				species,
				{
					wood: BlockType[
						`${key}_WOOD` as keyof typeof BlockType
					] as number,
					leaf: BlockType[
						`${key}_LEAF` as keyof typeof BlockType
					] as number,
				},
			];
		}),
	);

/** The block a species that is not in the registry falls back to. */
const FALLBACK: PlantBlocks = {
	wood: BlockType.CUSTOM_WOOD,
	leaf: BlockType.CUSTOM_LEAF,
};

/** The two blocks one species writes, whatever it is called. */
export function plantBlocksOf(species: string): PlantBlocks {
	return PLANT_BLOCKS[species] ?? FALLBACK;
}

/** Every plant block, so a caller can ask what one is without a species. */
const WOOD = new Set<number>();
const LEAF = new Set<number>();
for (const { wood, leaf } of Object.values(PLANT_BLOCKS)) {
	WOOD.add(wood);
	LEAF.add(leaf);
}

/** Whether a block is the wood of some plant. */
export function isPlantWood(block: number): boolean {
	return WOOD.has(block);
}

/** Whether a block is the leaves of some plant. */
export function isPlantLeaf(block: number): boolean {
	return LEAF.has(block);
}
