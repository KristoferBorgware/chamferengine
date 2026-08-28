import type { PlantLayer } from "./PlantLayer.js";
import type { PlantTemplate } from "./PlantTemplate.js";
import { buildPlantTemplate } from "./buildPlantTemplate.js";
import { plantReferencePatch } from "./plantReferencePatch.js";

/**
 * How many plants of each species are grown properly and then re-used.
 *
 * **Twelve orientations come free** ({@link orientTemplate}), so this is
 * thirty-two shapes and three hundred and eighty-four apparent ones. What it
 * costs is building them, once per species per level of detail in each worker:
 * measured on the shipped world, `284 ms` for the pines at full detail and
 * `79 ms` at the level out from it, against `13-21 ms` for every plant of
 * every chunk forever.
 *
 * **Doubling this is cheaper than it looks, and only in setup.** Nothing a
 * chunk does depends on how many there are -- a plant picks one and stamps it
 * -- so the whole price is the build and the `303 KB` a worker then holds. At
 * sixteen the same world takes `392 ms`; the reference patch every variant of
 * a species shares is what made the difference, because it used to be rebuilt
 * for each one.
 */
export const PLANT_VARIANTS = 32;

/**
 * Every species' worth of pre-grown plants, built on first use and kept.
 *
 * **A pure function of the world's own definition**, so every worker builds an
 * identical set from the seed and the layer without a byte crossing between
 * them -- the same reason each one builds its own coarse map. Two chunks
 * stamping one template at one root cannot disagree about a cell, which is
 * stronger than the floating-point stamp it replaces: that relied on both
 * chunks doing the same arithmetic, and this is an integer table.
 *
 * **Held for as long as the layers are.** A shape knob makes different plants,
 * so the owner of this store throws it away and makes another whenever the
 * layers change -- exactly what it already does with the generators and the
 * worker pool.
 */
export class PlantTemplateStore {
	private readonly seed: number;
	private readonly level: number;
	private readonly blockMetres: number;
	private readonly radius: number;
	private readonly byLayer = new Map<number, PlantTemplate[]>();

	constructor(
		seed: number,
		level: number,
		blockMetres: number,
		radius: number,
	) {
		this.seed = seed;
		this.level = level;
		this.blockMetres = blockMetres;
		this.radius = radius;
	}

	/**
	 * How far past its own rim a chunk has to look, for these layers.
	 *
	 * **A template knows exactly how wide the plant it draws is**, so the reach
	 * is measured rather than assumed. Assuming it is both wasteful and unsafe:
	 * the shipped forest of pines and oaks reaches `17.2 m` against the `24 m`
	 * the constant claims, and a world of redwoods reaches far past it -- and a
	 * reach that is too small does not draw a smaller tree, it draws one that
	 * comes apart along every chunk boundary it crosses.
	 *
	 * One block of slack, so a cell sitting exactly on the edge of the widest
	 * canopy is inside the ring rather than on it.
	 */
	reachFor(layers: readonly PlantLayer[]): number {
		let far = 0;
		for (const layer of layers) {
			if (!layer.on) continue;
			for (const one of this.forLayer(layer))
				if (one.reach > far) far = one.reach;
		}
		return far + this.blockMetres;
	}

	/**
	 * This layer's plants, grown the first time they are asked for.
	 *
	 * Lazily, because a world may carry a species it never plants -- the curve
	 * decides where a layer grows and it is free to grow nowhere near this
	 * worker's chunks.
	 */
	forLayer(layer: PlantLayer): readonly PlantTemplate[] {
		const held = this.byLayer.get(layer.id);
		if (held) return held;
		// **One patch for the whole species.** How far it has to reach is the
		// tallest this species grows plus a canopy, which bounds the sideways
		// reach as well because no limb leaves the trunk and travels further
		// than the trunk is long -- so every variant is grown on this ground.
		const shape = layer.shape;
		const far =
			shape.height * (1 + shape.sizeSpread) + shape.leafRadius * 1.6;
		const reference = plantReferencePatch(
			this.level,
			Math.max(2, Math.ceil(far / this.blockMetres) + 2),
		);
		const made: PlantTemplate[] = [];
		for (let variant = 0; variant < PLANT_VARIANTS; variant++)
			made.push(
				buildPlantTemplate(
					reference,
					layer,
					variant,
					this.blockMetres,
					this.radius,
					this.seed,
				),
			);
		this.byLayer.set(layer.id, made);
		return made;
	}
}
