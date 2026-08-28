import type { PlantLayer, PlantShape, PlantSpecies } from "chamfer/generation";
import { PLANT_SPECIES } from "chamfer/generation";

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

	wood: [number, number, number];
	leaf: [number, number, number];
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
		wood: [...preset.wood] as [number, number, number],
		leaf: [...preset.leaf] as [number, number, number],
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
	layer.wood = [...preset.wood] as [number, number, number];
	layer.leaf = [...preset.leaf] as [number, number, number];
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
		wood: layer.wood,
		leaf: layer.leaf,
	};
}

/** A layer that shares no array with the one it came from. */
export function copyPlantLayer(layer: PlantLayerDraft): PlantLayerDraft {
	return {
		...layer,
		values: { ...layer.values },
		curve: layer.curve.map(([x, y]) => [x, y] as [number, number]),
		wood: [...layer.wood] as [number, number, number],
		leaf: [...layer.leaf] as [number, number, number],
	};
}

/**
 * What a page with no link in it opens with.
 *
 * **Two layers, because one proves nothing.** A single layer is a density with
 * a curve on it and could as well have been a slider; two say what the
 * arrangement is for -- a pine belt and an oak wood, each with its own field,
 * its own curve and its own shape, meeting wherever both curves allow. The
 * curves are drawn to put them in different places rather than left flat, or
 * the opening view is two species evenly mixed over the whole planet.
 */
export function openingLayers(): PlantLayerDraft[] {
	const pine = makePlantLayer("Pine", 1);
	pine.values.density = 2.5;
	pine.values.feature = 260;
	pine.values.featureScale = 5;
	pine.curve = [
		[-1, 0],
		[-0.05, 0],
		[0.35, 1],
		[1, 1],
	];
	const oak = makePlantLayer("Oak", 2);
	oak.values.density = 1.6;
	oak.values.feature = 380;
	oak.values.featureScale = 4;
	oak.curve = [
		[-1, 1],
		[-0.2, 0.85],
		[0.2, 0],
		[1, 0],
	];
	return [pine, oak];
}

/**
 * Every layer as query parameters, one per layer.
 *
 * **A layer travels whole**, named `v1`, `v2` and so on: the species, then
 * every row that has moved off what that species wrote, then the curve. A link
 * carries a stand of three species without carrying three species' worth of
 * defaults.
 */
export function plantLayersToParams(
	layers: readonly PlantLayerDraft[],
	params: URLSearchParams,
): void {
	layers.forEach((layer, at) => {
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
		parts.push(
			"curve=" +
				layer.curve
					.map(([x, y]) => `${+x.toFixed(3)}:${+y.toFixed(3)}`)
					.join(","),
		);
		params.set(`v${at + 1}`, parts.join("|"));
	});
}

/** Every layer a link carries, or nothing when it carries none. */
export function plantLayersFromParams(
	params: URLSearchParams,
): PlantLayerDraft[] | null {
	const out: PlantLayerDraft[] = [];
	for (let at = 1; ; at++) {
		const text = params.get(`v${at}`);
		if (text === null) break;
		const parts = text.split("|");
		const layer = makePlantLayer(parts[0] ?? "Custom", at);
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
			const number = Number(value);
			if (key in layer.values && Number.isFinite(number))
				layer.values[key as PlantNumberKey] = number;
		}
		out.push(layer);
	}
	return out.length > 0 ? out : null;
}
