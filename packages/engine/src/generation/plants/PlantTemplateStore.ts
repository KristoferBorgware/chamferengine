import type { PlantLayer } from "./PlantLayer.js";
import type { PlantTemplate } from "./PlantTemplate.js";
import { buildPlantTemplate } from "./buildPlantTemplate.js";

/**
 * How many plants of each species are grown properly and then re-used.
 *
 * **Twelve orientations come free** ({@link orientTemplate}), so this is
 * sixteen shapes and one hundred and ninety-two apparent ones. What it costs is
 * building them: about `13 ms` each, once per species per level of detail, in
 * each worker -- against `13-21 ms` for every plant of every chunk forever.
 */
export const PLANT_VARIANTS = 16;

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
		const made: PlantTemplate[] = [];
		for (let variant = 0; variant < PLANT_VARIANTS; variant++)
			made.push(
				buildPlantTemplate(
					layer,
					variant,
					this.level,
					this.blockMetres,
					this.radius,
					this.seed,
				),
			);
		this.byLayer.set(layer.id, made);
		return made;
	}
}
