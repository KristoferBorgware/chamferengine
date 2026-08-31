import { describe, expect, it } from "vitest";
import {
	ANY_LANDFORM,
	BIOME_GROUNDS,
	BIOME_PRESETS,
	BLOCK_NAMES,
	DEFAULT_BIOMES,
	LANDFORMS,
	SHORE,
	allowedBiomes,
	biomeOf,
} from "chamfer/generation";

describe("biomeOf", () => {
	const biomes = DEFAULT_BIOMES;

	/** Any landform that is not the shore, for a climate that may sit anywhere. */
	const LOWLANDS = LANDFORMS.findIndex((f) => f.key === "lowlands");
	const allowed = allowedBiomes(biomes);

	it("answers with the nearest dot among the allowed set alone", () => {
		// Right on a dot, the answer is that dot -- asked on a landform that
		// allows it, which for a filed ground is the one it is filed to and
		// for a climate is any of them.
		for (let b = 0; b < biomes.length; b++) {
			const form =
				biomes[b]!.landform === ANY_LANDFORM
					? LOWLANDS
					: LANDFORMS.findIndex((f) => f.key === biomes[b]!.landform);
			expect(
				biomeOf(biomes[b]!.t, biomes[b]!.h, allowed[form], biomes),
			).toBe(b);
		}
	});

	it("has an answer for every climate on every landform: no holes", () => {
		for (let form = 0; form < LANDFORMS.length; form++)
			for (let t = 0; t <= 1; t += 0.25)
				for (let h = 0; h <= 1; h += 0.25)
					expect(
						biomeOf(t, h, allowed[form], biomes),
					).toBeGreaterThanOrEqual(0);
	});

	// **The shore is the one landform a filed biome takes outright**, and it
	// is what keeps a beach reachable: a coast reads the most crowded corner
	// of the square, so a beach merely added to that crowd never wins.
	it("hands the shore to its own grounds and shares every other landform", () => {
		const shore = new Set(
			biomes
				.map((b, i) => [b, i] as const)
				.filter(([b]) => b.landform === "shore")
				.map(([, i]) => i),
		);
		expect(shore.size).toBeGreaterThan(0);
		expect(new Set(allowed[SHORE])).toEqual(shore);
		const climates = biomes.filter(
			(b) => b.landform === ANY_LANDFORM,
		).length;
		for (let form = 0; form < LANDFORMS.length; form++) {
			if (form === SHORE) continue;
			const here = allowed[form]!.filter(
				(i) => biomes[i]!.landform === ANY_LANDFORM,
			);
			expect(here.length).toBe(climates);
		}
	});

	it("returns -1 only for a landform with no biome at all", () => {
		expect(biomeOf(0.5, 0.5, [], biomes)).toBe(-1);
		expect(biomeOf(0.5, 0.5, undefined, biomes)).toBe(-1);
	});
});

describe("the presets", () => {
	it("give every landform at least one biome in every shipped set", () => {
		for (const preset of Object.keys(BIOME_PRESETS)) {
			const allowed = allowedBiomes(BIOME_PRESETS[preset]!);
			for (let form = 0; form < LANDFORMS.length; form++)
				expect(allowed[form]!.length).toBeGreaterThan(0);
		}
	});

	// **Sixteen name a climate and five name a place.** A climate is filed
	// under no landform, because a rainforest on a hillside is still a
	// rainforest and filing it draws the relief curve as colour; a shoreline
	// and a summit are the landform itself, and no reading of the air says
	// where the land meets the water.
	it("files a ground to a landform only where the landform is what it is", () => {
		for (const set of Object.values(BIOME_PRESETS)) {
			const filed = set.filter((b) => b.landform !== ANY_LANDFORM);
			const climates = set.filter((b) => b.landform === ANY_LANDFORM);
			expect(climates.length).toBeGreaterThan(filed.length);
			for (const biome of filed)
				expect(LANDFORMS.some((f) => f.key === biome.landform)).toBe(
					true,
				);
		}
	});

	it("gives every biome its own block, and never renames one shared on purpose", () => {
		const nameOf = new Map<number, string>();
		for (const set of Object.values(BIOME_PRESETS))
			for (const biome of set) {
				const already = nameOf.get(biome.block);
				if (already !== undefined) {
					// `elevation` reads `holdridge`'s own dots, so the two
					// share every block on purpose -- the same ground, gated
					// by landform or not. Anything else repeating a block
					// would be renaming a world's own ground on reopening.
					expect(biome.name).toBe(already);
					continue;
				}
				nameOf.set(biome.block, biome.name);
				expect(BLOCK_NAMES[biome.block]).toMatch(/^chamfer:.*_ground$/);
				expect(BIOME_GROUNDS[biome.block]).toBeDefined();
			}
	});

	it("write the block color from the biome's own hex", () => {
		for (const biome of DEFAULT_BIOMES) {
			const n = parseInt(biome.hex, 16);
			const color = BIOME_GROUNDS[biome.block]!;
			expect(color[0]).toBeCloseTo(
				Math.pow(((n >> 16) & 255) / 255, 2.2),
				10,
			);
			expect(color[2]).toBeCloseTo(Math.pow((n & 255) / 255, 2.2), 10);
		}
	});

	it("place every dot inside the unit square", () => {
		for (const set of Object.values(BIOME_PRESETS))
			for (const biome of set) {
				expect(biome.t).toBeGreaterThanOrEqual(0);
				expect(biome.t).toBeLessThanOrEqual(1);
				expect(biome.h).toBeGreaterThanOrEqual(0);
				expect(biome.h).toBeLessThanOrEqual(1);
			}
	});
});
