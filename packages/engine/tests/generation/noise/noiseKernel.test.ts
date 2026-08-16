import { describe, expect, it } from "vitest";
import {
	fade,
	fbm,
	hash3,
	seedFromString,
	valueNoise3,
} from "chamfer/generation";

/**
 * The engine has to agree with `verification/noise.js` exactly, not closely.
 * Every expected value below is that script's own output, taken to seventeen
 * digits, and compared with `toBe` rather than `toBeCloseTo`: two clients
 * generating one planet compare these results, and a last-bit disagreement is
 * one seeing a hill where the other sees a valley.
 *
 * The script's kernel carries no seed, so seed 0 is what these pin. A seed of 0
 * contributes nothing to the mix, which makes the unseeded function the seeded
 * one at its origin.
 */
describe("hash3, against the pinned kernel", () => {
	it("reproduces the reference values at seed 0", () => {
		expect(hash3(0, 0, 0, 0)).toBe(0);
		expect(hash3(1, 0, 0, 0)).toBe(0.5081244609318674);
		expect(hash3(0, 1, 0, 0)).toBe(0.7682745542842895);
		expect(hash3(0, 0, 1, 0)).toBe(0.22772923135198653);
		expect(hash3(-1, -1, -1, 0)).toBe(0.23184782941825688);
		expect(hash3(123, 456, 789, 0)).toBe(0.038015310652554035);
	});

	it("holds at the ends of the 32-bit range", () => {
		expect(hash3(2147483647, -2147483648, 7, 0)).toBe(
			1.72710122307762504e-1,
		);
	});

	it("stays in [0, 1)", () => {
		for (let x = -40; x < 40; x++)
			for (let y = -40; y < 40; y += 7) {
				const h = hash3(x, y, x ^ y, 12345);
				expect(h).toBeGreaterThanOrEqual(0);
				expect(h).toBeLessThan(1);
			}
	});

	it("moves everywhere when the seed moves", () => {
		let same = 0;
		for (let x = 0; x < 200; x++)
			if (hash3(x, 1, 2, 0) === hash3(x, 1, 2, 1)) same++;
		expect(same).toBe(0);
	});
});

describe("fade", () => {
	it("pins both ends", () => {
		expect(fade(0)).toBe(0);
		expect(fade(1)).toBe(1);
		expect(fade(0.5)).toBe(0.5);
	});

	it("leaves both ends cubically, so the first two derivatives vanish there", () => {
		// The quintic is 10t^3 - 15t^4 + 6t^5, so dividing by t^3 leaves
		// 10 - 15t + 6t^2, which tends to 10 as t shrinks: near either end the
		// curve is 10t^3, and both the slope and the curvature go to zero there.
		// Smoothstep is 3t^2 - 2t^3, whose leading term is quadratic: its slope
		// vanishes and its curvature does not, and that jump is what shading
		// draws as a grid.
		const t = 1e-6;
		expect(fade(t) / t ** 3).toBeCloseTo(10, 4);

		const smoothstep = (x: number) => x * x * (3 - 2 * x);
		expect(smoothstep(t) / t ** 2).toBeCloseTo(3, 4);

		// The curve is symmetric about (0.5, 0.5), which carries the same
		// approach to the other end. Reading it off there directly does not
		// work: at t this small the value sits closer to 1 than float64 can
		// resolve, so the subtraction returns rounding noise.
		for (const u of [1e-3, 0.1, 0.25, 0.4])
			expect(fade(1 - u)).toBeCloseTo(1 - fade(u), 14);
	});
});

describe("valueNoise3", () => {
	it("stays inside [-1, 1]", () => {
		for (let t = 0; t < 3000; t++) {
			const v = valueNoise3(t * 0.37, t * -0.21, t * 0.13, 99);
			expect(v).toBeGreaterThanOrEqual(-1);
			expect(v).toBeLessThanOrEqual(1);
		}
	});
});

describe("fbm, against the pinned kernel", () => {
	it("reproduces the reference values at seed 0", () => {
		expect(fbm(0, 0, 0, 1, 5, 0)).toBe(-1);
		expect(fbm(0.5, 0.5, 0.5, 1, 5, 0)).toBe(-0.22968574021492275);
		expect(fbm(12.25, -3.5, 7.125, 1, 5, 0)).toBe(-0.16960584633340517);
		expect(fbm(40, 40, 40, 1, 5, 0)).toBe(-0.5351773611750574);
	});

	it("reproduces the statistics over 200,000 directions", () => {
		// The same sampler the script uses, so the directions are the same ones.
		let s = 987654321;
		const rnd = () => {
			s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
			return s / 0x7fffffff;
		};
		let lo = 2;
		let hi = -2;
		let sum = 0;
		let sum2 = 0;
		const n = 200000;
		for (let t = 0; t < n; t++) {
			const z = 2 * rnd() - 1;
			const ph = 2 * Math.PI * rnd();
			const r = Math.sqrt(1 - z * z);
			const px = r * Math.cos(ph);
			const py = r * Math.sin(ph);
			// Math.hypot, matching the reference harness. The engine's own normalize
			// uses sqrt, and swapping it in here moves the sampled directions by one
			// ULP, which moves the extremes -- the test would then be comparing the
			// kernel against itself on different inputs.
			const l = Math.hypot(px, py, z);
			const v = fbm((px / l) * 40, (py / l) * 40, (z / l) * 40, 1, 5, 0);
			lo = Math.min(lo, v);
			hi = Math.max(hi, v);
			sum += v;
			sum2 += v * v;
		}
		expect(lo).toBe(-0.8952804809250247);
		expect(hi).toBe(0.870004895750474);
		expect(sum / n).toBe(-0.0013267661943163814);
		expect(Math.sqrt(sum2 / n - (sum / n) ** 2)).toBe(0.2436241214504075);
	});

	it("stays inside [-1, 1] whatever the octave count", () => {
		for (const octaves of [1, 2, 4, 5, 6, 8]) {
			for (let t = 0; t < 500; t++) {
				const v = fbm(t * 0.31, t * 0.17, t * -0.23, 1.5, octaves, 7);
				expect(v).toBeGreaterThanOrEqual(-1);
				expect(v).toBeLessThanOrEqual(1);
			}
		}
	});
});

describe("seedFromString", () => {
	it("gives the same number for the same text", () => {
		expect(seedFromString("chamfer")).toBe(seedFromString("chamfer"));
	});

	it("returns a uint32", () => {
		for (const s of [
			"",
			"a",
			"chamfer",
			"1337",
			"a much longer seed phrase",
		]) {
			const v = seedFromString(s);
			expect(Number.isInteger(v)).toBe(true);
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThan(2 ** 32);
		}
	});

	it("sends neighbouring text to unrelated numbers", () => {
		// "world1" and "world2" must not start on near-identical planets.
		const a = seedFromString("world1");
		const b = seedFromString("world2");
		const differing = ((a ^ b) >>> 0).toString(2).split("1").length - 1;
		expect(differing).toBeGreaterThan(8);
	});

	it("keeps distinct seeds distinct across a large set", () => {
		const seen = new Set<number>();
		for (let i = 0; i < 5000; i++) seen.add(seedFromString(`seed-${i}`));
		expect(seen.size).toBe(5000);
	});
});
