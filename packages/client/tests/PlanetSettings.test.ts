import { describe, expect, it } from "vitest";
import { decodeCell, encodeCell } from "chamfer/addressing";
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

describe("the coarse map off", () => {
	it("makes maxElevation and groundSpan exact bounds of the detail term", () => {
		const on = new PlanetSettings({ coarseMap: true, detailAmplitude: 12 });
		const off = new PlanetSettings({
			coarseMap: false,
			detailAmplitude: 12,
		});

		// On, the estimate is a ratio of the height scale and has nothing to do
		// with the detail term.
		expect(on.maxElevation).not.toBe(12);

		// Off, elevation is the detail term alone, so the true bound is exact.
		expect(off.maxElevation).toBe(12);
		expect(off.groundSpan).toBe(24);
	});

	it("skips the coarse-resolution problems, since nothing reads that knob", () => {
		// This combination would refuse for being too fine a coarse cell if
		// the coarse map were on.
		const off = new PlanetSettings({
			coarseMap: false,
			coarseSpacing: 1,
			blockSize: 4,
		});
		expect(off.problems()).toEqual([]);
	});

	it("still catches a crust too shallow for the detail term", () => {
		const off = new PlanetSettings({
			coarseMap: false,
			detailAmplitude: 40,
			crustMetres: 32,
		});
		expect(off.problems().join(" ")).toMatch(/sea floor/);
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
