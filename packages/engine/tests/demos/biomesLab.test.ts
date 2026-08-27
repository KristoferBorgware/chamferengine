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
		expect(lab).toContain("function biomeOf(t, h) {");
		expect(lab).toContain("const d = dt * dt + dh * dh;");
	});

	it("fits the diagram to the land the planet actually has", () => {
		// An octave stack normalised to its own peak has a standard deviation
		// of about a quarter of it, so raw readings cluster in the middle of
		// the square and the corners name climates no ground is in.
		expect(lab).toContain("function fitTo(rawT, rawH, land) {");
		expect(lab).toContain("const FIT_TAIL = 0.02;");
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
