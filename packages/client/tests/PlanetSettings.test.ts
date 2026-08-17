import { describe, expect, it } from "vitest";
import { encodeCell, wordBits } from "chamfer/addressing";
import { PlanetSettings } from "../src/PlanetSettings.js";

describe("cell address", () => {
	it("moves with the radius and the block size, and nothing else", () => {
		const base = new PlanetSettings();
		const wider = new PlanetSettings({ chunkCells: 64 });
		const coarser = new PlanetSettings({ coarseSpacing: 8 });
		const flatter = new PlanetSettings({ heightScale: 900 });

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

	it("warns rather than refuses once the address passes what a number holds exactly", () => {
		// The shipped planet sits at depth 13, a 55-bit word. A number counts
		// exactly to 53 bits, so this is already past it and still builds,
		// because the round planet field is 0 and the rounding lands above the
		// bits that are ever set.
		const shipped = new PlanetSettings();
		expect(shipped.addressBits).toBeGreaterThan(53);
		expect(shipped.problems()).toEqual([]);
		expect(shipped.notes().join(" ")).toMatch(/number/);
	});

	it("is the finding: a second planet loses precision where a number rounds", () => {
		// This is not hypothetical. Encode the same cell on two different
		// planet numbers at the shipped depth and watch the low bits go missing
		// on the one whose word does not fit in 53 bits.
		const depth = new PlanetSettings().depth;
		expect(wordBits(depth)).toBeGreaterThan(53);

		const fields = { planet: 4095, face: 7, i: 100, j: 5, layer: 800 };
		const id = encodeCell(fields, depth);
		expect(Number.isSafeInteger(id)).toBe(false);
	});
});
