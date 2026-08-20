import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	BASIS_PITCH,
	NOISE_BASES,
	basisNoise3,
	hash3,
	octaveNoise,
	seaLevelFor,
	seedFromString,
} from "chamfer/generation";
import type { NoiseBasis, NoiseSettings } from "chamfer/generation";

/**
 * The demo carries its own copy of the noise, and a copy that has drifted is
 * a lab that teaches the wrong lesson.
 *
 * `demos/noise-lab.html` is a single file with no imports and no build step,
 * which is what lets it be opened from a disk rather than served. The price is
 * that its octave stack is a hand port of the engine's. This reads that port
 * back out of the page and runs it against the real thing, so a change to
 * either one that is not made to the other fails here rather than being found
 * by tuning a world that does not exist.
 */
const HTML = fileURLToPath(
	new URL("../../../../demos/noise-lab.html", import.meta.url),
);

const BEGIN = "// ===== BEGIN engine noise kernel =====";
const END = "// ===== END engine noise kernel =====";

/** The demo's own functions, lifted out of the page and made callable. */
function demoKernel(): {
	hash3: typeof hash3;
	seedFromString: typeof seedFromString;
	basisNoise3: (
		x: number,
		y: number,
		z: number,
		seed: number,
		s: NoiseSettings,
	) => number;
	octaveNoise: (
		x: number,
		y: number,
		z: number,
		seed: number,
		s: NoiseSettings,
	) => number;
	seaLevelFor: (height: Float64Array, landFraction: number) => number;
	BASIS_PITCH: Record<string, number>;
} {
	const page = readFileSync(HTML, "utf8");
	const from = page.indexOf(BEGIN);
	const to = page.indexOf(END);
	expect(from, "the kernel's opening marker").toBeGreaterThan(-1);
	expect(to, "the kernel's closing marker").toBeGreaterThan(from);
	const source = page.slice(from + BEGIN.length, to);
	// The block is written to touch no document and no window, so it runs
	// here exactly as it runs in the page.
	const build = new Function(
		`${source}\nreturn { hash3, seedFromString, basisNoise3, octaveNoise, seaLevelFor, BASIS_PITCH };`,
	) as () => ReturnType<typeof demoKernel>;
	return build();
}

const demo = demoKernel();

/** A point spread over the sphere, the way the field is actually sampled. */
function direction(n: number): [number, number, number] {
	const golden = Math.PI * (3 - Math.sqrt(5));
	const z = 1 - (2 * n + 1) / 977;
	const ring = Math.sqrt(Math.max(0, 1 - z * z));
	return [Math.cos(n * golden) * ring, z, Math.sin(n * golden) * ring];
}

function settingsFor(basis: NoiseBasis): NoiseSettings {
	return {
		basis,
		frequency: 2.3,
		octaves: 5,
		persistence: 0.5,
		lacunarity: 3.4,
		offsetX: 15,
		offsetY: 9,
		ridge: 0.85,
		jitter: 0.55,
		feature: "f1",
		spinSin: Math.sin(0.7),
		spinCos: Math.cos(0.7),
	};
}

describe("the noise lab's copy of the engine's noise", () => {
	it("hashes the same integers to the same values", () => {
		for (let n = -50; n < 50; n++)
			expect(demo.hash3(n, n * 7, n * 13, 12345)).toBe(
				hash3(n, n * 7, n * 13, 12345),
			);
	});

	it("reduces a typed seed the same way", () => {
		for (const text of ["chamfer", "world1", "world2", "", "a longer seed"])
			expect(demo.seedFromString(text)).toBe(seedFromString(text));
	});

	it("brings every basis onto the same frequency", () => {
		expect(demo.BASIS_PITCH).toEqual(BASIS_PITCH);
	});

	it.each(NOISE_BASES)("draws %s exactly as the engine does", (basis) => {
		const settings = settingsFor(basis);
		const seed = seedFromString("chamfer");
		for (let n = 0; n < 400; n++) {
			const [x, y, z] = direction(n);
			expect(
				demo.basisNoise3(x * 9, y * 9, z * 9, seed, settings),
			).toBe(basisNoise3(x * 9, y * 9, z * 9, seed, settings));
		}
	});

	it.each(NOISE_BASES)("stacks %s's octaves exactly as the engine does", (basis) => {
		const settings = settingsFor(basis);
		const seed = seedFromString("chamfer");
		for (let n = 0; n < 400; n++) {
			const [x, y, z] = direction(n);
			expect(demo.octaveNoise(x, y, z, seed, settings)).toBe(
				octaveNoise(x, y, z, seed, settings),
			);
		}
	});

	it("puts sea level at the same percentile", () => {
		const settings = settingsFor("perlin");
		const seed = seedFromString("chamfer");
		const raw = new Float64Array(977);
		for (let n = 0; n < raw.length; n++) {
			const [x, y, z] = direction(n);
			raw[n] = octaveNoise(x, y, z, seed, settings);
		}
		for (const land of [0.1, 0.3, 0.65, 0.9])
			expect(demo.seaLevelFor(raw, land)).toBe(seaLevelFor(raw, land));
	});

	it("agrees on the world the engine actually ships", () => {
		// The shipped knobs, so a drift in any one of them is caught by the
		// case a person opening the lab meets first.
		const settings = settingsFor("perlin");
		const seed = seedFromString("chamfer");
		let digest = 0;
		let mine = 0;
		for (let n = 0; n < 977; n++) {
			const [x, y, z] = direction(n);
			digest = (digest * 31 + Math.round(octaveNoise(x, y, z, seed, settings) * 1e9)) | 0;
			mine = (mine * 31 + Math.round(demo.octaveNoise(x, y, z, seed, settings) * 1e9)) | 0;
		}
		expect(mine).toBe(digest);
	});
});
