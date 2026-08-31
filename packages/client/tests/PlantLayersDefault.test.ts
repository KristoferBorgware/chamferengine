import { beforeAll, describe, expect, it } from "vitest";
import type { BiomeDef } from "chamfer/generation";
import {
	BIOME_PRESETS,
	DEFAULT_PRESET,
	BiomeField,
	COARSE_MAP_DEFAULTS,
	ChunkAddress,
	CONTINENT_LAYER_DEFAULT,
	EROSION_LAYER_DEFAULT,
	PEAKS_LAYER_DEFAULT,
	PlantTemplateStore,
	TERRAIN_DEFAULTS,
	TerrainGenerator,
	biomeWorldFor,
	buildCoarseMap,
	generateChunk,
	makeBiomeSample,
	maxElevationFor,
	plantBlocksOf,
	plantChunk,
	seedFromString,
} from "chamfer/generation";
import { WorldShape } from "chamfer/world";
import { canonicalCell, directionToCell, splitPath } from "chamfer/addressing";
import { positionOf } from "chamfer/coordinates";
import {
	PLANT_LAYERS_DEFAULT,
	plantLayerOf,
	plantLayersFromText,
} from "../src/PlantDraft.js";

const SEED = seedFromString("chamfer");
// **Deeper than `plantChunk.test.ts`'s usual depth 8.** A small planet has
// no room for its noise features to complete a cycle -- measured, radius
// 425 m (depth 8, block 2 m) reads only 14 of the plain preset's 21 biomes
// and misses Rainforest outright; radius 1,700 m (depth 10) reads 17.
// Climate is a property of the whole sphere, not of the patch a chunk
// stands on, so this is the one number in this file worth paying for.
const DEPTH = 10;
const CHUNK_LEVEL = 4;

// **Small enough that Heather still draws.** `PlantTemplateStore.draws`
// refuses a species under half a block, by design (doc 08's own floor) --
// Heather is 0.9 m and needs a block under 2.52 m to clear it, where
// `plantChunk.test.ts`'s usual 4 m test block would rule it out before any
// biome question is even asked.
const BLOCK = 2;

/** How many candidate chunks one species tries before giving up on this world. */
const SEARCH_BUDGET = 40;

/**
 * The layers a fresh world actually opens with -- parsed from the same text
 * `vegetation.ts` and `planet.ts` read, not a hand-copied stand-in for it.
 * Read at module scope, because a dynamic `it` per layer has to exist before
 * `beforeAll` runs.
 */
const LAYERS = plantLayersFromText(PLANT_LAYERS_DEFAULT).map(plantLayerOf);

// **Never trust a name you have not checked against the table it names.** A
// layer's `.biomes` and a biome table are edited in two different files; a
// typo in either leaves that layer masked to nothing forever, silently,
// which is exactly the failure mode `growStand`'s own "no match, no growth"
// rule cannot distinguish from "correctly restricted". **Checked against
// every preset, not only one.** A layer's list deliberately mixes names
// from both shipped tables, since whichever one is live is what it is
// checked against -- so a name only one preset would ever recognise is not
// itself a mistake, and only a name neither preset has is.
it("names only biomes some shipped preset actually has", () => {
	const named = new Set(
		Object.values(BIOME_PRESETS)
			.flat()
			.map((biome) => biome.name),
	);
	for (const layer of LAYERS)
		for (const name of layer.biomes ?? [])
			expect(named.has(name)).toBe(true);
});

/**
 * **The default layers, one shipped biome table, a real chunk and a real
 * template store -- the exact combination that shipped broken.** Every other
 * biome test either fabricates its own `biomeAt`/`biomeMasks` (`growStand`'s
 * own tests), or grows without a `PlantTemplateStore` at all
 * (`plantChunk.test.ts`'s biome table), so neither would have caught
 * `buildPlantTemplate` leaking `.biomes` into its own private, biome-blind
 * reference patch (see `plantTemplate.test.ts`). This is the one test that
 * reads the real default text, a real preset, and stamps through the real
 * store -- the same three things a player's own first chunk does. Run once
 * against each shipped preset, because a layer's `.biomes` names both and a
 * test that only ever tries one would never have caught the Holdridge table
 * going untouched by every layer but Baobab and Bush -- the two whose list
 * happens to share "Steppe" with the plain preset by coincidence.
 */
function describeAgainstPreset(
	preset: string,
	table: readonly BiomeDef[],
): void {
	describe(`the shipped default vegetation, against the "${preset}" biomes`, () => {
		let shape: WorldShape;
		let terrain: TerrainGenerator;
		let biomeField: BiomeField;
		let templates: PlantTemplateStore;

		beforeAll(() => {
			const options = { ...COARSE_MAP_DEFAULTS, level: 5 };
			const map = buildCoarseMap(SEED, options);
			const radius =
				(BLOCK * 2 ** DEPTH) /
				Math.sqrt((8 * Math.PI) / (10 * Math.sqrt(3)));
			shape = new WorldShape(
				radius,
				DEPTH,
				maxElevationFor(options),
				256,
			);
			terrain = new TerrainGenerator(SEED, shape, map, TERRAIN_DEFAULTS);
			biomeField = new BiomeField(
				biomeWorldFor(
					SEED,
					shape,
					map,
					CONTINENT_LAYER_DEFAULT,
					EROSION_LAYER_DEFAULT,
					PEAKS_LAYER_DEFAULT,
				),
				table,
			);
			templates = new PlantTemplateStore(SEED, DEPTH, BLOCK, radius);
		});

		/**
		 * Every land chunk, of a sweep of the sphere, whose own direction reads
		 * as one of these biomes -- found rather than assumed, because a small
		 * test world's climate is whatever the seed happens to draw.
		 *
		 * **Land is `elevation > 0`, full stop** -- shore biomes such as Beach
		 * live in the first `shoreHeight` (12 m) above that, so a floor of
		 * "well above sea level" would rule out finding them at all, which is
		 * not the same thing as them not being there.
		 */
		function chunksIn(biomeNames: readonly string[]): ChunkAddress[] {
			const n = 2 ** DEPTH;
			const sample = makeBiomeSample();
			const out: ChunkAddress[] = [];
			for (let latitude = -70; latitude <= 70; latitude += 2)
				for (let longitude = -180; longitude < 180; longitude += 2) {
					const dir = positionOf(
						{ latitude, longitude, altitude: 0 },
						1,
					);
					const found = directionToCell(dir, n);
					const cell = canonicalCell(found.face, n, found.i, found.j);
					if (
						terrain.columnAt(cell.face, cell.i, cell.j).elevation <=
						0
					)
						continue;
					const biome = biomeField.readAt(
						dir.x,
						dir.y,
						dir.z,
						sample,
					);
					if (biome < 0) continue;
					if (!biomeNames.includes(table[biome]!.name)) continue;
					const split = splitPath(cell.i, cell.j, DEPTH, CHUNK_LEVEL);
					out.push(new ChunkAddress(cell.face, split.path));
				}
			return out;
		}

		for (const layer of LAYERS) {
			if (!layer.biomes || layer.biomes.length === 0) continue;
			// **Only the names this table actually has.** A layer may name a
			// ground this build no longer carries, and asking for a chunk
			// matching one would come back empty and say nothing about the
			// species.
			const known = new Set(table.map((biome) => biome.name));
			const biomes = layer.biomes.filter((name) => known.has(name));
			if (biomes.length === 0) continue;
			it(`grows ${layer.species} where ${biomes.join(" or ")} actually is`, () => {
				const candidates = chunksIn(biomes);
				// **A shore biome needs an actual coastline, and this world may
				// not have one.** Beach, Icy shore and Stony shore all require
				// `elevation` to sit inside a 12 m band above sea level -- a
				// property of where the coarse map happened to put the sea, not
				// of the sweep's resolution. Sized for test speed rather than
				// for guaranteeing every biome, this world can legitimately
				// lack one. Falling back to the same check
				// `plantTemplate.test.ts` makes for the exact bug this whole
				// file guards against still says the species itself is not the
				// reason nothing grew.
				if (candidates.length === 0) {
					const kept = templates.forLayer(layer);
					expect(
						kept.some((one) => one.count > 0),
						`${layer.species}'s own template is empty even off the ` +
							`biome question, which is the real bug this file ` +
							`exists to catch`,
					).toBe(true);
					return;
				}
				// **One matching chunk is not a guarantee this species wins a
				// root on it.** Two layers sharing a biome compete for the
				// same limited roots a small chunk offers, in list order --
				// the pairing is a fact about the biome table across the
				// whole world, not a promise that every single chunk of it
				// carries both. So this asks the real question: does the
				// species turn up anywhere its biome does, tried over up to
				// `SEARCH_BUDGET` matching chunks rather than just the first
				// -- bounded, so a genuine regression (nothing ever grows,
				// for every layer, on every chunk) fails in a few seconds
				// rather than grinding through however many thousand
				// candidates a common biome turns up.
				let found = 0;
				let anyGrown = false;
				for (const address of candidates.slice(0, SEARCH_BUDGET)) {
					const chunk = generateChunk(
						terrain,
						address,
						CHUNK_LEVEL,
						shape.crustDepth,
					);
					const grown = plantChunk(
						chunk,
						terrain,
						shape,
						LAYERS,
						SEED,
						shape.subdivisionDepth,
						templates,
						biomeField,
					);
					if (!grown) continue;
					anyGrown = true;
					const blocksOf = plantBlocksOf(layer.species);
					for (const block of chunk.blocks)
						if (block === blocksOf.wood || block === blocksOf.leaf)
							found++;
					if (found > 0) break;
				}
				expect(anyGrown).toBe(true);
				expect(found).toBeGreaterThan(0);
			});
		}
	});
}

describeAgainstPreset(DEFAULT_PRESET, BIOME_PRESETS[DEFAULT_PRESET]!);
