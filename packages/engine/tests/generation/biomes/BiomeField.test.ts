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
