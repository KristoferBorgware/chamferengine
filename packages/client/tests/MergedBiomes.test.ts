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
 * **The merged table, read over a real planet rather than argued about.**
 *
 * Everything this file checks is a property of the finished world and not of
 * the table on its own: whether a biome is reachable at all, whether a hot
 * desert ever lands on a summit, whether a species has ground to grow on.
 * None of the three can be settled by reading `BIOME_PRESETS` -- they are
 * answers about where the climate model actually puts its readings, which is
 * why the table's own dots were placed from measurement in the first place.
 */
const PRESET = "elevation";

/** One degree either way: fine enough to find a coastline, coarse enough to stay quick. */
const STEP = 1;

/**
 * Four worlds rather than one.
 *
 * The thinnest zones this table keeps run a few tenths of a percent of the
 * land -- Tropical rain forest is `0.41%` measured over four seeds -- and a
 * single planet can miss one outright: whether a seed grows a hot, soaking
 * lowland at all is a property of that seed. Pooling is what makes
 * "reachable" a statement about the table rather than about one world.
 *
 * **Four rather than three, because the hot, dry corner is the thinnest of
 * all.** Temperature and humidity read `+0.27` correlated over this world's
 * land -- high ground is both colder and drier, so warm ground is wetter --
 * which leaves hot and arid the rarest pair on the chart. Measured over
 * eight seeds, Tropical desert is built by one of them and Subtropical
 * desert by two, and every seed builds somewhere between 17 and 25 of the
 * 28. Four is the pool every measurement behind this table was taken over.
 */
const SEEDS = ["chamfer", "otherworld", "atlas", "borgware"];

/** A hot desert has no business on a summit, and this is the list of them. */
const HOT_DESERTS = ["Subtropical desert", "Tropical desert", "Badlands"];

/** The three grounds made of ice or bare stone, left bare on purpose. */
const BARE = ["Polar desert", "Icy shore", "Stony shore"];

describe("the merged biome table, over a real planet", () => {
	let sample: BiomeSample;

	/** Every biome name the sweep found, and the landforms it stood on. */
	const found = new Map<string, Set<number>>();

	/** The tallest ground the sweep saw, and how high each biome reached. */
	let highest = 0;
	const ceiling = new Map<string, number>();

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
			for (let latitude = -80; latitude <= 80; latitude += STEP)
				for (let longitude = -180; longitude < 180; longitude += STEP) {
					const a = (latitude * Math.PI) / 180;
					const b = (longitude * Math.PI) / 180;
					const at = field.readAt(
						Math.cos(a) * Math.cos(b),
						Math.sin(a),
						Math.cos(a) * Math.sin(b),
						sample,
					);
					if (at < 0) continue;
					const name = field.biomes[at]!.name;
					let forms = found.get(name);
					if (!forms) found.set(name, (forms = new Set()));
					forms.add(sample.landform);
					highest = Math.max(highest, sample.metres);
					ceiling.set(
						name,
						Math.max(ceiling.get(name) ?? 0, sample.metres),
					);
				}
		}
		// Three whole planets built and swept, well past the ten seconds a
		// hook is given by default.
	}, 120_000);

	// **A dot nothing reaches is a dot nobody meets.** Read through the raw
	// range rather than a fitted one, humidity spans only the bottom of the
	// square and the whole wet half of Holdridge's chart is unreachable --
	// eight zones that exist in the table and never in a world.
	it("builds every biome it names somewhere", () => {
		const missing = BIOME_PRESETS[PRESET]!.map((b) => b.name).filter(
			(name) => !found.has(name),
		);
		expect(missing).toEqual([]);
	});

	// **The one the terrain rule is for, and it is a height rather than a
	// landform.** Nothing in the table forbids a desert anywhere -- every
	// life zone is filed under any ground -- so this holds only because the
	// air cools and dries as it rises, which makes it a claim about a real
	// world and not about the dots. It is deliberately not asked of the
	// `peaks` landform: that is a reading of the relief curve rather than of
	// altitude, so a sharp, low butte near the equator counts as a peak and
	// is honestly hot. Measured over four seeds, the tallest land runs
	// `879 m` and no hot desert passes `570 m`.
	it("keeps a hot desert out of the top quarter of the ground", () => {
		const line = 0.75 * highest;
		expect(highest).toBeGreaterThan(0);
		const over = HOT_DESERTS.filter(
			(name) => (ceiling.get(name) ?? 0) > line,
		);
		expect(over).toEqual([]);
	});

	// The three the shore rule hands its own ground to, and the two that only
	// a landform can place. A beach that never appears is what sent this
	// whole merge back for a second look.
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

	// **Every species needs ground, and the merge is where one loses it.**
	// Redwood's three zones were all unreachable before the fit was held
	// fixed, so it grew nowhere at all while still looking correct in the
	// table.
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
