import { describe, expect, it } from "vitest";
import { decodeCell, encodeCell, wordBits } from "chamfer/addressing";
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

		const smaller = new PlanetSettings({ subdivisionDepth: 9 });
		expect(smaller.depth).toBeLessThan(base.depth);
	});

	it("cannot be asked for a world past the 64-bit word", () => {
		// The word is 30 + 2 x depth and passes 64 at depth 18, which is why
		// the depth slider stops at 17. Asking past it is held rather than
		// refused, because a depth is the knob now rather than a consequence
		// of two others.
		expect(new PlanetSettings({ subdivisionDepth: 30 }).depth).toBe(17);
		expect(wordBits(17)).toBe(64);
		expect(wordBits(18)).toBeGreaterThan(64);
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
			subdivisionDepth: 16,
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
		const asked = { ...PLANET_DEFAULTS, relief: 900, crustMetres: 400 };
		expect(new PlanetSettings(asked).problems().length).toBeGreaterThan(0);

		const settled = PlanetSettings.settle(asked);
		expect(settled.crustMetres).toBeGreaterThan(asked.crustMetres);
		expect(new PlanetSettings(settled).problems()).toEqual([]);
	});

	it("lets Relief have what the ocean is not using", () => {
		// One scale for both put the sea floor 1.92x deeper than the peaks were
		// tall, which took Relief's ceiling down to 320 m on the shipped
		// planet. Split, the ceiling is the crust less the ocean's own share.
		const s = new PlanetSettings();
		expect(s.rangeFor("relief").high).toBeGreaterThan(600);
		// Within a step of it: the ceiling is rounded down onto the slider's
		// own notches, so it lands at or just under what is left over.
		expect(
			Math.abs(s.rangeFor("relief").high - (s.crustCeiling - s.seaDepth)),
		).toBeLessThanOrEqual(KNOB_RANGES.relief!.step);
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

describe("the two layers", () => {
	it("multiplies the two rows that set a layer's width", () => {
		// The coarse slider carries the decade and the fine one picks the value
		// inside it, so what the layer is set to is the product.
		const s = new PlanetSettings({
			terrainFeature: 500,
			terrainFeatureScale: 8,
			mountainFeature: 250,
			mountainFeatureScale: 8,
		});
		expect(s.widestOf("terrain")).toBeCloseTo(4000, 6);
		expect(s.widestOf("mountain")).toBeCloseTo(2000, 6);
	});

	it("names the narrowest octave each layer makes", () => {
		// Each octave is half as wide as the one above, so four octaves reach
		// an eighth of the widest feature. The two layers are asked separately:
		// they carry their own width and their own count.
		const s = new PlanetSettings({
			terrainFeature: 500,
			terrainFeatureScale: 8,
			terrainOctaves: 4,
			mountainFeature: 250,
			mountainFeatureScale: 8,
			mountainOctaves: 3,
		});
		expect(s.narrowestOf("terrain")).toBeCloseTo(500, 6);
		expect(s.narrowestOf("mountain")).toBeCloseTo(500, 6);
		expect(s.smallestLandform).toBeCloseTo(500, 6);
	});

	it("takes the narrower of the two, and ignores a layer that is off", () => {
		const both = new PlanetSettings({
			terrainFeature: 500,
			terrainFeatureScale: 8,
			terrainOctaves: 1,
			mountainFeature: 500,
			mountainFeatureScale: 8,
			mountainOctaves: 4,
			mountainLayer: true,
		});
		expect(both.smallestLandform).toBeCloseTo(500, 6);
		const alone = new PlanetSettings({
			...both.knobs,
			mountainLayer: false,
		});
		expect(alone.smallestLandform).toBeCloseTo(4000, 6);
	});

	it("refuses ground the map is too coarse to draw", () => {
		// The world is the map, so an octave narrower than two map cells is
		// ground that would not exist. Refusing beats building it invisibly.
		const tooFine = new PlanetSettings({
			plain: false,
			coarseMap: true,
			terrainFeature: 500,
			terrainFeatureScale: 8,
			terrainOctaves: 8,
			coarseSpacing: 128,
		});
		expect(tooFine.problems().join(" ")).toMatch(/narrowest octave/);
	});
});

describe("the erosion rows", () => {
	it("carries the walk through a query string, and refuses a name off the list", () => {
		// A link is how a world travels, and it can say anything: a knob that
		// names one of a fixed set keeps the value it had rather than taking a
		// word nothing in the engine answers to.
		const chosen = PlanetSettings.fromParams(
			new URLSearchParams(
				"erosion=0.6&erosionWalk=free&erosionInertia=0.45",
			),
		);
		expect(chosen.knobs.erosionWalk).toBe("free");
		expect(chosen.knobs.erosionInertia).toBeCloseTo(0.45, 9);
		expect(chosen.toParams().get("erosionWalk")).toBe("free");
		const nonsense = PlanetSettings.fromParams(
			new URLSearchParams("erosionWalk=sideways"),
		);
		expect(nonsense.knobs.erosionWalk).toBe("cell");
	});

	it("hands every erosion row to the engine", () => {
		const options = new PlanetSettings({
			erosion: 0.4,
			erosionWalk: "free",
			erosionMaxCut: 0.03,
			erosionCutShare: 0.1,
			erosionInertia: 0.6,
		}).coarseOptions();
		expect(options.erosion).toBeCloseTo(0.4, 9);
		expect(options.erosionWalk).toBe("free");
		expect(options.erosionMaxCut).toBeCloseTo(0.03, 9);
		expect(options.erosionCutShare).toBeCloseTo(0.1, 9);
		expect(options.erosionInertia).toBeCloseTo(0.6, 9);
	});
});

describe("a curve round-trips through a query string", () => {
	it("carries a dragged curve and leaves a default one out", () => {
		const plain = new PlanetSettings({}).toParams();
		expect(plain.get("terrainCurve")).toBeNull();
		const moved = new PlanetSettings({
			terrainCurve: [
				[-1, 0.1],
				[0.2, 0.4],
				[1, 0.9],
			],
		});
		const back = PlanetSettings.fromParams(moved.toParams());
		expect(back.knobs.terrainCurve).toEqual([
			[-1, 0.1],
			[0.2, 0.4],
			[1, 0.9],
		]);
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
		expect(back.knobs.coarseMap).toBe(PLANET_DEFAULTS.coarseMap);
		expect(back.knobs.paused).toBe(PLANET_DEFAULTS.paused);
	});

	it("never carries freeze view through a link, in either direction", () => {
		// Freeze view holds the camera the frame was drawn with, and that
		// camera cannot be written into a link. Every rebuild knob reloads
		// the page through these params, so if it travelled, changing Chunk
		// while frozen would relatch the freeze at the fresh page's spawn
		// camera -- 1.6 km up -- and the world came back stuck at face-level
		// cells, which read as level of detail being broken.
		const params = new PlanetSettings({ freezeView: true }).toParams();
		expect(params.get("freezeView")).toBe(null);

		const back = PlanetSettings.fromParams(
			new URLSearchParams("freezeView=true&chunkCells=8"),
		);
		expect(back.knobs.freezeView).toBe(false);
		expect(back.knobs.chunkCells).toBe(8);
	});
});

describe("a knob that did not get what it asked for says so", () => {
	// The report these answer: a Puff slider that felt "completely unaffected
	// by the knob". It was clamped, and nothing on the row said which knob was
	// doing the clamping or what the world actually held.

	it("names the coarse cap when a wide radius asks past level 9", () => {
		const capped = new PlanetSettings({
			subdivisionDepth: 15,
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
		// 1,600 m of crust in 0.75 m blocks is 2,134 layers, and the layer field
		// names 2,048. The world runs 1,536 m deep and the knob never said.
		const field = new PlanetSettings({
			subdivisionDepth: 15,
			blockSize: 0.75,
			crustMetres: 1600,
		});
		expect(field.crustCap).toBe("field");
		expect(field.crustDepth).toBe(2048);
	});
});

describe("a world read from a link", () => {
	it("is settled, so a link cannot build what a slider cannot reach", () => {
		// A crust too shallow for its own sea puts every ocean column entirely
		// under the bottom of the world: no blocks, nothing drawn, space where
		// the water should be. The panel cannot be dragged there; a link went
		// straight past it, and Copy link is how a world travels.
		const settings = PlanetSettings.fromParams(
			new URLSearchParams(
				"blockSize=1&relief=820&seaDepth=100&crustMetres=400",
			),
		);
		expect(
			settings.crustDepth * settings.knobs.blockSize,
		).toBeGreaterThanOrEqual(settings.groundSpan);
		expect(settings.problems()).toEqual([]);
	});

	it("leaves a world it can build exactly as the link states it", () => {
		const query = "seed=elsewhere&relief=240&seaDepth=80&landFraction=0.4";
		const settings = PlanetSettings.fromParams(new URLSearchParams(query));
		expect(settings.knobs.seed).toBe("elsewhere");
		expect(settings.knobs.relief).toBe(240);
		expect(settings.knobs.seaDepth).toBe(80);
		expect(settings.knobs.landFraction).toBe(0.4);
	});
});

describe("how deep the crust may be asked to run", () => {
	it("lets a bigger block buy the depth its layers can carry", () => {
		// A crust is a number of layers, and a layer is a block tall, so the
		// metres it reaches scale with the block. The slider's own maximum was
		// 1,024 m, which is the layer count rather than a distance, and it held
		// every world with a block over a metre to a fraction of what it could
		// hold.
		for (const blockSize of [1, 2, 4]) {
			const settings = new PlanetSettings({
				blockSize,
				subdivisionDepth: 13,
			});
			const range = settings.rangeFor("crustMetres");
			expect(range.high, `${blockSize} m block`).toBeGreaterThanOrEqual(
				settings.crustCeiling - KNOB_RANGES.crustMetres!.step,
			);
		}
	});

	it("never offers a crust the world cannot hold", () => {
		// The narrowing only moves inward, so the stated maximum has to be at
		// least the largest ceiling any world here reaches, and every single
		// world has to be narrowed back to its own. Settled first, because a
		// draft whose ground is taller than any crust it could have is a pair
		// of constraints crossing, and there the lower end wins on purpose.
		for (const blockSize of [0.5, 1, 2, 4])
			for (const subdivisionDepth of [10, 13, 15, 16]) {
				const settings = new PlanetSettings(
					PlanetSettings.settle({
						...PLANET_DEFAULTS,
						blockSize,
						subdivisionDepth,
					}),
				);
				const range = settings.rangeFor("crustMetres");
				// Within one step of the ceiling, not on it: the two ends round
				// to the slider's own step in opposite directions, so on a
				// small world they cross by less than a step and the low one
				// wins. What matters is that the world still builds, which the
				// line below checks -- `crustDepth` takes the smaller of the
				// knob, the taper and the field, so no setting can name a layer
				// outside them.
				expect(
					range.high,
					`${blockSize} m block at depth ${subdivisionDepth}`,
				).toBeLessThanOrEqual(settings.crustCeiling + range.step);
				expect(
					settings.crustDepth * blockSize,
					`${blockSize} m block at depth ${subdivisionDepth}`,
				).toBeLessThanOrEqual(settings.crustCeiling);
				expect(
					settings.problems(),
					`${blockSize} m block at depth ${subdivisionDepth}`,
				).toEqual([]);
			}
	});
});
