import { describe, expect, it } from "vitest";
import {
	PLANT_SPECIES,
	PLANT_SPECIES_NAMES,
	emptySkeleton,
	growPlant,
	plantFrame,
} from "chamfer/generation";

const RADIUS = 1700;

/** One plant grown at a place on the sphere, in world metres. */
function skeletonOf(species: string, scale = 1, seed = 17) {
	const up = plantFrame(0.31, 0.6, 0.74);
	const length = Math.sqrt(0.31 ** 2 + 0.6 ** 2 + 0.74 ** 2);
	const unit = plantFrame(0.31 / length, 0.6 / length, 0.74 / length);
	const base: [number, number, number] = [
		unit.up[0] * RADIUS,
		unit.up[1] * RADIUS,
		unit.up[2] * RADIUS,
	];
	const out = emptySkeleton();
	growPlant(base, unit, PLANT_SPECIES[species]!, scale, seed, 1, out);
	return { out, base, unit, up };
}

describe("growPlant", () => {
	it("stands its first rod on the ground it was given", () => {
		const { out, base } = skeletonOf("Pine");
		expect(out.rods.length).toBeGreaterThan(0);
		for (let n = 0; n < 3; n++)
			expect(out.rods[n]).toBeCloseTo(base[n]!, 6);
	});

	it("reaches about as high as its own height", () => {
		const { out, base, unit } = skeletonOf("Pine");
		let tallest = 0;
		for (let at = 0; at < out.rods.length; at += 8) {
			const up =
				(out.rods[at + 3]! - base[0]) * unit.up[0] +
				(out.rods[at + 4]! - base[1]) * unit.up[1] +
				(out.rods[at + 5]! - base[2]) * unit.up[2];
			if (up > tallest) tallest = up;
		}
		const asked = PLANT_SPECIES.Pine!.height;
		expect(tallest).toBeGreaterThan(asked * 0.6);
		expect(tallest).toBeLessThan(asked * 1.4);
	});

	// **Every plant on the planet is a hash of its own address**, so the same
	// address gives the same plant however many times it is asked for -- which
	// is what lets two chunks grow one tree without speaking.
	it("gives the same plant for the same seed and moves for another", () => {
		const same = skeletonOf("Oak", 1, 5);
		const again = skeletonOf("Oak", 1, 5);
		const other = skeletonOf("Oak", 1, 6);
		expect(again.out.rods).toEqual(same.out.rods);
		expect(other.out.rods).not.toEqual(same.out.rods);
	});

	it("grows a bare trunk with branches off, and no cluster with it", () => {
		const bare = { ...PLANT_SPECIES.Oak!, branches: false };
		const out = emptySkeleton();
		growPlant([0, RADIUS, 0], plantFrame(0, 1, 0), bare, 1, 3, 1, out);
		expect(out.rods.length).toBeGreaterThan(0);
		expect(out.clusters.length).toBe(0);
	});

	it("grows no cluster for a species with no leaves", () => {
		const { out } = skeletonOf("Cactus");
		expect(out.rods.length).toBeGreaterThan(0);
		expect(out.clusters.length).toBe(0);
	});

	it("grows every species without a rod of no length", () => {
		for (const species of PLANT_SPECIES_NAMES) {
			const { out } = skeletonOf(species);
			expect(out.rods.length).toBeGreaterThan(0);
			for (let at = 0; at < out.rods.length; at += 8) {
				const run = Math.sqrt(
					(out.rods[at + 3]! - out.rods[at]!) ** 2 +
						(out.rods[at + 4]! - out.rods[at + 1]!) ** 2 +
						(out.rods[at + 5]! - out.rods[at + 2]!) ** 2,
				);
				expect(run).toBeGreaterThan(0);
				expect(out.rods[at + 6]!).toBeGreaterThan(0);
				expect(out.rods[at + 7]!).toBeGreaterThan(0);
			}
		}
	});
});

describe("plantFrame", () => {
	it("gives three perpendicular unit axes", () => {
		for (const dir of [
			[0.31, 0.6, 0.74],
			[0, 1, 0],
			[1, 0, 0],
			[-0.5, -0.5, 0.7071],
		]) {
			const length = Math.sqrt(
				dir[0]! ** 2 + dir[1]! ** 2 + dir[2]! ** 2,
			);
			const frame = plantFrame(
				dir[0]! / length,
				dir[1]! / length,
				dir[2]! / length,
			);
			const dot = (
				a: readonly [number, number, number],
				b: readonly [number, number, number],
			): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
			expect(dot(frame.east, frame.east)).toBeCloseTo(1, 9);
			expect(dot(frame.north, frame.north)).toBeCloseTo(1, 9);
			expect(dot(frame.east, frame.up)).toBeCloseTo(0, 9);
			expect(dot(frame.north, frame.up)).toBeCloseTo(0, 9);
			expect(dot(frame.east, frame.north)).toBeCloseTo(0, 9);
		}
	});
});
