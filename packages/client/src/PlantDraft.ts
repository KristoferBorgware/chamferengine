import type { PlantLayer, PlantShape, PlantSpecies } from "chamfer/generation";
import { BLOCK_COLORS, PLANT_SPECIES, plantBlocksOf } from "chamfer/generation";

/** Every numbered row a vegetation layer carries. */
export type PlantNumberKey =
	| "density"
	| "feature"
	| "featureScale"
	| "octaves"
	| "persistence"
	| "lacunarity"
	| "fold"
	| "sizeSpread"
	| "height"
	| "trunk"
	| "taper"
	| "first"
	| "bend"
	| "bendFeature"
	| "levels"
	| "children"
	| "spread"
	| "lengthRatio"
	| "radiusRatio"
	| "up"
	| "droop"
	| "leafRadius"
	| "leafFill"
	| "leafRough"
	| "leafTip";

/**
 * The rows a species writes when it is picked.
 *
 * **A species is a template, not an identity.** Picking one writes these into
 * the layer and they stay editable, so two layers both named `Oak` that have
 * been dragged apart are two different trees. The noise rows are not here: a
 * species says what a plant looks like and never where it grows.
 */
export const PLANT_SHAPE_KEYS: readonly PlantNumberKey[] = [
	"height",
	"trunk",
	"taper",
	"first",
	"children",
	"spread",
	"lengthRatio",
	"radiusRatio",
	"levels",
	"up",
	"droop",
	"bend",
	"bendFeature",
	"leafRadius",
	"leafRough",
	"leafFill",
	"leafTip",
];

/** What a layer's noise rows open at, before any species touches it. */
const FIELD_DEFAULTS: Record<string, number> = {
	density: 3,
	feature: 300,
	featureScale: 4,
	octaves: 3,
	persistence: 0.5,
	lacunarity: 2,
	fold: 0,
	sizeSpread: 0.4,
};

/**
 * One vegetation layer as the panel edits it.
 *
 * Mutable, because the panel drags it: a curve is an array whose points are
 * moved in place, and a slider writes one number of many. The engine's own
 * {@link PlantLayer} is what a build takes, and {@link plantLayerOf} is the
 * step between.
 */
export interface PlantLayerDraft {
	/**
	 * Handed out once and never reused.
	 *
	 * **A layer's hash salt is its id, never its position in the list.** An
	 * index would re-sow the planet whenever a layer was deleted: every hash
	 * under it shifts, and an edit that said nothing about a layer moves every
	 * plant in it.
	 */
	id: number;

	species: string;
	on: boolean;

	/** Whether the card is unfolded, which travels so a link opens as it was. */
	open: boolean;

	branches: boolean;
	leaves: boolean;

	values: Record<PlantNumberKey, number>;

	curve: [number, number][];

	/**
	 * The biomes this layer may stand in, by name, or empty for every biome
	 * a world has.
	 *
	 * **Where used to be a curve alone.** A biome already names a place, so
	 * restricting a layer to `["Taiga", "Tundra"]` grows it exactly where the
	 * biome model put those, and the curve is left to shape how dense the
	 * layer is within them rather than to draw the border itself.
	 */
	biomes: string[];
}

/**
 * The two colours a species is drawn in, read off the block registry.
 *
 * **The card and the tree it grew are the same thing on screen**, so the chip,
 * the curve and the picture take the colour the world would build there rather
 * than a copy kept beside it.
 */
export function plantInk(species: string): {
	wood: readonly [number, number, number];
	leaf: readonly [number, number, number];
} {
	const blocks = plantBlocksOf(species);
	return {
		wood: BLOCK_COLORS[blocks.wood] ?? [0.36, 0.26, 0.18],
		leaf: BLOCK_COLORS[blocks.leaf] ?? [0.24, 0.44, 0.2],
	};
}

/** A new layer, starting from one species' numbers. */
export function makePlantLayer(species: string, id: number): PlantLayerDraft {
	const preset = PLANT_SPECIES[species] ?? PLANT_SPECIES.Custom!;
	const values = { ...FIELD_DEFAULTS } as Record<PlantNumberKey, number>;
	const layer: PlantLayerDraft = {
		id,
		species,
		on: true,
		open: true,
		branches: preset.branches,
		leaves: preset.leaves,
		values,
		// **Flat at the top.** A new layer grows everywhere its density allows,
		// which is the plainest thing it can do and the one a reader can then
		// carve into.
		curve: [
			[-1, 1],
			[1, 1],
		],
		biomes: [],
	};
	applySpecies(layer, species);
	return layer;
}

/** Write a species' numbers into a layer that already exists. */
export function applySpecies(layer: PlantLayerDraft, species: string): void {
	const preset: PlantSpecies =
		PLANT_SPECIES[species] ?? PLANT_SPECIES.Custom!;
	layer.species = species;
	for (const key of PLANT_SHAPE_KEYS)
		layer.values[key] = preset[key as keyof PlantShape] as number;
	layer.leaves = preset.leaves;
	layer.branches = preset.branches;
}

/** One layer as the engine takes it. */
export function plantLayerOf(layer: PlantLayerDraft): PlantLayer {
	const v = layer.values;
	return {
		id: layer.id,
		species: layer.species,
		on: layer.on,
		density: v.density,
		feature: v.feature,
		featureScale: v.featureScale,
		octaves: v.octaves,
		persistence: v.persistence,
		lacunarity: v.lacunarity,
		fold: v.fold,
		curve: layer.curve.map(([x, y]) => [x, y] as [number, number]),
		biomes: layer.biomes.length > 0 ? [...layer.biomes] : undefined,
		shape: {
			height: v.height,
			trunk: v.trunk,
			taper: v.taper,
			first: v.first,
			children: v.children,
			spread: v.spread,
			lengthRatio: v.lengthRatio,
			radiusRatio: v.radiusRatio,
			levels: v.levels,
			up: v.up,
			droop: v.droop,
			bend: v.bend,
			bendFeature: v.bendFeature,
			branches: layer.branches,
			leaves: layer.leaves,
			leafRadius: v.leafRadius,
			leafFill: v.leafFill,
			leafRough: v.leafRough,
			leafTip: v.leafTip,
			sizeSpread: v.sizeSpread,
		},
	};
}

/** A layer that shares no array with the one it came from. */
export function copyPlantLayer(layer: PlantLayerDraft): PlantLayerDraft {
	return {
		...layer,
		values: { ...layer.values },
		curve: layer.curve.map(([x, y]) => [x, y] as [number, number]),
		biomes: [...layer.biomes],
	};
}

/**
 * Every layer as one string, which is how a world carries its plants.
 *
 * **The query string is the only place a world is written down**, so what grows
 * on one is part of the same definition its ground is: a link from any bench
 * lands on any other with the same planet and the same forest. One parameter
 * rather than one per layer, because every knob in a world travels as one
 * value and this is a knob like the rest.
 *
 * A layer reads as its species, then every row that has moved off what that
 * species wrote, then the curve; layers are separated by `;` and their parts by
 * `|`. So a stand of three species is carried without three species' worth of
 * defaults.
 */
export function plantLayersToText(layers: readonly PlantLayerDraft[]): string {
	return layers
		.map((layer) => {
			const fresh = makePlantLayer(layer.species, layer.id);
			const parts = [layer.species];
			if (!layer.on) parts.push("off");
			if (!layer.open) parts.push("shut");
			if (layer.branches !== fresh.branches)
				parts.push(`branches=${layer.branches ? 1 : 0}`);
			if (layer.leaves !== fresh.leaves)
				parts.push(`leaves=${layer.leaves ? 1 : 0}`);
			for (const key of Object.keys(layer.values) as PlantNumberKey[])
				if (layer.values[key] !== fresh.values[key])
					parts.push(`${key}=${+layer.values[key].toFixed(4)}`);
			if (layer.biomes.length > 0)
				parts.push(`biomes=${layer.biomes.join(",")}`);
			parts.push(
				"curve=" +
					layer.curve
						.map(([x, y]) => `${+x.toFixed(3)}:${+y.toFixed(3)}`)
						.join(","),
			);
			return parts.join("|");
		})
		.join(";");
}

/** Every layer a world's own string carries, in the order it holds them. */
export function plantLayersFromText(text: string): PlantLayerDraft[] {
	const out: PlantLayerDraft[] = [];
	if (text.trim() === "") return out;
	for (const one of text.split(";")) {
		if (one.trim() === "") continue;
		const parts = one.split("|");
		const layer = makePlantLayer(parts[0] ?? "Custom", out.length + 1);
		for (const part of parts.slice(1)) {
			if (part === "off") {
				layer.on = false;
				continue;
			}
			if (part === "shut") {
				layer.open = false;
				continue;
			}
			const cut = part.indexOf("=");
			if (cut < 0) continue;
			const key = part.slice(0, cut);
			const value = part.slice(cut + 1);
			if (key === "curve") {
				const points: [number, number][] = [];
				for (const pair of value.split(",")) {
					const [x, y] = pair.split(":").map(Number);
					if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
					points.push([
						Math.max(-1, Math.min(1, x!)),
						Math.max(0, Math.min(1, y!)),
					]);
				}
				points.sort((a, b) => a[0] - b[0]);
				if (points.length >= 2) layer.curve = points;
				continue;
			}
			if (key === "branches") {
				layer.branches = value === "1";
				continue;
			}
			if (key === "leaves") {
				layer.leaves = value === "1";
				continue;
			}
			if (key === "biomes") {
				layer.biomes = value
					.split(",")
					.map((name) => name.trim())
					.filter((name) => name.length > 0);
				continue;
			}
			const number = Number(value);
			if (key in layer.values && Number.isFinite(number))
				layer.values[key as PlantNumberKey] = number;
		}
		out.push(layer);
	}
	return out;
}

/**
 * What a world with nothing said about its plants grows.
 *
 * **Twelve layers, one per species, each restricted to the biomes it
 * actually stands in, under both shipped presets.** Every layer's `.biomes`
 * carries the "plain" preset's name or names alongside the matching
 * "Holdridge life zones" name or names -- Pine, say, is Taiga and Alpine
 * forest under one table and Boreal moist/wet forest under the other, one
 * flat list checked against whichever table is actually live. Between the
 * two tables that reaches twenty-one of the plain preset's twenty-one and
 * twenty-one of Holdridge's twenty-three. Left bare on purpose: Icy shore,
 * Stony shore and Frozen plateau (real shoreline and high rock), and Polar
 * desert and Boreal desert (the coldest, most barren end of Holdridge's own
 * range) -- not a gap, the extreme a biome model is supposed to have one.
 *
 * **Density is a quarter to a third of what a first pass shipped with.**
 * Every default here read as a closed-canopy forest regardless of species --
 * cactus included -- because "plants per 100 blocks" was tuned once, for
 * Pine, and then copied. These are scaled to roughly 40% of that first pass,
 * which is what turns "forest everywhere" into stands with ground between
 * them; a desert or tundra species is lower still; Heather is a spreading
 * ground shrub, so it stays the one that reads busiest at over 1.
 *
 * Two species carry hand-drawn curves from when this default held only them
 * (Pine, Oak); the other ten are flat -- uniform density across whichever
 * biomes they are allowed in -- because the biome list is already doing the
 * work of saying *where*, and a curve on top of that is a second answer to
 * the same question rather than a different one. Several biomes carry two
 * species deliberately -- Tundra's birch and heather, Steppe's baobab and
 * bush, Dry basin's baobab and deadwood, Badlands' deadwood and cactus --
 * because that pairing is what the mix actually looks like on the ground:
 * scattered giants over scrub, not one species owning a biome.
 *
 * A world with no biome table at all (the "Plain planet" mode, or a custom
 * table missing these names) grows nothing from any of these twelve -- see
 * {@link PlantLayer.biomes}.
 */
export const PLANT_LAYERS_DEFAULT =
	"Pine|density=1|feature=260|featureScale=5|curve=-1:0,-0.05:0,0.35:1,1:1|biomes=Taiga,Alpine forest,Boreal moist forest,Boreal wet forest;" +
	"Spruce|density=0.9|feature=220|biomes=Taiga,Snowy slopes,Boreal wet forest,Boreal rain forest;" +
	"Birch|density=0.3|feature=300|biomes=Tundra,Frozen valley,Moist tundra,Wet tundra;" +
	"Heather|density=1.2|feature=140|biomes=Tundra,Stony peaks,Jagged peaks,Dry tundra,Rain tundra;" +
	"Oak|density=0.6|feature=380|curve=-1:1,-0.2:0.85,0.2:0,1:0|biomes=Grove,Grassland,Moist forest,Wet forest;" +
	"Willow|density=0.6|feature=200|biomes=Swamp,Wet forest;" +
	"Baobab|density=0.1|feature=500|biomes=Steppe,Highland steppe,Dry basin,Dry forest,Thorn woodland;" +
	"Bush|density=1|feature=180|biomes=Steppe,Dry slope,Desert scrub,Dry scrub;" +
	"Redwood|density=0.8|feature=280|biomes=Rainforest,Temperate rain forest,Tropical wet forest,Tropical rain forest;" +
	"Palm|density=0.3|feature=150|biomes=Beach,Subtropical moist forest,Tropical dry forest;" +
	"Deadwood|density=0.2|feature=260|biomes=Badlands,Dry basin,Subtropical desert,Tropical desert;" +
	"Cactus|density=0.4|feature=200|biomes=Desert,Badlands,Dry slope,Tropical desert,Desert scrub";
