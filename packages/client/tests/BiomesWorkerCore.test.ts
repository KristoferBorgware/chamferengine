import { describe, expect, it } from "vitest";
import type { BiomesReady } from "../src/BiomesMessage.js";
import { biomeTableOf, biomeTableToText } from "../src/BiomeDraft.js";
import { BiomesWorkerCore } from "../src/BiomesWorkerCore.js";
import { PLANET_DEFAULTS, copyKnobs } from "../src/PlanetSettings.js";
import { BIOME_PRESETS, DEFAULT_PRESET, LANDFORMS } from "chamfer/generation";

/** A small world, so a whole build runs in a test. */
function knobs(): ReturnType<typeof copyKnobs> {
	const out = copyKnobs(PLANET_DEFAULTS);
	out.coarseSpacing = 220;
	return out;
}

/** Drive one build to its ready reply. */
function build(
	core: BiomesWorkerCore,
	token: number,
	edit: (k: ReturnType<typeof knobs>) => void = () => {},
): BiomesReady {
	const k = knobs();
	edit(k);
	let ready: BiomesReady | null = null;
	for (const step of core.steps({
		kind: "build",
		token,
		knobs: k,
		cells: 12,
	}))
		if (step.kind === "ready") ready = step;
	expect(ready).not.toBeNull();
	return ready!;
}

describe("BiomesWorkerCore", () => {
	it("builds a patch whose land columns carry biome ground blocks", () => {
		const core = new BiomesWorkerCore();
		const ready = build(core, 1);
		const facts = ready.facts;
		expect(facts.cellsDrawn).toBeGreaterThan(0);
		// Every biome share is a share of the land, so they sum to one where
		// there is land at all.
		const total = facts.planetShares.reduce((a, b) => a + b, 0);
		expect(total).toBeGreaterThan(0.99);
		expect(total).toBeLessThan(1.01);
		expect(facts.planetShares.length).toBe(
			BIOME_PRESETS[DEFAULT_PRESET]!.length,
		);
		expect(facts.formPlanet.length).toBe(LANDFORMS.length);
		expect(facts.built).toBeGreaterThan(0);
		expect(facts.fit.fitted).toBe(true);
	});

	it("sends a patch cloud sized to the patch, with land marked by landform", () => {
		const core = new BiomesWorkerCore();
		const ready = build(core, 1);
		const patch = ready.patch;
		expect(patch.t.length).toBe(ready.facts.cellsDrawn);
		expect(patch.h.length).toBe(ready.facts.cellsDrawn);
		expect(patch.landform.length).toBe(ready.facts.cellsDrawn);
		let land = 0;
		let sea = 0;
		for (let n = 0; n < patch.landform.length; n++) {
			if (patch.landform[n]! < 0) {
				sea++;
				continue;
			}
			land++;
			expect(patch.landform[n]!).toBeLessThan(LANDFORMS.length);
			// A resolved climate stays inside the fitted square.
			expect(patch.t[n]!).toBeGreaterThanOrEqual(0);
			expect(patch.t[n]!).toBeLessThanOrEqual(1);
			expect(patch.h[n]!).toBeGreaterThanOrEqual(0);
			expect(patch.h[n]!).toBeLessThanOrEqual(1);
		}
		// The default patch sits on a coastline, so both are on it.
		expect(land).toBeGreaterThan(0);
		expect(sea).toBeGreaterThan(0);
	});

	it("reads the whole planet into the sheet, sea and land alike", () => {
		const core = new BiomesWorkerCore();
		const ready = build(core, 1);
		const sheet = ready.planet;
		expect(sheet).not.toBeNull();
		let land = 0;
		let sea = 0;
		for (let n = 0; n < sheet!.landform.length; n++) {
			if (sheet!.landform[n]! < 0) {
				sea++;
				expect(sheet!.block[n]).toBe(0);
			} else {
				land++;
				expect(sheet!.block[n]).toBeGreaterThan(0);
			}
		}
		expect(land).toBeGreaterThan(0);
		expect(sea).toBeGreaterThan(0);
	});

	it("re-resolves a table edit without resampling a field", () => {
		const core = new BiomesWorkerCore();
		const first = build(core, 1);
		const started = performance.now();
		// **A table edit rather than another preset**, because there is one
		// preset: a dot moved is the same question -- name the held samples
		// again without resampling anything.
		const moved = biomeTableOf(DEFAULT_PRESET);
		moved.biomes[0]!.t = 0.42;
		const second = build(core, 2, (k) => {
			k.biomes = biomeTableToText(moved);
		});
		const again = performance.now() - started;
		// The whole second build is naming over held samples: no map, no
		// noise, no climate. It comes back an order of magnitude faster than
		// the first, which had to build all three.
		expect(again).toBeLessThan(first.facts.ms / 2);
		expect(second.facts.planetShares.length).toBe(moved.biomes.length);
	});
});
