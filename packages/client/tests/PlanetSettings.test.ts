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
	BAKED_KNOBS,
	FLAT_COARSE_LEVEL,
	KNOB_RANGES,
	LIVE_TERRAIN_KNOBS,
	PLANET_DEFAULTS,
	PlanetSettings,
	REMESH_KNOBS,
	WORLD_SHAPE_KNOBS,
	curveToText,
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

	it("holds the ground still without losing the setting", () => {
		const paused = new PlanetSettings({ plain: true, relief: 700 });
		expect(paused.coarseMapRuns).toBe(false);
		expect(paused.relief).toBe(0);

		// The settings a person left behind are still there to come back to.
		expect(paused.knobs.relief).toBe(700);
	});

	it("gives it back when the pause is lifted", () => {
		const live = new PlanetSettings({ plain: false, relief: 700 });
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

describe("the plain planet", () => {
	// **There is one switch, and it is the pause.** The map is the terrain and
	// nothing else makes ground, so the only state that is not a map is the
	// smooth sphere the level of detail is judged against.
	it("takes the ground to nothing at all", () => {
		const off = new PlanetSettings({ plain: true, relief: 900 });
		expect(off.relief).toBe(0);
		expect(off.maxElevation).toBe(1);
		expect(off.groundSpan).toBe(2);
	});

	it("skips the map-resolution problems, since nothing reads the map", () => {
		// This combination would refuse for being too fine a map cell if the
		// map were running.
		const off = new PlanetSettings({
			plain: true,
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
		// The two curves have a range entry so the panel can read `rebuilds`
		// off it, and no ends to sweep: a curve is dragged, not slid.
		const keys = (Object.keys(KNOB_RANGES) as (keyof PlanetKnobs)[]).filter(
			(key) => !Array.isArray(PLANET_DEFAULTS[key]),
		);
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
			continentFeature: 500,
			continentFeatureScale: 8,
			peaksFeature: 250,
			peaksFeatureScale: 8,
		});
		expect(s.widestOf("continent")).toBeCloseTo(4000, 6);
		expect(s.widestOf("peaks")).toBeCloseTo(2000, 6);
	});

	it("names the narrowest octave each layer makes", () => {
		// Each octave is half as wide as the one above, so four octaves reach
		// an eighth of the widest feature. The two layers are asked separately:
		// they carry their own width and their own count.
		const s = new PlanetSettings({
			continentFeature: 500,
			continentFeatureScale: 8,
			continentOctaves: 4,
			peaksFeature: 250,
			peaksFeatureScale: 8,
			peaksOctaves: 3,
		});
		expect(s.narrowestOf("continent")).toBeCloseTo(500, 6);
		expect(s.narrowestOf("peaks")).toBeCloseTo(500, 6);
		expect(s.smallestLandform).toBeCloseTo(500, 6);
	});

	it("takes the narrowest of the three, and ignores a layer that is off", () => {
		// **Three layers reach the map and the carve does not**, so the map has
		// to be fine enough for whichever of the three cuts finest -- and a
		// layer that is off asks nothing of it.
		const wide = {
			continentFeature: 500,
			continentFeatureScale: 8,
			continentOctaves: 1,
			erosionFeature: 500,
			erosionFeatureScale: 8,
			erosionOctaves: 1,
			peaksFeature: 500,
			peaksFeatureScale: 8,
			peaksOctaves: 4,
		};
		const all = new PlanetSettings(wide);
		expect(all.smallestLandform).toBeCloseTo(500, 6);
		const flat = new PlanetSettings({ ...wide, peaksLayer: false });
		expect(flat.smallestLandform).toBeCloseTo(4000, 6);
		// The carve is measured against the crust rather than a landform, and
		// it never touches the map.
		const cut = new PlanetSettings({
			...wide,
			peaksLayer: false,
			carveFeature: 20,
			carveOctaves: 4,
		});
		expect(cut.smallestLandform).toBeCloseTo(4000, 6);
	});

	it("refuses ground the map is too coarse to draw", () => {
		// The world is the map, so an octave narrower than two map cells is
		// ground that would not exist. Refusing beats building it invisibly.
		const tooFine = new PlanetSettings({
			plain: false,
			continentFeature: 500,
			continentFeatureScale: 8,
			continentOctaves: 8,
			coarseSpacing: 128,
		});
		expect(tooFine.problems().join(" ")).toMatch(/narrowest octave/);
	});
});

describe("the layer rows", () => {
	it("hands every layer's whole stack to the engine", () => {
		// **A layer is a stack, not a frequency.** Every row of it has to reach
		// the engine or the panel is showing a knob the world does not read.
		const options = new PlanetSettings({
			continentFeature: 400,
			continentFeatureScale: 5,
			continentOctaves: 5,
			continentPersistence: 0.35,
			continentLacunarity: 2.4,
			continentFold: 0.2,
		}).coarseOptions();
		expect(options.continent!.metres).toBe(2000);
		expect(options.continent!.octaves).toBe(5);
		expect(options.continent!.persistence).toBeCloseTo(0.35, 9);
		expect(options.continent!.lacunarity).toBeCloseTo(2.4, 9);
		expect(options.continent!.fold).toBeCloseTo(0.2, 9);
	});

	it("gives the carve no fold, whatever a link says", () => {
		// A fold creases a whole world at once, which is what makes it a
		// landform knob; a crease in a carve field is one nobody can see from
		// inside the cave it cuts. The row is not on the panel and the layer
		// takes a zero rather than whatever happened to be in the draft.
		const carve = new PlanetSettings({}).terrainOptions().carve!;
		expect(carve.fold).toBe(0);
	});

	it("keeps the carve out of the map and in the terrain", () => {
		// It is read per block down a column, so a map cell coarser than its
		// narrowest octave costs it nothing -- and a map that had to carry it
		// would be sized for a field it never holds.
		const settings = new PlanetSettings({ carveFeature: 20 });
		expect(
			(settings.coarseOptions() as unknown as Record<string, unknown>)
				.carve,
		).toBeUndefined();
		expect(settings.terrainOptions().carve!.metres).toBe(20);
		expect(settings.smallestLandform).toBeGreaterThan(20);
	});

	it("carries every curve through a query string", () => {
		const link = new URLSearchParams(
			"continentCurve=-1:0,1:1&peaksCurve=-1:0.2,0:0.5,1:0.9",
		);
		const chosen = PlanetSettings.fromParams(link);
		expect(chosen.knobs.continentCurve).toEqual([
			[-1, 0],
			[1, 1],
		]);
		expect(chosen.knobs.peaksCurve.length).toBe(3);
		expect(chosen.toParams().get("continentCurve")).toBe("-1:0,1:1");
	});
});

describe("a curve round-trips through a query string", () => {
	it("carries a dragged curve and leaves a default one out", () => {
		const plain = new PlanetSettings({}).toParams();
		expect(plain.get("continentCurve")).toBeNull();
		const moved = new PlanetSettings({
			continentCurve: [
				[-1, 0.1],
				[0.2, 0.4],
				[1, 0.9],
			],
		});
		const back = PlanetSettings.fromParams(moved.toParams());
		expect(back.knobs.continentCurve).toEqual([
			[-1, 0.1],
			[0.2, 0.4],
			[1, 0.9],
		]);
	});

	/**
	 * **A curve is the one knob that is an array, and the panel drags it in
	 * place.** Shared, that drag reached `PLANET_DEFAULTS` itself: the default
	 * moved with the draft, "does this differ from the default" answered no,
	 * and the curve was left out of every link the world travelled in. The
	 * work was on the screen and in no query string.
	 */
	it("gives every world its own curves", () => {
		const was = curveToText(PLANET_DEFAULTS.continentCurve);
		const one = new PlanetSettings();
		const two = new PlanetSettings();
		expect(one.knobs.continentCurve).not.toBe(
			PLANET_DEFAULTS.continentCurve,
		);
		expect(one.knobs.continentCurve).not.toBe(two.knobs.continentCurve);

		// Drag a point, the way the panel does.
		(one.knobs.continentCurve as [number, number][])[1]![1] = 0.77;
		expect(curveToText(PLANET_DEFAULTS.continentCurve)).toBe(was);
		expect(curveToText(two.knobs.continentCurve)).toBe(was);
		expect(one.toParams().get("continentCurve")).toBe(
			curveToText(one.knobs.continentCurve),
		);
	});

	it("keeps the curve a caller handed in out of its own hands", () => {
		const mine: [number, number][] = [
			[-1, 0],
			[1, 1],
		];
		const world = new PlanetSettings({ peaksCurve: mine });
		(world.knobs.peaksCurve as [number, number][])[0]![1] = 0.5;
		expect(mine[0]![1]).toBe(0);
	});
});

describe("boolean knobs round-trip through a query string", () => {
	it("reads plain, paused and timeOfDay back out", () => {
		const params = new PlanetSettings({
			plain: true,
			paused: true,
			timeOfDay: 0.75,
		}).toParams();
		const back = PlanetSettings.fromParams(params);
		expect(back.knobs.plain).toBe(true);
		expect(back.knobs.paused).toBe(true);
		expect(back.knobs.timeOfDay).toBe(0.75);
	});

	it("leaves an unset boolean at its default", () => {
		const back = PlanetSettings.fromParams(new URLSearchParams());
		expect(back.knobs.plain).toBe(PLANET_DEFAULTS.plain);
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
		const query =
			"seed=elsewhere&relief=240&seaDepth=80&peakRelief=60&erosionBite=0.3";
		const settings = PlanetSettings.fromParams(new URLSearchParams(query));
		expect(settings.knobs.seed).toBe("elsewhere");
		expect(settings.knobs.relief).toBe(240);
		expect(settings.knobs.seaDepth).toBe(80);
		expect(settings.knobs.peakRelief).toBe(60);
		expect(settings.knobs.erosionBite).toBeCloseTo(0.3, 9);
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

describe("what a live rebuild can show", () => {
	/**
	 * The knobs baked into the mesh, so nothing on screen moves until every
	 * chunk is built again -- and none of which moves a block. Three are baked
	 * into the vertex colours; `cutoutLeaves` is baked into which faces exist,
	 * which is geometry and still not a block.
	 */
	const BAKED = [
		"speckle",
		"ambientOcclusion",
		"skyExposure",
		"cutoutLeaves",
	] as const;

	it("names the same four the client routes on", () => {
		// `BAKED_KNOBS` is what decides a knob takes the cheap path -- the
		// meshes again and not the map. A key listed here and missing there
		// would quietly go on rebuilding the coarse map it cannot move.
		expect([...BAKED_KNOBS].sort()).toEqual([...BAKED].sort());
	});

	it("splits the remesh set cleanly in two", () => {
		// Every key that needs a rebuild is in exactly one of the two, so the
		// panel's question -- does this key move the ground -- always has an
		// answer, and nothing needing the map ever takes the path that keeps
		// it.
		for (const key of REMESH_KNOBS)
			expect(LIVE_TERRAIN_KNOBS.has(key) !== BAKED_KNOBS.has(key)).toBe(
				true,
			);
		for (const key of BAKED_KNOBS) expect(REMESH_KNOBS.has(key)).toBe(true);
		for (const key of LIVE_TERRAIN_KNOBS)
			expect(REMESH_KNOBS.has(key)).toBe(true);
	});

	it("rebuilds for a knob that is baked into the mesh", () => {
		// The panel only calls `onLiveRebuild` for a key in this set. Left out
		// of it, a baked knob marks the world dirty and changes nothing at
		// all until a full reload -- which reads as a switch that does not
		// work, because every frame after it looks the same.
		for (const key of BAKED) expect(REMESH_KNOBS.has(key)).toBe(true);
	});

	it("keeps them out of what names a world", () => {
		// The set a world's stored edits are filed under. A knob that moves no
		// block must stay out of it, or turning it files every later edit
		// under a different world and leaves the player's own behind.
		for (const key of BAKED) expect(WORLD_SHAPE_KNOBS.has(key)).toBe(false);
	});

	it("needs a rebuild for every one of them", () => {
		// The panel routes on `rebuilds` first and only then asks the set, so
		// a baked knob marked live would take the `onLive` path and never
		// reach a rebuild at all.
		for (const key of BAKED) expect(KNOB_RANGES[key]!.rebuilds).toBe(true);
	});

	it("takes full light on the next frame and rebuilds nothing", () => {
		// How much sky a cell stands under is a number of its own on every
		// vertex rather than a factor in the colour, so the shader takes it
		// away itself. It moves no block either way.
		expect(REMESH_KNOBS.has("fullbright")).toBe(false);
		expect(WORLD_SHAPE_KNOBS.has("fullbright")).toBe(false);
		expect(KNOB_RANGES["fullbright"]!.rebuilds).toBe(false);
	});

	it("keeps a carried light out of the mesh and out of the world", () => {
		// It is a cube of levels the frame carries, filled from where the
		// player stands, so nothing about it reaches a vertex.
		for (const key of ["torchOn", "torchRange", "torchStrength"] as const) {
			expect(REMESH_KNOBS.has(key)).toBe(false);
			expect(WORLD_SHAPE_KNOBS.has(key)).toBe(false);
			expect(KNOB_RANGES[key]!.rebuilds).toBe(false);
		}
	});

	it("gives one world one name however they are turned", () => {
		// The record `worldKey` hashes into the key a player's edits are
		// filed under. Turning a knob that moves no block has to leave that
		// record alone, or the buildings are still on disk under a name
		// nothing asks for again.
		const base = new PlanetSettings();
		const named = JSON.stringify(base.worldShape());
		for (const key of BAKED) {
			const flipped = new PlanetSettings({
				...base.knobs,
				[key]: !base.knobs[key],
			});
			expect(JSON.stringify(flipped.worldShape())).toBe(named);
		}

		// And the record is not simply empty: a knob that really does move the
		// ground still names a different world, which is the whole point of
		// keeping the two sets apart.
		const moved = new PlanetSettings({
			...base.knobs,
			relief: base.knobs.relief + 1,
		});
		expect(JSON.stringify(moved.worldShape())).not.toBe(named);
	});
});
