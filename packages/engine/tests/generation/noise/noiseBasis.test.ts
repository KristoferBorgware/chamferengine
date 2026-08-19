import { describe, expect, it } from "vitest";
import type { NoiseSettings } from "chamfer/generation";
import {
	NOISE_BASES,
	basisNoise3,
	cellularNoise3,
	octaveNoise,
	psrdNoise3,
} from "chamfer/generation";

const SEED = 4242;

/** A walk that lands on no lattice point and repeats no plane. */
const at = (i: number): [number, number, number] => [
	i * 0.0173 - 40,
	(i % 9973) * 0.0411 - 30,
	((i * 7) % 8971) * 0.0271 - 20,
];

const settingsFor = (over: Partial<NoiseSettings> = {}): NoiseSettings => ({
	basis: "value",
	frequency: 1.5,
	octaves: 4,
	persistence: 0.5,
	lacunarity: 2,
	offsetX: 0,
	offsetY: 0,
	ridge: 0,
	jitter: 1,
	feature: "f1",
	spinSin: 0,
	spinCos: 1,
	...over,
});

describe("every noise basis", () => {
	for (const basis of NOISE_BASES) {
		const settings = settingsFor({ basis });

		it(`${basis} stays inside its stated range`, () => {
			// The metre scale divides by the field's own peak, so a basis that
			// overshot would still put its summit at the asked-for relief. The
			// place it shows is the ridge fold, which reads `1 - |n|`.
			let lo = Infinity;
			let hi = -Infinity;
			for (let i = 0; i < 40_000; i++) {
				const v = basisNoise3(...at(i), SEED, settings);
				if (v < lo) lo = v;
				if (v > hi) hi = v;
			}
			expect(lo).toBeGreaterThanOrEqual(-1.05);
			expect(hi).toBeLessThanOrEqual(1.05);
			// And it uses the range rather than sitting in the middle of it.
			expect(hi - lo).toBeGreaterThan(1.2);
		});

		it(`${basis} gives one answer for one point`, () => {
			for (let i = 0; i < 200; i++)
				expect(basisNoise3(...at(i), SEED, settings)).toBe(
					basisNoise3(...at(i), SEED, settings),
				);
		});

		it(`${basis} gives different ground for a different seed`, () => {
			let moved = 0;
			for (let i = 0; i < 2_000; i++)
				if (
					basisNoise3(...at(i), SEED, settings) !==
					basisNoise3(...at(i), SEED + 1, settings)
				)
					moved++;
			expect(moved).toBeGreaterThan(1_900);
		});
	}

	it("takes a step no larger than the step in the sample point", () => {
		// Every basis but cellular is smooth, so a thousandth of a lattice
		// cell apart the field cannot have moved far. Cellular has a crease
		// along every plate boundary and is excluded on purpose.
		for (const basis of NOISE_BASES) {
			if (basis === "cellular") continue;
			const settings = settingsFor({ basis });
			let worst = 0;
			for (let i = 0; i < 20_000; i++) {
				const [x, y, z] = at(i);
				const a = basisNoise3(x, y, z, SEED, settings);
				const b = basisNoise3(x + 0.001, y, z, SEED, settings);
				worst = Math.max(worst, Math.abs(b - a));
			}
			expect(worst, basis).toBeLessThan(0.05);
		}
	});
});

describe("the bases that carry their own knob", () => {
	it("turns every psrd gradient together when the spin moves", () => {
		let moved = 0;
		for (let i = 0; i < 2_000; i++) {
			const [x, y, z] = at(i);
			if (
				psrdNoise3(x, y, z, SEED, 0, 1) !==
				psrdNoise3(x, y, z, SEED, 0.6, 0.8)
			)
				moved++;
		}
		expect(moved).toBeGreaterThan(1_900);
	});

	it("puts every cellular feature point at a cell centre at jitter zero", () => {
		// With no jitter the field is a lattice of identical bumps, so the same
		// offset inside any cell reads the same height.
		const here = cellularNoise3(10.25, 20.25, 30.25, SEED, 0, "f1");
		for (const step of [1, 2, 5])
			expect(
				cellularNoise3(
					10.25 + step,
					20.25 + step,
					30.25 + step,
					SEED,
					0,
					"f1",
				),
			).toBeCloseTo(here, 12);
	});

	it("draws the seams as a different field from the nearest distance", () => {
		let moved = 0;
		for (let i = 0; i < 2_000; i++)
			if (
				cellularNoise3(...at(i), SEED, 1, "f1") !==
				cellularNoise3(...at(i), SEED, 1, "f2f1")
			)
				moved++;
		expect(moved).toBeGreaterThan(1_900);
	});
});

describe("the octave stack over a basis", () => {
	it("is bit-for-bit the plain sum at a ridge of zero", () => {
		const plain = settingsFor({ basis: "simplex", ridge: 0 });
		const folded = settingsFor({ basis: "simplex", ridge: 0.6 });
		let moved = 0;
		for (let i = 0; i < 500; i++) {
			const [x, y, z] = at(i);
			expect(octaveNoise(x, y, z, SEED, plain)).toBe(
				octaveNoise(x, y, z, SEED, plain),
			);
			if (
				octaveNoise(x, y, z, SEED, plain) !==
				octaveNoise(x, y, z, SEED, folded)
			)
				moved++;
		}
		expect(moved).toBeGreaterThan(450);
	});
});
