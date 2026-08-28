import { describe, expect, it } from "vitest";
import { NoiseCorners, octaveNoise, valueNoise3 } from "chamfer/generation";

const SETTINGS = {
	frequency: 37,
	octaves: 4,
	persistence: 0.5,
	lacunarity: 2,
	offsetX: 0,
	offsetY: 0,
	ridge: 0,
};

describe("NoiseCorners", () => {
	// **A cache that changes an answer is a different world.** The field is
	// what the terrain is, so this has to hold to the bit and not to a
	// tolerance.
	it("gives the same reading as no cache at all", () => {
		const corners = new NoiseCorners(4);
		let wrong = "";
		for (let n = 0; n < 20000 && !wrong; n++) {
			// A walk along a line, which is what a column is, so the cache is
			// hit as it will be in use.
			const t = n * 0.0007;
			const x = 0.31 + t * 0.11;
			const y = -0.62 + t * 0.07;
			const z = 0.7 - t * 0.05;
			const bare = valueNoise3(x * 41, y * 41, z * 41, 12345);
			const held = valueNoise3(x * 41, y * 41, z * 41, 12345, corners, 0);
			if (bare !== held) wrong = `${bare} against ${held} at ${n}`;
		}
		expect(wrong).toBe("");
	});

	it("gives the same octave stack as no cache at all", () => {
		const corners = new NoiseCorners(SETTINGS.octaves);
		let wrong = "";
		for (let n = 0; n < 5000 && !wrong; n++) {
			const t = n * 0.0009;
			const x = 0.2 + t * 0.13;
			const y = 0.5 - t * 0.09;
			const z = -0.4 + t * 0.02;
			const bare = octaveNoise(x, y, z, 777, SETTINGS);
			const held = octaveNoise(x, y, z, 777, SETTINGS, corners);
			if (bare !== held) wrong = `${bare} against ${held} at ${n}`;
		}
		expect(wrong).toBe("");
	});

	// **A cache is a memo, so it has to survive being asked out of order.** The
	// terrain reads blocks down a column and a player reads one anywhere.
	it("holds up when the reads jump about", () => {
		const corners = new NoiseCorners(2);
		let wrong = "";
		let state = 99;
		for (let n = 0; n < 20000 && !wrong; n++) {
			state = (state * 1103515245 + 12345) & 0x7fffffff;
			const x = (state / 0x7fffffff) * 60 - 30;
			const y = ((state >> 7) % 1000) * 0.06 - 30;
			const z = ((state >> 13) % 1000) * 0.06 - 30;
			const bare = valueNoise3(x, y, z, 5);
			const held = valueNoise3(x, y, z, 5, corners, n & 1);
			if (bare !== held) wrong = `${bare} against ${held} at ${n}`;
		}
		expect(wrong).toBe("");
	});

	// Two seeds through one cache: every slot was hashed with the old one, so
	// a change of seed has to empty it rather than answer from it.
	it("does not answer one seed from another", () => {
		const corners = new NoiseCorners(1);
		let wrong = "";
		for (let n = 0; n < 2000 && !wrong; n++) {
			const x = n * 0.013;
			for (const seed of [1, 2, 1, 900001]) {
				const bare = valueNoise3(x, x * 0.5, x * 0.25, seed);
				const held = valueNoise3(
					x,
					x * 0.5,
					x * 0.25,
					seed,
					corners,
					0,
				);
				if (bare !== held)
					wrong = `seed ${seed}: ${bare} against ${held}`;
			}
		}
		expect(wrong).toBe("");
	});
});
