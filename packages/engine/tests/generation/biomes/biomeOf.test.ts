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

	it("keeps a lowland desert off a summit however hot the summit is", () => {
		const desert = biomes.findIndex((b) => b.name === "Desert");
		const peaks = LANDFORMS.findIndex((f) => f.key === "peaks");
		expect(
			biomeOf(
				biomes[desert]!.t,
				biomes[desert]!.h,
				allowed[peaks],
				biomes,
			),
		).not.toBe(desert);
	});

	it("returns -1 only for a landform with no biome at all", () => {
		expect(biomeOf(0.5, 0.5, [], biomes)).toBe(-1);
		expect(biomeOf(0.5, 0.5, undefined, biomes)).toBe(-1);
	});
});

describe("the presets", () => {
	it("give every landform at least one biome in the shipped set", () => {
		for (const preset of ["plain", "holdridge"]) {
			const allowed = allowedBiomes(BIOME_PRESETS[preset]!);
			for (let form = 0; form < LANDFORMS.length; form++)
				expect(allowed[form]!.length).toBeGreaterThan(0);
		}
	});

	it("file every Holdridge zone under a real landform, and elevation's own copy under any", () => {
		for (const biome of BIOME_PRESETS["holdridge"]!)
			expect(LANDFORMS.some((f) => f.key === biome.landform)).toBe(true);
		for (const biome of BIOME_PRESETS["elevation"]!)
			expect(biome.landform).toBe(ANY_LANDFORM);
	});

	it("keeps a hot desert off a summit under Holdridge too", () => {
		const holdridge = BIOME_PRESETS["holdridge"]!;
		const allowed = allowedBiomes(holdridge);
		const peaks = LANDFORMS.findIndex((f) => f.key === "peaks");
		for (const name of ["Subtropical desert", "Tropical desert"]) {
			const desert = holdridge.findIndex((b) => b.name === name);
			expect(
				biomeOf(
					holdridge[desert]!.t,
					holdridge[desert]!.h,
					allowed[peaks],
					holdridge,
				),
			).not.toBe(desert);
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
