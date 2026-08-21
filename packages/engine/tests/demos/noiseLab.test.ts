import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	fbm,
	hash3,
	octaveNoise,
	seaLevelFor,
	seedFromString,
	valueNoise3,
} from "chamfer/generation";
import type { NoiseSettings } from "chamfer/generation";

/**
 * The demo carries its own copy of the noise, and a copy that has drifted is
 * a lab that teaches the wrong lesson.
 *
 * `demos/noise-lab.html` is a single file with no imports and no build step,
 * which is what lets it be opened from a disk rather than served. The price is
 * that its noise is a hand port of the engine's. This reads that port back out
 * of the page and runs it against the real thing, so a change to either one
 * that is not made to the other fails here rather than being found by tuning a
 * world that does not exist.
 *
 * **The lab carries value noise and nothing else.** The other four bases are
 * the engine's and are not ported, so there is nothing here to check about
 * them -- what is checked is everything the lab actually holds.
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
	valueNoise3: typeof valueNoise3;
	fbm: typeof fbm;
	octaveNoise: (
		x: number,
		y: number,
		z: number,
		seed: number,
		s: NoiseSettings,
	) => number;
	seaLevelFor: typeof seaLevelFor;
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
		`${source}\nreturn { hash3, seedFromString, valueNoise3, fbm, octaveNoise, seaLevelFor };`,
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

/** The panel's own settings, with the value basis the lab is limited to. */
function settings(over: Partial<NoiseSettings> = {}): NoiseSettings {
	return {
		basis: "value",
		frequency: 4,
		octaves: 5,
		persistence: 0.5,
		lacunarity: 2,
		offsetX: 15,
		offsetY: 9,
		ridge: 0.85,
		jitter: 0,
		feature: "f1",
		spinSin: 0,
		spinCos: 1,
		...over,
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

	it("draws value noise exactly as the engine does", () => {
		const seed = seedFromString("chamfer");
		for (let n = 0; n < 400; n++) {
			const [x, y, z] = direction(n);
			expect(demo.valueNoise3(x * 9, y * 9, z * 9, seed)).toBe(
				valueNoise3(x * 9, y * 9, z * 9, seed),
			);
		}
	});

	it.each([1, 3, 5, 8])("stacks %i octaves of fBm exactly", (octaves) => {
		const seed = seedFromString("chamfer");
		for (let n = 0; n < 300; n++) {
			const [x, y, z] = direction(n);
			expect(demo.fbm(x, y, z, 4, octaves, seed)).toBe(
				fbm(x, y, z, 4, octaves, seed),
			);
		}
	});

	it.each([0, 0.4, 0.85])("stacks octaves at ridge %d exactly", (ridge) => {
		const seed = seedFromString("chamfer");
		const s = settings({ ridge });
		for (let n = 0; n < 300; n++) {
			const [x, y, z] = direction(n);
			expect(demo.octaveNoise(x, y, z, seed, s)).toBe(
				octaveNoise(x, y, z, seed, s),
			);
		}
	});

	it("puts sea level at the same percentile", () => {
		const seed = seedFromString("chamfer");
		const raw = new Float64Array(977);
		for (let n = 0; n < raw.length; n++) {
			const [x, y, z] = direction(n);
			raw[n] = octaveNoise(x, y, z, seed, settings());
		}
		for (const land of [0.1, 0.3, 0.65, 0.9])
			expect(demo.seaLevelFor(raw, land)).toBe(seaLevelFor(raw, land));
	});

	it("agrees on a whole field, digest for digest", () => {
		const seed = seedFromString("chamfer");
		let theirs = 0;
		let mine = 0;
		for (let n = 0; n < 977; n++) {
			const [x, y, z] = direction(n);
			theirs =
				(theirs * 31 + Math.round(fbm(x, y, z, 4, 5, seed) * 1e9)) | 0;
			mine =
				(mine * 31 + Math.round(demo.fbm(x, y, z, 4, 5, seed) * 1e9)) | 0;
		}
		expect(mine).toBe(theirs);
	});
});
