import { describe, expect, it } from "vitest";
import {
	ANY_LANDFORM,
	BIOME_GROUNDS,
	BIOME_PRESETS,
	BLOCK_NAMES,
	DEFAULT_BIOMES,
	LANDFORMS,
	allowedBiomes,
	biomeOf,
} from "chamfer/generation";

describe("biomeOf", () => {
	const biomes = DEFAULT_BIOMES;
	const allowed = allowedBiomes(biomes);

	it("answers with the nearest dot among the allowed set alone", () => {
		// Right on a dot, the answer is that dot.
		for (let b = 0; b < biomes.length; b++) {
			const form = LANDFORMS.findIndex(
				(f) => f.key === biomes[b]!.landform,
			);
			expect(biomeOf(biomes[b]!.t, biomes[b]!.h, allowed[form], biomes)).toBe(
				b,
			);
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

	it("keeps a lowland desert off a summit however hot the summit is", () => {
		const desert = biomes.findIndex((b) => b.name === "Desert");
		const peaks = LANDFORMS.findIndex((f) => f.key === "peaks");
		expect(biomeOf(biomes[desert]!.t, biomes[desert]!.h, allowed[peaks], biomes)).not.toBe(
			desert,
		);
	});

	it("returns -1 only for a landform with no biome at all", () => {
		expect(biomeOf(0.5, 0.5, [], biomes)).toBe(-1);
		expect(biomeOf(0.5, 0.5, undefined, biomes)).toBe(-1);
	});
});

describe("the presets", () => {
	it("give every landform at least one biome in the shipped set", () => {
		const allowed = allowedBiomes(DEFAULT_BIOMES);
		for (let form = 0; form < LANDFORMS.length; form++)
			expect(allowed[form]!.length).toBeGreaterThan(0);
	});

	it("file every Holdridge zone under any landform", () => {
		for (const biome of BIOME_PRESETS["holdridge"]!)
			expect(biome.landform).toBe(ANY_LANDFORM);
	});

	it("give every biome its own block, registered and colored", () => {
		const seen = new Set<number>();
		for (const set of Object.values(BIOME_PRESETS))
			for (const biome of set) {
				// Unique across both presets: a world painted by one and
				// reopened under the other must not rename its ground.
				expect(seen.has(biome.block)).toBe(false);
				seen.add(biome.block);
				expect(BLOCK_NAMES[biome.block]).toMatch(/^chamfer:.*_ground$/);
				expect(BIOME_GROUNDS[biome.block]).toBeDefined();
			}
	});

	it("write the block color from the biome's own hex", () => {
		for (const biome of DEFAULT_BIOMES) {
			const n = parseInt(biome.hex, 16);
			const color = BIOME_GROUNDS[biome.block]!;
			expect(color[0]).toBeCloseTo(Math.pow(((n >> 16) & 255) / 255, 2.2), 10);
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
