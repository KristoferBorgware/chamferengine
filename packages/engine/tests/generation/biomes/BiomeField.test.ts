import { describe, expect, it } from "vitest";
import type { BiomeSample, BiomeWorld } from "chamfer/generation";
import {
	BiomeField,
	CONTINENT_LAYER_DEFAULT,
	CONTINENT_SEED_OFFSET,
	DEFAULT_BIOMES,
	EROSION_LAYER_DEFAULT,
	EROSION_SEED_OFFSET,
	PEAKS_LAYER_DEFAULT,
	PEAKS_SEED_OFFSET,
	heightFrom,
	layerNoiseSettings,
	makeBiomeSample,
	octaveNoise,
	seedFromString,
} from "chamfer/generation";
import { latticePosition } from "chamfer/addressing";

/** The worked planet's radius, near enough: a 32 m map cell at level 8. */
const RADIUS = 6800;

/**
 * A world whose heights come straight off the three default layers.
 *
 * The map a real world reads is these same layers sampled per map cell and
 * interpolated; evaluating them directly keeps the test free of a map build
 * and makes every height an exact function of the direction.
 */
function analyticWorld(seed: number): BiomeWorld {
	const cont = layerNoiseSettings(CONTINENT_LAYER_DEFAULT, RADIUS);
	const ero = layerNoiseSettings(EROSION_LAYER_DEFAULT, RADIUS);
	const pv = layerNoiseSettings(PEAKS_LAYER_DEFAULT, RADIUS);
	return {
		seed,
		radius: RADIUS,
		continent: CONTINENT_LAYER_DEFAULT,
		erosion: EROSION_LAYER_DEFAULT,
		peaks: PEAKS_LAYER_DEFAULT,
		heightAt: (x, y, z) =>
			heightFrom(
				octaveNoise(x, y, z, seed + CONTINENT_SEED_OFFSET, cont),
				octaveNoise(x, y, z, seed + EROSION_SEED_OFFSET, ero),
				octaveNoise(x, y, z, seed + PEAKS_SEED_OFFSET, pv),
			),
	};
}

/** Sample directions spread over the sphere, off the level-4 lattice. */
function directions(): [number, number, number][] {
	const out: [number, number, number][] = [];
	const n = 16;
	for (let face = 0; face < 20; face += 3)
		for (let i = 1; i < n; i += 5)
			for (let j = 1; i + j < n; j += 5) {
				const p = latticePosition(face, n, i, j);
				out.push([p.x, p.y, p.z]);
			}
	return out;
}

const seed = seedFromString("chamfer");

describe("BiomeField", () => {
	const world = analyticWorld(seed);
	const field = new BiomeField(world, DEFAULT_BIOMES);

	it("is deterministic: two fields from one seed agree everywhere", () => {
		// The second field starts with empty region and fit memos, so this is
		// also the statement that memoization changes no answer.
		const twin = new BiomeField(analyticWorld(seed), DEFAULT_BIOMES);
		const a = makeBiomeSample();
		const b = makeBiomeSample();
		for (const [x, y, z] of directions()) {
			field.readAt(x, y, z, a);
			twin.readAt(x, y, z, b);
			expect(b).toEqual(a);
		}
	});

	it("splits sampling from resolution without changing the answer", () => {
		const whole = makeBiomeSample();
		const halves = makeBiomeSample();
		for (const [x, y, z] of directions()) {
			field.readAt(x, y, z, whole);
			field.sampleAt(x, y, z, halves);
			field.resolve(halves);
			expect(halves).toEqual(whole);
		}
	});

	it("names no biome in the sea and a biome on every land cell", () => {
		const out = makeBiomeSample();
		let land = 0;
		let sea = 0;
		for (const [x, y, z] of directions()) {
			field.readAt(x, y, z, out);
			if (out.metres <= 0) {
				sea++;
				expect(out.landform).toBe(-1);
				expect(out.biome).toBe(-1);
			} else {
				land++;
				expect(out.landform).toBeGreaterThanOrEqual(0);
				expect(out.biome).toBeGreaterThanOrEqual(0);
			}
		}
		// The default layers make both, so the test saw both.
		expect(land).toBeGreaterThan(0);
		expect(sea).toBeGreaterThan(0);
	});

	it("measures a fit that tightens the square onto the land", () => {
		expect(field.fit.fitted).toBe(true);
		// The raw readings cluster well inside [-1, 1], so the measured spans
		// are far narrower than the arithmetic range.
		expect(field.fit.tSpan).toBeLessThan(2);
		expect(field.fit.hSpan).toBeLessThan(2);
		expect(field.fit.tSpan).toBeGreaterThan(0);
	});

	it("leaves the square unfitted when the fit is off", () => {
		const off = new BiomeField(world, DEFAULT_BIOMES, undefined, {
			fit: false,
		});
		expect(off.fit.fitted).toBe(false);
		expect(off.fit.tSpan).toBe(2);
	});

	it("reads one climate across a whole region at full pull", () => {
		const out = makeBiomeSample();
		const byRegion = new Map<number, [number, number]>();
		let shared = 0;
		for (const [x, y, z] of directions()) {
			field.readAt(x, y, z, out);
			const held = byRegion.get(out.region);
			if (held) {
				shared++;
				expect(out.t).toBeCloseTo(held[0], 12);
				expect(out.h).toBeCloseTo(held[1], 12);
			} else byRegion.set(out.region, [out.t, out.h]);
		}
		// Neighbouring samples land in the same region often enough to check.
		expect(shared).toBeGreaterThan(0);
	});

	it("marks no region and keeps per-place climate with regions off", () => {
		const solo = new BiomeField(world, DEFAULT_BIOMES, undefined, {
			regions: false,
		});
		const out = makeBiomeSample();
		const [x, y, z] = directions()[0]!;
		solo.readAt(x, y, z, out);
		expect(out.region).toBe(-1);
	});

	it("dries the humidity with elevation when humLapse is set, and leaves temperature alone", () => {
		// **Unfitted, as well as regionless.** The fit measures its own span
		// from the land the layers generate, and `humLapse` moves every
		// land sample it reads -- fitted, the two fields below would answer
		// through two different squares and even a sea reading would move,
		// for a reason that has nothing to do with this term.
		const base = new BiomeField(world, DEFAULT_BIOMES, undefined, {
			regions: false,
			fit: false,
			humLapse: 0,
		});
		const dried = new BiomeField(world, DEFAULT_BIOMES, undefined, {
			regions: false,
			fit: false,
			humLapse: 0.6,
		});
		const a = makeBiomeSample();
		const b = makeBiomeSample();
		let checked = 0;
		for (const [x, y, z] of directions()) {
			base.sampleAt(x, y, z, a);
			dried.sampleAt(x, y, z, b);
			expect(b.t).toBe(a.t);
			if (a.metres > 0) {
				expect(b.h).toBeLessThan(a.h);
				checked++;
			} else expect(b.h).toBe(a.h);
		}
		// The default layers put land at a spread of heights, so the test saw
		// at least one point the term actually moves.
		expect(checked).toBeGreaterThan(0);
	});

	// **The property the term is built around, and the one a reader would
	// not guess.** Every other humidity knob shifts the planet's own mean as
	// a side effect -- `humOcean` turned up dries the whole world rather than
	// wetting the shore, which is what made it read backwards from its label.
	// The belts give back exactly what they take, so the knob cannot be used
	// as a wetness slider by accident.
	it("moves moisture into the rest of the world rather than removing it", () => {
		const flat = new BiomeField(world, DEFAULT_BIOMES, undefined, {
			regions: false,
			fit: false,
			humBelt: 0,
		});
		const belted = new BiomeField(world, DEFAULT_BIOMES, undefined, {
			regions: false,
			fit: false,
			humBelt: 0.8,
		});
		const a = makeBiomeSample();
		const b = makeBiomeSample();
		let sumFlat = 0;
		let sumBelted = 0;
		let n = 0;
		let drier = 0;
		let wetter = 0;
		for (const [x, y, z] of directions()) {
			flat.sampleAt(x, y, z, a);
			belted.sampleAt(x, y, z, b);
			// Temperature is not a humidity term's business.
			expect(b.t).toBe(a.t);
			sumFlat += a.h;
			sumBelted += b.h;
			n++;
			if (b.h < a.h - 1e-9) drier++;
			if (b.h > a.h + 1e-9) wetter++;
		}
		// Both happen, or it is a wetness knob with extra steps.
		expect(drier).toBeGreaterThan(0);
		expect(wetter).toBeGreaterThan(0);
		// The lattice samples the sphere evenly enough that the give and the
		// take cancel to well inside what one belt takes at its own centre.
		expect(Math.abs(sumBelted - sumFlat) / n).toBeLessThan(0.05);
	});

	// Zero is the whole of the old world, not nearly it: a default that
	// changed every planet would be one nobody could turn back off.
	it("is bit-for-bit the world without it at zero", () => {
		const off = new BiomeField(world, DEFAULT_BIOMES, undefined, {
			regions: false,
			fit: false,
			humBelt: 0,
		});
		const also = new BiomeField(world, DEFAULT_BIOMES, undefined, {
			regions: false,
			fit: false,
			humBelt: 0,
			humBeltAt: 0.7,
			humBeltWidth: 0.5,
		});
		const a = makeBiomeSample();
		const b = makeBiomeSample();
		for (const [x, y, z] of directions()) {
			off.sampleAt(x, y, z, a);
			also.sampleAt(x, y, z, b);
			expect(b.h).toBe(a.h);
		}
	});

	it("hands back the biome's own block, and nothing for the sea", () => {
		const out = makeBiomeSample();
		for (const [x, y, z] of directions()) {
			const block = field.blockAt(x, y, z, out);
			if (out.biome < 0) expect(block).toBe(-1);
			else expect(block).toBe(DEFAULT_BIOMES[out.biome]!.block);
		}
	});

	it("rounds the region span to a lattice level", () => {
		// 1,600 m regions on a 6,800 m planet: 2^level of them around, at the
		// level whose cell width lands nearest the span.
		const width = (1.20459 * RADIUS) / 2 ** field.regionLevel;
		expect(width / 1600).toBeGreaterThan(0.7);
		expect(width / 1600).toBeLessThan(1.5);
	});
});
