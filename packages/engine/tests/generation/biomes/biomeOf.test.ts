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
	it("give every landform at least one biome in every shipped set", () => {
		for (const preset of Object.keys(BIOME_PRESETS)) {
			const allowed = allowedBiomes(BIOME_PRESETS[preset]!);
			for (let form = 0; form < LANDFORMS.length; form++)
				expect(allowed[form]!.length).toBeGreaterThan(0);
		}
	});

	it("files every life zone under no landform, in both Holdridge tables", () => {
		for (const biome of BIOME_PRESETS["holdridge"]!)
			expect(biome.landform).toBe(ANY_LANDFORM);
		// `elevation` is those same zones plus the substrate, and the
		// substrate is the only part of it filed to real ground.
		const merged = BIOME_PRESETS["elevation"]!;
		const zones = merged.filter((b) => b.landform === ANY_LANDFORM);
		const substrate = merged.filter((b) => b.landform !== ANY_LANDFORM);
		expect(zones.map((b) => b.name)).toEqual(
			BIOME_PRESETS["holdridge"]!.map((b) => b.name),
		);
		expect(substrate.length).toBeGreaterThan(0);
		for (const biome of substrate)
			expect(LANDFORMS.some((f) => f.key === biome.landform)).toBe(true);
	});

	// **The shore is the one landform a filed biome takes outright.** Every
	// other keeps its life zones and gains a dot; a coast reads the most
	// crowded corner of the square, so a beach merely added never wins.
	it("hands the shore to its own biomes, and shares every other landform", () => {
		const merged = BIOME_PRESETS["elevation"]!;
		const allowed = allowedBiomes(merged);
		const zones = new Set(
			merged
				.map((b, i) => [b, i] as const)
				.filter(([b]) => b.landform === ANY_LANDFORM)
				.map(([, i]) => i),
		);
		for (let form = 0; form < LANDFORMS.length; form++) {
			const here = allowed[form]!;
			const fromZones = here.filter((i) => zones.has(i)).length;
			if (LANDFORMS[form]!.key === "shore") expect(fromZones).toBe(0);
			else expect(fromZones).toBe(zones.size);
		}
		// And a table filing nothing to the shore is untouched by the rule.
		expect(allowedBiomes(BIOME_PRESETS["holdridge"]!)[SHORE]!.length).toBe(
			BIOME_PRESETS["holdridge"]!.length,
		);
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
