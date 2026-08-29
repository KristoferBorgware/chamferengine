import type { PlantShape } from "./PlantShape.js";

/**
 * One kind of plant, and everywhere on the planet it grows.
 *
 * **A layer is two questions, not one.** *Where* is a noise field of its own
 * read through a curve; *what* is the trunk, the branches and the leaves the
 * field then puts there. It has to be a field rather than a number, because
 * pine on the northern slopes and palm at the shore is a statement about
 * places and a density is a statement about a planet.
 *
 * Nothing is shared between two layers but the world they stand on.
 */
export interface PlantLayer {
	/**
	 * Handed out once and never reused, and what the layer's hashes are salted
	 * with.
	 *
	 * **A position in a list would re-sow the planet whenever one was
	 * deleted**: every hash under it shifts, and an edit that said nothing
	 * about a layer moves every plant in it.
	 */
	readonly id: number;

	/**
	 * Which species this is, which is also which blocks it writes.
	 *
	 * The name outlives the numbers: a layer started from `Oak` and dragged
	 * apart is still oak wood and oak leaves, because what a block *is* belongs
	 * to the registry and what shape it grows in belongs here.
	 */
	readonly species: string;

	/** Whether the layer grows at all. */
	readonly on: boolean;

	/** The densest the curve can ask for, in plants per hundred cells. */
	readonly density: number;

	/** The widest feature of the layer's own field, in metres. */
	readonly feature: number;
	readonly featureScale: number;

	readonly octaves: number;
	readonly persistence: number;
	readonly lacunarity: number;

	/** How far each octave is folded at its own zero crossing. */
	readonly fold: number;

	/**
	 * The reading, `-1` to `+1`, against the share of {@link density} it takes.
	 *
	 * Flat at the top is a layer that grows everywhere it is allowed; a step is
	 * a tree line; a hump is a belt.
	 */
	readonly curve: readonly (readonly [number, number])[];

	/**
	 * The biomes this layer may stand in, by name, or absent for every biome
	 * a world has.
	 *
	 * **Where used to be a curve over one noise field**; a biome already
	 * names a place -- climate, landform, both -- so a layer restricted to
	 * `["Taiga", "Tundra"]` grows exactly where the biome model already
	 * decided pine belongs, rather than fighting a second field over the
	 * same question. `curve` still shapes how dense the layer is *within*
	 * the biomes it allows; it no longer decides which those are. A world
	 * with no biome table cannot answer "which biome is this", so a layer
	 * naming any grows nowhere rather than silently ignoring the restriction.
	 */
	readonly biomes?: readonly string[] | undefined;

	/** The plant this layer grows. */
	readonly shape: PlantShape;
}
