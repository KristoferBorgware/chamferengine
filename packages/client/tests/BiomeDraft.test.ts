import { describe, expect, it } from "vitest";
import {
	biomeTableFromText,
	biomeTableOf,
	biomeTableToText,
} from "../src/BiomeDraft.js";
import { BIOME_PRESETS, DEFAULT_LANDFORM_GRID } from "chamfer/generation";

describe("the biome table in a query string", () => {
	it("writes an untouched preset as its name alone", () => {
		expect(biomeTableToText(biomeTableOf("plain"))).toBe("plain");
		expect(biomeTableToText(biomeTableOf("holdridge"))).toBe("holdridge");
	});

	it("round-trips an edited table dot for dot", () => {
		const draft = biomeTableOf("plain");
		draft.biomes[0]!.t = 0.123;
		draft.biomes[2]!.name = "Warm sand";
		draft.grid = draft.grid.slice(0, 3) + "4" + draft.grid.slice(4);
		const back = biomeTableFromText(biomeTableToText(draft));
		expect(back.grid).toBe(draft.grid);
		expect(back.biomes.length).toBe(draft.biomes.length);
		expect(back.biomes[0]!.t).toBeCloseTo(0.123, 3);
		expect(back.biomes[2]!.name).toBe("Warm sand");
		expect(back.biomes[5]!.block).toBe(draft.biomes[5]!.block);
	});

	it("keeps every preset block through a round trip", () => {
		const draft = biomeTableOf("plain");
		draft.biomes[0]!.h = 0.5;
		const back = biomeTableFromText(biomeTableToText(draft));
		for (let n = 0; n < back.biomes.length; n++)
			expect(back.biomes[n]!.block).toBe(
				BIOME_PRESETS["plain"]![n]!.block,
			);
	});

	// **An underlay is easy to lose the same way the plain block never did**:
	// it is absent on most rows, so a row format that forgot the field would
	// still round-trip every other one and hide the loss.
	it("keeps every preset's underlay through a round trip, present or absent", () => {
		const draft = biomeTableOf("plain");
		draft.biomes[0]!.h = 0.5;
		const back = biomeTableFromText(biomeTableToText(draft));
		let checked = 0;
		for (let n = 0; n < back.biomes.length; n++) {
			expect(back.biomes[n]!.underlay).toBe(
				BIOME_PRESETS["plain"]![n]!.underlay,
			);
			if (BIOME_PRESETS["plain"]![n]!.underlay !== undefined) checked++;
		}
		// Desert and Badlands are the two the preset actually sets one on --
		// if neither ran, the assertions above never exercised the field at all.
		expect(checked).toBeGreaterThan(0);
	});

	it("carries a hand-set underlay through a round trip", () => {
		const draft = biomeTableOf("plain");
		draft.biomes[0]!.underlay = draft.biomes[0]!.block;
		const back = biomeTableFromText(biomeTableToText(draft));
		expect(back.biomes[0]!.underlay).toBe(draft.biomes[0]!.block);
	});

	it("falls back to the plain preset when a link says nonsense", () => {
		const back = biomeTableFromText("no-such-preset|???;bad~row");
		expect(back.biomes.length).toBe(BIOME_PRESETS["plain"]!.length);
		expect(back.grid).toBe(DEFAULT_LANDFORM_GRID);
	});

	it("refuses a grid digit that names no landform", () => {
		const draft = biomeTableOf("plain");
		const bad = "9".repeat(DEFAULT_LANDFORM_GRID.length);
		const back = biomeTableFromText(
			biomeTableToText(draft).replace(draft.grid, bad),
		);
		expect(back.grid).toBe(DEFAULT_LANDFORM_GRID);
	});
});
