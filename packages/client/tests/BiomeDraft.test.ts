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
		draft.grid =
			draft.grid.slice(0, 3) + "4" + draft.grid.slice(4);
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
