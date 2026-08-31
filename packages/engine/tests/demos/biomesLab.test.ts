import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { BiomeWorld, ClimateFit } from "chamfer/generation";
import {
	BIOME_DEFAULTS,
	BiomeField,
	CONTINENT_LAYER_DEFAULT,
	CONTINENT_SEED_OFFSET,
	COARSE_MAP_DEFAULTS,
	DEFAULT_BIOMES,
	DEFAULT_LANDFORM_GRID,
	EROSION_LAYER_DEFAULT,
	EROSION_SEED_OFFSET,
	PEAKS_LAYER_DEFAULT,
	PEAKS_SEED_OFFSET,
	allowedBiomes,
	biomeOf,
	bucket,
	gridAt,
	heightFrom,
	landformAt,
	layerNoiseSettings,
	makeBiomeSample,
	octaveNoise,
	seedFromString,
	UNFITTED,
} from "chamfer/generation";
import { CELL_CONSTANT } from "chamfer/world";

/**
 * The biomes lab carries the same two copies of the engine the multi-noise lab
 * does, and this checks they are the same copies.
 *
 * `multiNoiseLab.test.ts` runs its blocks against the real `chamfer/generation`
 * and `chamfer/addressing` -- cell for cell, corner for corner. Repeating that
 * work here would be a second way of saying the same thing and a second place
 * to update. **Asserting the two pages hold identical text says it once**: the
 * multi-noise lab is checked against the engine, this page is checked against
 * the multi-noise lab, and a change to either that is not made to the other
 * fails here.
 *
 * A demo is one file with no imports and no build step, which is what lets it
 * be opened from a disk rather than served, so the copies are the cost.
 */
const MULTI = fileURLToPath(
	new URL("../../../../demos/multi-noise-lab.html", import.meta.url),
);
const BIOMES = fileURLToPath(
	new URL("../../../../demos/biomes-lab.html", import.meta.url),
);

const BLOCKS = [
	["the noise kernel", "// ===== BEGIN engine noise kernel =====", "// ===== END engine noise kernel ====="],
	["the coarse grid", "// ===== BEGIN engine coarse grid =====", "// ===== END engine coarse grid ====="],
	["the coordinates", "// ===== BEGIN engine coordinates =====", "// ===== END engine coordinates ====="],
] as const;

/** One marked block of a page, as source. */
function block(page: string, begin: string, end: string): string {
	const from = page.indexOf(begin);
	const to = page.indexOf(end);
	expect(from, `the opening marker ${begin}`).toBeGreaterThan(-1);
	expect(to, `the closing marker ${end}`).toBeGreaterThan(from);
	return page.slice(from + begin.length, to);
}

describe("the biomes lab's copy of the engine", () => {
	const multi = readFileSync(MULTI, "utf8");
	const lab = readFileSync(BIOMES, "utf8");

	for (const [name, begin, end] of BLOCKS)
		it(`holds the same ${name} as the multi-noise lab`, () => {
			expect(block(lab, begin, end)).toBe(block(multi, begin, end));
		});

	it("samples every climate field in 3D world space", () => {
		// Terrain noise read from a face's own (i, j) is discontinuous at all
		// thirty face edges, and the two climate fields are terrain in every
		// way that matters here: they decide what the ground is made of.
		expect(lab).toContain(
			"octaveNoise(x, y, z, seed + SEED_OFFSET.temp, s.temp)",
		);
		expect(lab).toContain(
			"octaveNoise(x, y, z, seed + SEED_OFFSET.hum, s.hum)",
		);
	});

	it("takes humidity off continentalness rather than a distance to water", () => {
		// **A distance to the nearest ocean is a flood fill**, and a flood fill
		// is a global query: whether a cell is wet would depend on a chain of
		// cells running three chunks away, which terrain generated a chunk at a
		// time cannot answer. Continentalness is already the field that says
		// how far inland a place is.
		expect(lab).toContain("-k.humOcean * said[0]");
		expect(lab).not.toContain("floodFill");
	});

	it("chooses a biome by the nearest dot, so no climate is unnamed", () => {
		// A table of ranges has to name a biome for every cell of a grid, and a
		// cell nobody filled in is a hole. A Voronoi diagram has none by
		// construction.
		expect(lab).toContain(
			"function biomeOf(t, h, form, biomesTable = biomes, allowedSets = allowed) {",
		);
		expect(lab).toContain("const d = dt * dt + dh * dh;");
	});

	it("lets the terrain choose the landform before the climate chooses a type", () => {
		// **Temperature and humidity cannot say that a place is a mountain.**
		// Measured on the shipped world, altitude drags the median temperature
		// of peaks only 0.033 of the diagram below the lowlands', so a diagram
		// read on climate alone puts a desert on a summit -- 13.1% of peak
		// ground came out Desert and 52.1% came out some dry lowland type. The
		// three terrain layers name the ground first, and the diagram then
		// only chooses which kind of that ground this one is.
		expect(lab).toContain(
			"function landformAt(\n\t\t\t\tlevel,\n\t\t\t\tcut,\n\t\t\t\tswing,\n\t\t\t\trise,\n\t\t\t\tmetres,\n\t\t\t\troom,\n\t\t\t\tshoreHeight = knobs.shoreHeight,\n\t\t\t) {",
		);
		expect(lab).toContain("const set = allowedSets[form];");
	});

	it("reads the landform off the curves' answers, not the raw noise", () => {
		// A layer is a stack of octaves read through a curve, and the curve is
		// what gives the reading a meaning: how high the continent stands, how
		// much erosion takes away, how far the relief swings. The raw noise
		// under all three is the same shape.
		expect(lab).toContain("splineAt(TERRAIN.cont.spline, said[0])");
		expect(lab).toContain("splineAt(TERRAIN.ero.spline, said[1])");
		expect(lab).toContain("splineAt(TERRAIN.pv.spline, said[2])");
	});

	it("reads the relief for the landform apart from the relief for the ground", () => {
		// **A scale mismatch was most of what made the biomes look random.**
		// The terrain's own relief stack runs to a 75 m octave because its job
		// is to carve one gully; asking it what kind of place this is at that
		// size asks a per-gully question. Measured on the shipped patch, the
		// peaks-and-valleys bucket flipped between neighbouring cells on 30.9%
		// of pairs against continentalness's 0%, and the whole biome map
		// changed every 141 m of walking. Same field and same curve, read at
		// one octave for the landform and four for the ground: every 320 m.
		expect(lab).toContain("function formSwingAt(x, y, z, seed, s) {");
		expect(lab).toContain("out.formPv = stackOf(");
		// the ground still reads its own
		expect(lab).toContain("const swing = splineAt(TERRAIN.pv.spline, said[2]) * 2 - 1;");
	});

	it("keeps the shore a height rather than a cell of the grid", () => {
		// Sea level is a radius and every height is measured from it, so *the
		// ground has barely come out of the water* is one comparison -- and it
		// cannot be true on a mountain however close to the coast it stands.
		expect(lab).toContain(
			"if (metres <= shoreHeight && room >= SHORE_ROOM) return SHORE;",
		);
	});

	it("asks for a beach's room at a distance in metres, never in cells", () => {
		// **Low is necessary and not sufficient.** The height field runs four
		// octaves, so on a steep coast one cell lands in the shore band with
		// the sea on one side and an eighty-metre hillside on the other, and
		// the coast draws as a dotted line of pale cells rather than a beach.
		// Measured over the opening patch, all 7 of its single-cell biomes
		// were exactly that, and requiring two of six points a map cell out to
		// be low land as well takes its runs of one biome from 22 to 14 and
		// the area in runs under eight cells from 3.2% to 1.3%. With the
		// regions switched off, which isolates the rule from them, 12 of 13
		// were a beach and the runs go 24 to 15.
		//
		// **The step is metres, never a neighbouring cell**, or the rule
		// answers a different question at every level of detail and a coarse
		// chunk and a fine one disagree about where the beach is -- doc 14's
		// own rule, that a point's ground does not depend on who asked. The
		// reach is bounded, so a chunk still answers from its own address with
		// no flood fill.
		expect(lab).toContain("function roomAt(x, y, z, seed, s, k, metres) {");
		expect(lab).toContain("const step = k.shoreReach / k.radius;");
		expect(lab).toContain("const SHORE_ROOM = 2;");
		// nothing walks a ring of cells to decide it
		expect(lab).not.toMatch(/roomAt[\s\S]{0,900}field\.ring/);
	});

	it("fits the diagram to the land the planet actually has", () => {
		// An octave stack normalised to its own peak has a standard deviation
		// of about a quarter of it, so raw readings cluster in the middle of
		// the square and the corners name climates no ground is in.
		expect(lab).toContain("function fitTo(rawT, rawH, land, fit = knobs.fit) {");
		expect(lab).toContain("const FIT_TAIL = 0.02;");
	});

	it("hands the renderer a right-handed frame, so the patch is not a mirror", () => {
		// **East, up and north in that order is left-handed** -- measured,
		// `cross(east, up) . north` is exactly -1 -- and a left-handed basis
		// given to a right-handed renderer draws the mirror image. Projected
		// from overhead the frame's east landed at screen +0.104, the right,
		// where the map puts it, and its north at -0.185, the bottom, where the
		// map puts the top. Taking south as the third axis rights it.
		expect(lab).toContain("localP[2] = -(");
		expect(lab).not.toContain(
			"localP[2] = rx * frame.north[0] + ry * frame.north[1] + rz * frame.north[2];",
		);
	});

	it("can count every share over the patch as well as the planet", () => {
		// A place is not a planet: the shipped opening patch is 27.1% Peaks
		// where the planet is 9.9%, and holds 17 of the 33 biomes. One switch
		// moves the tabs, the list, the grid and the line under the diagram
		// together, because a percentage next to a name is worthless if the
		// reader has to remember which of two things each one counts.
		expect(lab).toContain("function counted() {");
		expect(lab).toContain("field.patchShare = Array.from(counts,");
		expect(lab).toContain("field.patchByForm = Array.from(byForm,");
		expect(lab).toContain("field.patchInCell = Array.from(inCell,");
	});

	it("writes nothing as a dash rather than as a rounded zero", () => {
		// One hexagon of an 1,800 cell patch is 0.1%, so anything rounding to
		// 0.0% at one decimal would read as absent when it is merely small.
		expect(lab).toContain('if (v === 0) return "—";');
	});

	it("walks the patch on the engine's own lattice", () => {
		// The cells come from `directionToCell`, the ring from `neighbour`, and
		// the hexagons from `cellCorners` -- so a patch reaching a face edge
		// crosses it the way the engine does and one reaching a pentagon gets a
		// five-sided cell.
		expect(lab).toContain("neighbour(c.face, n, c.i, c.j, d)");
		expect(lab).toContain("cellCorners(cell.face, n, cell.i, cell.j)");
		expect(lab).toContain("canonicalCell(found.face, n, found.i, found.j)");
	});
});

// =====================================================================
// F-118: the lab's biome model against the engine's.
//
// The three checks above cover the noise, the lattice and the coordinates --
// every marked block the biomes lab shares with the multi-noise lab. The
// biome model itself was never in that set: `climateAt`, `landformAt`,
// `fitTo`, `regionsFor` and the preset tables are two copies with no test
// tying them together, so either could be tuned without the other noticing.
//
// The lab's `squareOf`, `landformAt`, `biomeOf` and `fitTo` read the page's
// own live `world`/`knobs` state through default parameters, which is what
// lets this file supply its own instead: a caller outside the page passes
// them through, and every call site inside the page is unchanged. `bucket`
// was tightened alongside this test -- it used `>=` where the engine's own
// `bucket` uses `>`, a boundary the two disagreed on with no page comment
// arguing either way, and now they agree exactly.
const MODEL_BEGIN = "// ===== BEGIN engine biome model =====";
const MODEL_END = "// ===== END engine biome model =====";
const FIT_BEGIN = "// ===== BEGIN engine biome fit =====";
const FIT_END = "// ===== END engine biome fit =====";

/** One noise stack, as `stackOf`/`settingsFor` build it. */
interface LabStack {
	readonly frequency: number;
	readonly octaves: number;
	readonly persistence: number;
	readonly lacunarity: number;
	readonly offsetX: number;
	readonly offsetY: number;
	readonly ridge: number;
}

/** Every stack `settingsFor` reads, one per field. */
interface LabStacks {
	readonly cont: LabStack;
	readonly ero: LabStack;
	readonly pv: LabStack;
	readonly formPv: LabStack;
	readonly temp: LabStack;
	readonly hum: LabStack;
	readonly warp: LabStack;
}

/** The knobs `settingsFor`, `climateAt`, `roomAt` and the regions read. */
interface LabKnobs {
	readonly radius: number;
	readonly formDetail: number;
	readonly tempEquator: number;
	readonly tempLapse: number;
	readonly tempNoise: number;
	readonly tempFeature: number;
	readonly tempOctaves: number;
	readonly humOcean: number;
	readonly humBelt: number;
	readonly humBeltAt: number;
	readonly humBeltWidth: number;
	readonly groundTop: number;
	readonly humNoise: number;
	readonly humFeature: number;
	readonly humOctaves: number;
	readonly warpFeature: number;
	readonly warpOctaves: number;
	readonly shoreHeight: number;
	readonly shoreReach: number;
	readonly regionLevel: number;
	readonly regionWarp: number;
	readonly regionClimate: number;
}

interface LabBiomeDef {
	readonly name: string;
	readonly hex: string;
	readonly t: number;
	readonly h: number;
	readonly landform: string;
}

interface LabRegion {
	readonly key: number;
	readonly t: number;
	readonly h: number;
}

type Vec = readonly [number, number, number];
type Pair = [number, number];

/** The lab's own biome model, lifted out of the page and made callable. */
interface LabModel {
	readonly TERRAIN: {
		readonly cont: { readonly spline: readonly (readonly [number, number])[] };
		readonly ero: { readonly spline: readonly (readonly [number, number])[] };
		readonly pv: { readonly spline: readonly (readonly [number, number])[] };
		readonly seaLevel: number;
	};
	readonly grid: readonly number[];
	readonly biomes: readonly LabBiomeDef[];
	readonly allowed: readonly (readonly number[])[];
	settingsFor(k: LabKnobs): LabStacks;
	fieldsAt(
		x: number,
		y: number,
		z: number,
		seed: number,
		s: LabStacks,
		out: [number, number, number],
	): void;
	heightFrom(said: Vec): number;
	splineAt(points: readonly (readonly [number, number])[], at: number): number;
	formSwingAt(x: number, y: number, z: number, seed: number, s: LabStacks): number;
	roomAt(
		x: number,
		y: number,
		z: number,
		seed: number,
		s: LabStacks,
		k: LabKnobs,
		metres: number,
	): number;
	climateAt(
		x: number,
		y: number,
		z: number,
		said: Vec,
		metres: number,
		seed: number,
		s: LabStacks,
		k: LabKnobs,
		out: Pair,
	): void;
	warpAt(x: number, y: number, z: number, seed: number, s: LabStacks, out: Pair): void;
	squareOf(
		climate: Pair,
		warp: Pair,
		out: Pair,
		fit?: ClimateFit,
		push?: number,
	): void;
	withRegion(square: Pair, region: LabRegion | null, k: LabKnobs, out: Pair): void;
	landformAt(
		level: number,
		cut: number,
		swing: number,
		rise: number,
		metres: number,
		room: number,
		shoreHeight?: number,
	): number;
	biomeOf(
		t: number,
		h: number,
		form: number,
		biomesTable?: readonly LabBiomeDef[],
		allowedSets?: readonly (readonly number[])[],
	): number;
	regionsFor(
		k: LabKnobs,
		seed: number,
		s: LabStacks,
	): { at(x: number, y: number, z: number): LabRegion };
	fitTo(
		rawT: ArrayLike<number>,
		rawH: ArrayLike<number>,
		land: ArrayLike<number>,
		fit?: boolean,
	): ClimateFit;
	bucket(v: number, edges: readonly number[]): number;
	gridAt(c: number, r: number, e: number, p: number): number;
}

/** One marked block of the page, as source -- the same helper the file opens with. */
function labBlock(page: string, begin: string, end: string): string {
	const from = page.indexOf(begin);
	const to = page.indexOf(end);
	expect(from, `the opening marker ${begin}`).toBeGreaterThan(-1);
	expect(to, `the closing marker ${end}`).toBeGreaterThan(from);
	return page.slice(from + begin.length, to);
}

/**
 * The lab's biome model, callable with a `world` and `knobs` this test
 * supplies rather than the page's own live state.
 */
function labModel(
	world: { fit: ClimateFit },
	knobs: { useWarp: boolean; warpStrength: number; shoreHeight: number },
): LabModel {
	const page = readFileSync(BIOMES, "utf8");
	const source =
		labBlock(page, "// ===== BEGIN engine noise kernel =====", "// ===== END engine noise kernel =====") +
		labBlock(page, "// ===== BEGIN engine coarse grid =====", "// ===== END engine coarse grid =====") +
		labBlock(page, "// ===== BEGIN engine coordinates =====", "// ===== END engine coordinates =====") +
		labBlock(page, MODEL_BEGIN, MODEL_END) +
		labBlock(page, FIT_BEGIN, FIT_END);
	const build = new Function(
		"world",
		"knobs",
		`${source}
		regroup();
		return {
			TERRAIN, grid, biomes, allowed,
			settingsFor, fieldsAt, heightFrom, splineAt, formSwingAt, roomAt,
			climateAt, warpAt, squareOf, withRegion, landformAt, biomeOf,
			regionsFor, fitTo, bucket, gridAt,
		};`,
	) as (
		world: { fit: ClimateFit },
		knobs: { useWarp: boolean; warpStrength: number; shoreHeight: number },
	) => LabModel;
	return build(world, knobs);
}

/** A point spread over the sphere, the way the multi-noise lab spreads its own. */
function direction(n: number): Vec {
	const golden = Math.PI * (3 - Math.sqrt(5));
	const z = 1 - (2 * n + 1) / 977;
	const ring = Math.sqrt(Math.max(0, 1 - z * z));
	return [Math.cos(n * golden) * ring, z, Math.sin(n * golden) * ring];
}

describe("the biomes lab's model against the engine's", () => {
	const RADIUS = 1700;
	const SEED = seedFromString("chamfer");

	// **Fit turned off on both sides, deliberately.** The lab measures its fit
	// over its own precomputed `WORLD` lattice and the engine measures its own
	// over a face/i/j lattice at a different level -- two different samplings
	// that were never meant to agree past the shape of the result. Turning the
	// fit off replaces both with the same fixed identity square, `UNFITTED`,
	// so the comparison below is exact rather than "close on a percentile
	// neither side computes the same way". `fitTo`'s own shape is checked
	// separately, against `UNFITTED` and against itself.
	const world = { fit: UNFITTED };
	const knobs = {
		useWarp: BIOME_DEFAULTS.warp,
		warpStrength: BIOME_DEFAULTS.warpStrength,
		shoreHeight: BIOME_DEFAULTS.shoreHeight,
	};
	const lab = labModel(world, knobs);

	// `MAX_REGION_LEVEL` in the engine's `BiomeField` is not exported -- it is
	// the one constant this test cannot read back and has to restate.
	const MAX_REGION_LEVEL = 12;
	const regionLevel = Math.max(
		0,
		Math.min(
			MAX_REGION_LEVEL,
			Math.round(
				Math.log2((CELL_CONSTANT * RADIUS) / BIOME_DEFAULTS.regionSpan),
			),
		),
	);
	const k: LabKnobs = {
		radius: RADIUS,
		formDetail: BIOME_DEFAULTS.formDetail,
		tempEquator: BIOME_DEFAULTS.tempEquator,
		tempLapse: BIOME_DEFAULTS.tempLapse,
		tempNoise: BIOME_DEFAULTS.tempNoise,
		tempFeature: BIOME_DEFAULTS.tempFeature,
		tempOctaves: BIOME_DEFAULTS.tempOctaves,
		humOcean: BIOME_DEFAULTS.humOcean,
		humBelt: BIOME_DEFAULTS.humBelt,
		humBeltAt: BIOME_DEFAULTS.humBeltAt,
		humBeltWidth: BIOME_DEFAULTS.humBeltWidth,
		groundTop: BIOME_DEFAULTS.groundTop,
		humNoise: BIOME_DEFAULTS.humNoise,
		humFeature: BIOME_DEFAULTS.humFeature,
		humOctaves: BIOME_DEFAULTS.humOctaves,
		warpFeature: BIOME_DEFAULTS.warpFeature,
		warpOctaves: BIOME_DEFAULTS.warpOctaves,
		shoreHeight: BIOME_DEFAULTS.shoreHeight,
		shoreReach: BIOME_DEFAULTS.shoreReach,
		regionLevel,
		regionWarp: BIOME_DEFAULTS.regionWarp,
		regionClimate: BIOME_DEFAULTS.regionClimate,
	};
	const s = lab.settingsFor(k);
	const region = lab.regionsFor(k, SEED, s);

	// **The engine's `heightAt` bypasses the coarse map entirely**, reading
	// the same raw octave noise and the same `heightFrom` the lab reads --
	// ground resolution, not the landform's own coarser reading. With `sea
	// level` at its shared default of zero, the engine's `heightFrom` (which
	// does not re-add the datum) and the lab's (which does) are the same
	// arithmetic, so `metres` is not "close", it is the same computation.
	const contNoise = layerNoiseSettings(CONTINENT_LAYER_DEFAULT, RADIUS);
	const eroNoise = layerNoiseSettings(EROSION_LAYER_DEFAULT, RADIUS);
	const peaksNoise = layerNoiseSettings(PEAKS_LAYER_DEFAULT, RADIUS);
	const engineWorld: BiomeWorld = {
		seed: SEED,
		radius: RADIUS,
		continent: CONTINENT_LAYER_DEFAULT,
		erosion: EROSION_LAYER_DEFAULT,
		peaks: PEAKS_LAYER_DEFAULT,
		heightAt: (x, y, z) => {
			const c = octaveNoise(x, y, z, SEED + CONTINENT_SEED_OFFSET, contNoise);
			const e = octaveNoise(x, y, z, SEED + EROSION_SEED_OFFSET, eroNoise);
			const p = octaveNoise(x, y, z, SEED + PEAKS_SEED_OFFSET, peaksNoise);
			return heightFrom(c, e, p, COARSE_MAP_DEFAULTS);
		},
	};
	const field = new BiomeField(engineWorld, DEFAULT_BIOMES, DEFAULT_LANDFORM_GRID, {
		...BIOME_DEFAULTS,
		climateFit: UNFITTED,
	});

	/** One point run through the lab's own pipeline, the way `sampleAt` runs it. */
	function labReadAt(x: number, y: number, z: number) {
		const said: [number, number, number] = [0, 0, 0];
		lab.fieldsAt(x, y, z, SEED, s, said);
		const metres = lab.heightFrom(said);
		const level = lab.splineAt(lab.TERRAIN.cont.spline, said[0]);
		const cut = lab.splineAt(lab.TERRAIN.ero.spline, said[1]);
		const swing = lab.formSwingAt(x, y, z, SEED, s);
		const room = lab.roomAt(x, y, z, SEED, s, k, metres);
		const climate: Pair = [0, 0];
		lab.climateAt(x, y, z, said, metres, SEED, s, k, climate);
		const warp: Pair = [0, 0];
		lab.warpAt(x, y, z, SEED, s, warp);
		const square: Pair = [0, 0];
		lab.squareOf(climate, warp, square);
		const at = region.at(x, y, z);
		const pulled: Pair = [0, 0];
		lab.withRegion(square, at, k, pulled);
		const landform = lab.landformAt(
			level,
			cut,
			swing,
			Math.min(1, Math.max(0, metres / k.groundTop)),
			metres,
			room,
			k.shoreHeight,
		);
		const biome =
			landform < 0
				? -1
				: lab.biomeOf(pulled[0], pulled[1], landform, lab.biomes, lab.allowed);
		return { metres, landform, biome };
	}

	it("computes the same height as the engine's heightFrom, off the same raw noise", () => {
		let checked = 0;
		for (let n = 0; n < 300; n++) {
			const [x, y, z] = direction(n);
			const { metres } = labReadAt(x, y, z);
			expect(metres).toBeCloseTo(engineWorld.heightAt(x, y, z), 9);
			checked++;
		}
		expect(checked).toBe(300);
	});

	it("names the same landform as the engine's BiomeField, over the same spread of points", () => {
		const scratch = makeBiomeSample();
		let land = 0;
		for (let n = 0; n < 300; n++) {
			const [x, y, z] = direction(n);
			const { landform } = labReadAt(x, y, z);
			field.readAt(x, y, z, scratch);
			expect(landform).toBe(scratch.landform);
			if (landform >= 0) land++;
		}
		// Some of the 300 points have to be dry, or the rest of this file is
		// only ever checking the `-1` case.
		expect(land).toBeGreaterThan(0);
	});

	it("names the same biome as the engine's BiomeField, over the same spread of points", () => {
		const scratch = makeBiomeSample();
		let biomed = 0;
		for (let n = 0; n < 300; n++) {
			const [x, y, z] = direction(n);
			const { landform, biome } = labReadAt(x, y, z);
			field.readAt(x, y, z, scratch);
			expect(biome).toBe(scratch.biome);
			if (landform >= 0) {
				expect(biome).toBeGreaterThanOrEqual(0);
				biomed++;
			}
		}
		expect(biomed).toBeGreaterThan(0);
	});

	it("cuts a reading into the same band as the engine's bucket, edge included", () => {
		// The edge itself, not just points that miss it: `bucket` disagreed
		// with the engine's here before this test existed, landing a value
		// sitting exactly on an edge one band higher than the engine did.
		const edges = [0.3, 0.68];
		for (const v of [0.29, 0.3, 0.30000001, 0.68, 0.7]) {
			expect(lab.bucket(v, edges)).toBe(bucket(v, edges));
		}
	});

	it("indexes the landform grid the same way as the engine's gridAt", () => {
		for (let c = 0; c < 2; c++)
			for (let r = 0; r < 3; r++)
				for (let e = 0; e < 3; e++)
					for (let p = 0; p < 3; p++)
						expect(lab.gridAt(c, r, e, p)).toBe(
							gridAt(c, r, e, p),
						);
	});

	it("chooses the same landform as the engine's standalone landformAt, at the grid's own edges", () => {
		// Every corner of the grid the lattice comparison above does not
		// reach on its own: three bands on each of four axes, plus the sea
		// and the shore.
		for (const metres of [-5, 0, 6, 12, 40]) {
			for (const rise of [0.05, 0.25, 0.9]) {
				for (const level of [0.2, 0.5, 0.8]) {
					for (const cut of [0.1, 0.5, 0.9]) {
						for (const swing of [0.1, 0.5, 0.9]) {
							for (const room of [0, 2]) {
								const here = lab.landformAt(
									level,
									cut,
									swing,
									rise,
									metres,
									room,
									BIOME_DEFAULTS.shoreHeight,
								);
								const there = landformAt(
									level,
									cut,
									swing,
									rise,
									metres,
									room,
									BIOME_DEFAULTS.shoreHeight,
									DEFAULT_LANDFORM_GRID,
								);
								expect(here).toBe(there);
							}
						}
					}
				}
			}
		}
	});

	it("chooses the same biome as the engine's standalone biomeOf, given the same climate and landform", () => {
		const allowed = allowedBiomes(DEFAULT_BIOMES);
		for (const [t, h] of [
			[0.1, 0.1],
			[0.5, 0.5],
			[0.9, 0.9],
			[0.2, 0.8],
			[0.8, 0.2],
		] as const)
			for (let form = 0; form < 6; form++)
				expect(lab.biomeOf(t, h, form, lab.biomes, lab.allowed)).toBe(
					biomeOf(t, h, allowed[form], DEFAULT_BIOMES),
				);
	});

	it("falls back to the same unfitted square as the engine's UNFITTED", () => {
		// Too little land, and fitting switched off outright: both read back
		// the identity square rather than a measurement.
		expect(lab.fitTo([], [], [], true)).toEqual(UNFITTED);
		expect(lab.fitTo([0.1, 0.2], [0.1, 0.2], [1, 1], true)).toEqual(UNFITTED);
		expect(lab.fitTo([0.1, 0.2], [0.1, 0.2], [1, 1], false)).toEqual(UNFITTED);
	});

	it("stretches the square onto the 2nd and 98th percentile of land alone", () => {
		const rawT = Array.from({ length: 200 }, (_, n) => n / 199);
		const rawH = Array.from({ length: 200 }, (_, n) => 1 - n / 199);
		const land = Array.from({ length: 200 }, (_, n) => (n < 100 ? 1 : 0));
		const fit = lab.fitTo(rawT, rawH, land, true);
		expect(fit.fitted).toBe(true);
		// Only the first hundred (the land) count, so the 2nd percentile is
		// measured over `[0, 0.4975...]` rather than the whole `[0, 1]` the
		// array holds -- the third of a hundred sorted points, not the third
		// of the whole two hundred.
		expect(fit.tLo).toBeCloseTo(2 / 199, 9);
		expect(fit.tSpan).toBeGreaterThan(0);
		expect(fit.tSpan).toBeLessThan(0.5);
	});
});
