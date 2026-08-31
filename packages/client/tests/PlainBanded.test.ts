import { beforeAll, describe, expect, it } from "vitest";
import type { BiomeSample } from "chamfer/generation";
import {
	ANY_LANDFORM,
	BIOME_PRESETS,
	LANDFORMS,
	buildCoarseMap,
	makeBiomeSample,
	seedFromString,
} from "chamfer/generation";
import { PlanetSettings } from "../src/PlanetSettings.js";
import { biomeFieldFor } from "../src/biomeFieldFor.js";
import {
	PLANT_LAYERS_DEFAULT,
	plantLayerOf,
	plantLayersFromText,
} from "../src/PlantDraft.js";

/**
 * **`plain`'s own grounds, read over a real planet after the landforms came
 * off fifteen of them.**
 *
 * The whole point of the preset is a map with regions in it rather than
 * speckle, and neither half of that can be settled by reading the table: a
 * dot is reachable or not depending on where the climate model puts its
 * readings, and a boundary is quiet or noisy depending on how steady those
 * readings are from one place to the next. Both are measured here.
 */
const PRESET = "plainElevation";

/** One degree either way: fine enough to find a coastline, coarse enough to stay quick. */
const STEP = 1;

/** Three worlds, so "reachable" is a claim about the table and not about a seed. */
const SEEDS = ["chamfer", "otherworld", "atlas"];

/** The three grounds made of ice or bare stone, left bare on purpose. */
const BARE = ["Ice sheet", "Icy shore", "Stony shore"];

describe("plain's grounds, banded by elevation", () => {
	let sample: BiomeSample;

	/** Every biome name the sweep found, and the landforms it stood on. */
	const found = new Map<string, Set<number>>();

	/** How often two neighbouring land samples disagree, and how often they were asked. */
	let edges = 0;
	let pairs = 0;

	beforeAll(() => {
		sample = makeBiomeSample();
		for (const named of SEEDS) {
			const params = new URLSearchParams();
			params.set("biomes", PRESET);
			params.set("seed", named);
			const settings = PlanetSettings.fromParams(params);
			const seed = seedFromString(settings.knobs.seed);
			const map = buildCoarseMap(seed, settings.coarseOptions());
			const field = biomeFieldFor(
				seed,
				settings.shapeFor(map),
				map,
				settings,
			)!;
			const rows: (string | null)[][] = [];
			for (let latitude = -80; latitude <= 80; latitude += STEP) {
				const row: (string | null)[] = [];
				for (let longitude = -180; longitude < 180; longitude += STEP) {
					const a = (latitude * Math.PI) / 180;
					const b = (longitude * Math.PI) / 180;
					const at = field.readAt(
						Math.cos(a) * Math.cos(b),
						Math.sin(a),
						Math.cos(a) * Math.sin(b),
						sample,
					);
					if (at < 0) {
						row.push(null);
						continue;
					}
					const name = field.biomes[at]!.name;
					row.push(name);
					let forms = found.get(name);
					if (!forms) found.set(name, (forms = new Set()));
					forms.add(sample.landform);
				}
				rows.push(row);
			}
			for (let r = 0; r < rows.length; r++)
				for (let c = 0; c < rows[r]!.length; c++) {
					const here = rows[r]![c];
					if (!here) continue;
					const east = rows[r]![(c + 1) % rows[r]!.length];
					const north = rows[r + 1]?.[c];
					for (const there of [east, north]) {
						if (!there) continue;
						pairs++;
						if (there !== here) edges++;
					}
				}
		}
		// Three whole planets built and swept, well past the ten seconds a
		// hook is given by default.
	}, 120_000);

	it("builds every biome it names somewhere", () => {
		const missing = BIOME_PRESETS[PRESET]!.map((b) => b.name).filter(
			(name) => !found.has(name),
		);
		expect(missing).toEqual([]);
	});

	// **The measurement the preset exists for.** `plain` reads `20.17%` over
	// four seeds and this table reads `7.43%` -- the same twenty-one grounds,
	// asked about in a different order. A regression here means the landform
	// rule has crept back into the fifteen, which is exactly the change that
	// would not show up in any other test.
	it("draws regions rather than speckle", () => {
		expect(pairs).toBeGreaterThan(0);
		expect((100 * edges) / pairs).toBeLessThan(10);
	});

	it("puts the substrate on the ground it was filed under, and nowhere else", () => {
		for (const biome of BIOME_PRESETS[PRESET]!) {
			if (biome.landform === ANY_LANDFORM) continue;
			const want = LANDFORMS.findIndex((f) => f.key === biome.landform);
			expect([biome.name, [...(found.get(biome.name) ?? [])]]).toEqual([
				biome.name,
				[want],
			]);
		}
	});

	it("leaves only ice and bare stone without a plant", () => {
		const layers =
			plantLayersFromText(PLANT_LAYERS_DEFAULT).map(plantLayerOf);
		const named = new Set<string>();
		for (const layer of layers)
			for (const name of layer.biomes ?? []) named.add(name);
		const bare = BIOME_PRESETS[PRESET]!.map((b) => b.name).filter(
			(name) => !named.has(name),
		);
		expect(bare.sort()).toEqual([...BARE].sort());
	});

	it("gives every species at least one biome this world actually builds", () => {
		const layers =
			plantLayersFromText(PLANT_LAYERS_DEFAULT).map(plantLayerOf);
		for (const layer of layers) {
			const live = (layer.biomes ?? []).filter((name) => found.has(name));
			expect([layer.species, live.length > 0]).toEqual([
				layer.species,
				true,
			]);
		}
	});
});
