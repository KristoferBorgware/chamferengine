import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The vegetation lab carries the same two copies of the engine the multi-noise
 * lab does, and this checks they are the same copies.
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
 * be opened from a disk rather than served, so the copies are the price.
 */
const MULTI = fileURLToPath(
	new URL("../../../../demos/multi-noise-lab.html", import.meta.url),
);
const VEGETATION = fileURLToPath(
	new URL("../../../../demos/vegetation-lab.html", import.meta.url),
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

describe("the vegetation lab's copy of the engine", () => {
	const multi = readFileSync(MULTI, "utf8");
	const vegetation = readFileSync(VEGETATION, "utf8");

	for (const [name, begin, end] of BLOCKS)
		it(`holds the same ${name} as the multi-noise lab`, () => {
			expect(block(vegetation, begin, end)).toBe(block(multi, begin, end));
		});

	it("hands the renderer a right-handed frame, so the patch is not a mirror", () => {
		// **East, up and north in that order is left-handed** -- measured,
		// `cross(east, up) . north` is exactly -1 -- and a left-handed basis
		// given to a right-handed renderer draws the mirror image. From
		// overhead the frame's east then lands on the right of the screen where
		// the map puts it and its north lands at the bottom, so the view is the
		// map flipped top to bottom. The third axis is south instead.
		expect(vegetation).toContain("[2] = -(");
		expect(vegetation).not.toMatch(
			/\[2\] =\s*\n?\s*rx \* frame\.north\[0\]/,
		);
	});

	it("grows its plants from a hashed cell rather than a stored model", () => {
		// The whole claim of the page: nothing is authored and nothing is
		// placed, so a stand comes back from the seed alone. A table of
		// authored geometry would show up as coordinates.
		expect(vegetation).toContain("function growPlant(");
		expect(vegetation).toContain("hash3(c, level * 31 + j, tag, seed)");
	});

	it("grows a plant in world coordinates rather than in the patch's frame", () => {
		// **This is what lets a chunk grow a plant alone.** A frame anchored at
		// the patch centre is a frame no chunk has, so two chunks holding one
		// tree would each grow it about their own middle. Every point a plant
		// records is in the planet's own space, and the layer it lands in is
		// counted from the column's own ground.
		expect(vegetation).toContain("function growPlant(base, stance, spec,");
		expect(vegetation).toContain("const metresOf = (px, py, pz) =>");
		expect(vegetation).toContain("const datum = 0;");
	});

	it("finds the cell a branch reaches through the engine's own lookup", () => {
		// **Never a nearest-centre search and never a walk along the neighbour
		// ring.** A cell is what `hexRound` says it is, and a heading carried
		// along a path here does not close.
		expect(vegetation).toContain("directionToCell(px / len, py / len, pz / len, n)");
	});
});
