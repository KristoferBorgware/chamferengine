import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

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
		expect(lab).toContain("function biomeOf(t, h, form) {");
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
		expect(lab).toContain("function landformAt(level, cut, swing, metres) {");
		expect(lab).toContain("const set = allowed[form];");
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

	it("keeps the shore a height rather than a cell of the grid", () => {
		// Sea level is a radius and every height is measured from it, so *the
		// ground has barely come out of the water* is one comparison -- and it
		// cannot be true on a mountain however close to the coast it stands.
		expect(lab).toContain("if (metres <= knobs.shoreHeight) return SHORE;");
	});

	it("fits the diagram to the land the planet actually has", () => {
		// An octave stack normalised to its own peak has a standard deviation
		// of about a quarter of it, so raw readings cluster in the middle of
		// the square and the corners name climates no ground is in.
		expect(lab).toContain("function fitTo(rawT, rawH, land) {");
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
