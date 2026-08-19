import { describe, expect, it } from "vitest";
import { decodeCell, encodeCell } from "chamfer/addressing";
import {
	BlockType,
	TerrainGenerator,
	flatCoarseMap,
	seedFromString,
} from "chamfer/generation";
import type { PlanetKnobs } from "../src/PlanetSettings.js";
import {
	FLAT_COARSE_LEVEL,
	KNOB_RANGES,
	PLANET_DEFAULTS,
	PlanetSettings,
} from "../src/PlanetSettings.js";

describe("cell address", () => {
	it("moves with the radius and the block size, and nothing else", () => {
		const base = new PlanetSettings();
		const wider = new PlanetSettings({ chunkCells: 64 });
		const coarser = new PlanetSettings({ coarseSpacing: 8 });
		const flatter = new PlanetSettings({ relief: 900 });

		// A subdivision depth is a property of the radius and the block size
		// alone. Every other knob changes what block sits at an address, never
		// the address itself.
		expect(wider.depth).toBe(base.depth);
		expect(coarser.depth).toBe(base.depth);
		expect(flatter.depth).toBe(base.depth);
		expect(wider.addressBits).toBe(base.addressBits);

		const smaller = new PlanetSettings({ radius: 100 });
		expect(smaller.depth).toBeLessThan(base.depth);
	});

	it("refuses a radius and block size past the 64-bit word", () => {
		// A 0.15 m block on a 25,000 m radius asks for depth 18, and the word
		// is 29 + 2 x depth, which passes 64 at depth 18.
		const past = new PlanetSettings({ radius: 25000, blockSize: 0.15 });
		expect(past.problems().join(" ")).toMatch(/64/);
	});

	it("builds cleanly past what a number holds exactly (F-018)", () => {
		// The shipped planet sits at depth 13, a 55-bit word -- past the 53
		// bits a number counts exactly. An ID is two 32-bit halves rather than
		// a number, so this is no longer a limit: a planet field above 0 still
		// round-trips exactly at this depth.
		const shipped = new PlanetSettings();
		expect(shipped.addressBits).toBeGreaterThan(53);
		expect(shipped.problems()).toEqual([]);

		const depth = shipped.depth;
		const fields = { planet: 4095, face: 7, i: 100, j: 5, layer: 800 };
		const id = encodeCell(fields, depth);
		const back = decodeCell(id, depth);
		expect(back.planet).toBe(4095);
		expect(back.layer).toBe(800);
		expect(back.i).toBe(100);
		expect(back.j).toBe(5);
	});
});

describe("the coarse level budget (F-020)", () => {
	it("leaves the shipped default untouched", () => {
		const shipped = new PlanetSettings();
		expect(shipped.coarseLevel).toBe(8);
	});

	it("caps a radius and coarse cell that asked for 671 million cells", () => {
		// The exact combination F-020 found: a 25,000 m radius with a 4 m
		// coarse cell, and a 0.5 m block so the subdivision depth does not cap
		// it first, asked for level 13 -- 671,088,642 cells -- with nothing
		// refusing it.
		const wide = new PlanetSettings({
			radius: 25000,
			coarseSpacing: 4,
			blockSize: 0.5,
		});
		expect(wide.coarseLevel).toBe(9);
		expect(10 * 4 ** wide.coarseLevel + 2).toBe(2621442);
	});
});

describe("the pause", () => {
	it("is not what a page with no query string gets", () => {
		// The pause is a tool for looking at the lattice on its own, not the
		// world anyone wants to arrive in. A page with no query string builds
		// the whole planet.
		expect(new PlanetSettings().knobs.plain).toBe(false);
	});

	it("overrides the height map without losing the setting", () => {
		const paused = new PlanetSettings({
			plain: true,
			coarseMap: true,
			relief: 700,
		});
		expect(paused.coarseMapRuns).toBe(false);
		expect(paused.relief).toBe(0);

		// The settings a person left behind are still there to come back to.
		expect(paused.knobs.coarseMap).toBe(true);
		expect(paused.knobs.relief).toBe(700);
	});

	it("gives it back when the pause is lifted", () => {
		const live = new PlanetSettings({
			plain: false,
			coarseMap: true,
			relief: 700,
		});
		expect(live.coarseMapRuns).toBe(true);
		expect(live.relief).toBe(700);
	});

	it("leaves a smooth, dry, all-grass sphere at the shipped defaults", () => {
		// The whole of the ground half of the pause, checked rather than
		// assumed: no height map means every cell reads zero metres, which is
		// sea level exactly, so the surface is the sea-level radius and the
		// water test can never be true.
		const settings = new PlanetSettings({ plain: true });
		const seed = seedFromString(settings.knobs.seed);
		const map = flatCoarseMap(seed, FLAT_COARSE_LEVEL);
		const shape = settings.shapeFor(map);
		const terrain = new TerrainGenerator(
			seed,
			shape,
			map,
			settings.terrainOptions(),
		);

		const radii = new Set<number>();
		const surface = new Set<number>();
		let wet = 0;
		for (let face = 0; face < 20; face++)
			for (let i = 0; i <= 12; i++)
				for (let j = 0; i + j <= 12; j++) {
					const column = terrain.columnAt(face, i * 80, j * 80);
					radii.add(column.groundRadius);
					surface.add(terrain.blockAt(column, column.groundLayer));
					if (column.waterRadius > column.groundRadius) wet++;
					// The walkable surface tops at the radius the generator
					// names -- one rounding once put it a whole block lower,
					// which dropped a standing viewer under the horizon
					// formula's reference sphere and shrank the world to the
					// four chunks underfoot.
					expect(shape.radiusOfLayer(column.groundLayer)).toBe(
						column.groundRadius,
					);
				}

		// One radius over every face: a sphere to the last bit, not a small
		// amount of relief.
		expect(radii.size).toBe(1);
		expect(wet).toBe(0);
		expect([...surface]).toEqual([BlockType.GRASS]);
	});
});

describe("the height map off", () => {
	// The pause forces the height map off, so these carry `plain: false` to
	// reach the knob's own behaviour.
	it("takes the ground to nothing at all", () => {
		const off = new PlanetSettings({
			plain: false,
			coarseMap: false,
			relief: 900,
		});
		expect(off.relief).toBe(0);
		expect(off.maxElevation).toBe(1);
		expect(off.groundSpan).toBe(2);
	});

	it("skips the map-resolution problems, since nothing reads that knob", () => {
		// This combination would refuse for being too fine a map cell if the
		// height map were on.
		const off = new PlanetSettings({
			plain: false,
			coarseMap: false,
			coarseSpacing: 1,
			blockSize: 4,
		});
		expect(off.problems()).toEqual([]);
	});

	it("still refuses a crust too shallow for the ground it is asked for", () => {
		// Reachable only from a hand-edited query string now: the panel settles
		// the two knobs into each other before either is read.
		const shallow = new PlanetSettings({
			plain: false,
			coarseMap: true,
			relief: 900,
			crustMetres: 200,
		});
		expect(shallow.problems().join(" ")).toMatch(/no floor/);
	});
});

describe("a slider narrowed by the rest of the draft", () => {
	// The report this answers: "I get 'raise Crust reaches to at least 1758 m,
	// or lower Relief' very often and I spend a lot of time tweaking sliders."
	it("pulls the crust up behind Relief rather than refusing", () => {
		const asked = { ...PLANET_DEFAULTS, relief: 600, crustMetres: 737 };
		expect(new PlanetSettings(asked).problems().length).toBeGreaterThan(0);

		const settled = PlanetSettings.settle(asked);
		expect(settled.crustMetres).toBeGreaterThan(asked.crustMetres);
		expect(new PlanetSettings(settled).problems()).toEqual([]);
	});

	it("leaves no reachable combination that refuses", () => {
		// Every knob at each end of its own live range, settled, has to build.
		const keys = Object.keys(KNOB_RANGES) as (keyof PlanetKnobs)[];
		for (const key of keys)
			for (const end of ["low", "high"] as const) {
				const live = new PlanetSettings().rangeFor(key);
				const draft = { ...PLANET_DEFAULTS } as Record<string, unknown>;
				draft[key as string] =
					typeof PLANET_DEFAULTS[key] === "boolean"
						? end === "high"
						: live[end];
				const settled = PlanetSettings.settle(
					draft as unknown as PlanetKnobs,
				);
				expect(
					new PlanetSettings(settled).problems(),
					`${key} at its ${end}`,
				).toEqual([]);
			}
	});

	it("only ever moves an end inward", () => {
		const s = new PlanetSettings();
		for (const key of Object.keys(KNOB_RANGES) as (keyof PlanetKnobs)[]) {
			const live = s.rangeFor(key);
			const stated = KNOB_RANGES[key as string]!;
			expect(live.low, key).toBeGreaterThanOrEqual(stated.low);
			expect(live.high, key).toBeLessThanOrEqual(stated.high);
			expect(live.low, key).toBeLessThanOrEqual(live.high);
		}
	});
});

describe("the octave stack", () => {
	it("names the narrowest octave the noise makes", () => {
		// Each octave is `lacunarity` times narrower than the one above, so
		// four octaves at lacunarity 2 reach an eighth of the widest feature.
		const s = new PlanetSettings({
			noiseScale: 4000,
			octaves: 4,
			lacunarity: 2,
		});
		expect(s.smallestLandform).toBeCloseTo(500, 6);
	});

	it("refuses ground the map is too coarse to draw", () => {
		// The world is the map, so an octave narrower than two map cells is
		// ground that would not exist. Refusing beats building it invisibly.
		const tooFine = new PlanetSettings({
			plain: false,
			coarseMap: true,
			noiseScale: 4000,
			octaves: 8,
			coarseSpacing: 128,
		});
		expect(tooFine.problems().join(" ")).toMatch(/narrowest octave/);
	});
});

describe("the cloud level budget", () => {
	it("leaves the shipped default untouched", () => {
		// Level 7 at 4 shells, 163,842 points a deck -- the heaviest deck this
		// project has actually measured, and the number the budget is
		// calibrated from.
		const shipped = new PlanetSettings();
		expect(shipped.cloudLevel).toBe(7);
	});

	it("caps a puff fine enough to have crashed the renderer", () => {
		// The exact combination that filled a combined vertex buffer past the
		// device's 256 MiB buffer limit on real hardware: a 0.75 m block asks
		// for a small enough world that a 16 m puff rounds to level 9, and
		// three shells on that many points is not a buffer any more.
		const crashed = new PlanetSettings({
			blockSize: 0.75,
			cloudPuff: 16,
			cloudShells: 3,
		});
		expect(crashed.cloudLevel).toBeLessThan(9);
	});

	it("lowers the level further as shells rise, at the same puff", () => {
		const fewShells = new PlanetSettings({ cloudPuff: 8, cloudShells: 1 });
		const manyShells = new PlanetSettings({ cloudPuff: 8, cloudShells: 8 });
		expect(manyShells.cloudLevel).toBeLessThanOrEqual(fewShells.cloudLevel);
	});
});

describe("boolean knobs round-trip through a query string", () => {
	it("reads coarseMap, paused and timeOfDay back out", () => {
		const params = new PlanetSettings({
			coarseMap: false,
			paused: true,
			timeOfDay: 0.75,
		}).toParams();
		const back = PlanetSettings.fromParams(params);
		expect(back.knobs.coarseMap).toBe(false);
		expect(back.knobs.paused).toBe(true);
		expect(back.knobs.timeOfDay).toBe(0.75);
	});

	it("leaves an unset boolean at its default", () => {
		const back = PlanetSettings.fromParams(new URLSearchParams());
		expect(back.knobs.coarseMap).toBe(true);
		expect(back.knobs.paused).toBe(false);
	});
});

describe("a knob that did not get what it asked for says so", () => {
	// The report these answer: a Puff slider that felt "completely unaffected
	// by the knob". It was clamped, and nothing on the row said which knob was
	// doing the clamping or what the world actually held.

	it("names the shell budget when it, not rounding, set the cloud level", () => {
		const capped = new PlanetSettings({
			radius: 19800,
			blockSize: 0.75,
			cloudPuff: 8,
			cloudShells: 4,
		});
		expect(capped.cloudLevelCapped).toBe(true);
		// Asked for 8 m and the world holds 192 m: the whole 8-to-128 m slider
		// is on the far side of the cap, so no value on it changes anything.
		expect(capped.cloudPuff).toBeGreaterThan(128);
	});

	it("does not claim a cap when the puff only rounded to a level", () => {
		const rounded = new PlanetSettings({ cloudPuff: 64, cloudShells: 1 });
		expect(rounded.cloudLevelCapped).toBe(false);
	});

	it("names the coarse cap when a wide radius asks past level 9", () => {
		const capped = new PlanetSettings({
			radius: 19800,
			blockSize: 0.75,
			coarseSpacing: 12,
		});
		expect(capped.coarseLevelCapped).toBe(true);
		expect(capped.coarseLevel).toBe(9);
	});

	it("does not claim a coarse cap at the shipped defaults", () => {
		expect(new PlanetSettings({}).coarseLevelCapped).toBe(false);
	});

	it("says which of the three caps held the crust back", () => {
		expect(new PlanetSettings({}).crustCap).toBe("asked");
		// 832 m of crust in 0.75 m blocks is 1,110 layers, and the layer field
		// names 1,024. The world runs 768 m deep and the knob never said.
		const field = new PlanetSettings({
			radius: 19800,
			blockSize: 0.75,
			crustMetres: 832,
		});
		expect(field.crustCap).toBe("field");
		expect(field.crustDepth).toBe(1024);
	});
});
