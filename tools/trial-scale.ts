import { octaveNoise, seaLevelFor, seedFromString } from "chamfer/generation";
import type { NoiseSettings } from "chamfer/generation";

/**
 * What normalising by the field's own peak costs, and what it buys.
 *
 * The metre scale divides by the tallest point the noise reached, so the
 * tallest mountain is exactly `relief`. The obvious alternative is a plain
 * multiplier -- metres are the field times a number -- which looks like less
 * machinery. This measures whether it is.
 */
const N = 8000;
const golden = Math.PI * (3 - Math.sqrt(5));
const DIRS: [number, number, number][] = [];
for (let n = 0; n < N; n++) {
	const z = 1 - (2 * n + 1) / N;
	const ring = Math.sqrt(Math.max(0, 1 - z * z));
	DIRS.push([Math.cos(n * golden) * ring, z, Math.sin(n * golden) * ring]);
}

function base(over: Partial<NoiseSettings> = {}): NoiseSettings {
	return {
		frequency: 4,
		octaves: 5,
		persistence: 0.5,
		lacunarity: 2,
		offsetX: 0,
		offsetY: 0,
		ridge: 0,
		...over,
	};
}

function field(s: NoiseSettings, seed: number): Float64Array {
	const out = new Float64Array(N);
	for (let n = 0; n < N; n++) {
		const d = DIRS[n]!;
		out[n] = octaveNoise(d[0]!, d[1]!, d[2]!, seed, s);
	}
	return out;
}

const SEED = seedFromString("chamfer");

console.log("A. how far the raw field reaches, as the shape knobs move");
console.log("   (a plain multiplier makes mountain height proportional to this)");
const reaches: number[] = [];
const show = (label: string, s: NoiseSettings, seed = SEED): void => {
	const f = field(s, seed);
	let hi = 0;
	for (const v of f) if (Math.abs(v) > hi) hi = Math.abs(v);
	reaches.push(hi);
	console.log(`   ${label.padEnd(24)} reaches ${hi.toFixed(4)}`);
};
for (const octaves of [1, 3, 5, 8]) show(`octaves ${octaves}`, base({ octaves }));
for (const persistence of [0.3, 0.5, 0.7, 0.9])
	show(`persistence ${persistence}`, base({ persistence }));
for (const ridge of [0, 0.4, 0.85]) show(`ridge ${ridge}`, base({ ridge }));
for (const text of ["chamfer", "world1", "atlas", "reef"])
	show(`seed "${text}"`, base(), seedFromString(text));
const lo = Math.min(...reaches);
const hi = Math.max(...reaches);
console.log(
	`   spread: ${lo.toFixed(4)} to ${hi.toFixed(4)} — a factor of ${(hi / lo).toFixed(2)}`,
);

console.log("\nB. with the peak divided out, is the tallest mountain the number asked for?");
const RELIEF = 1100;
const SEA_DEPTH = 130;
let worst = 0;
for (const s of [
	base(),
	base({ octaves: 1 }),
	base({ octaves: 8 }),
	base({ persistence: 0.9 }),
	base({ ridge: 0.85 }),
	base({ lacunarity: 3.4 }),
])
	for (const land of [0.2, 0.5, 0.8]) {
		const f = field(s, SEED);
		const sea = seaLevelFor(f, land);
		let peak = 0;
		let trough = 0;
		for (const v of f) {
			const d = v - sea;
			if (d > peak) peak = d;
			if (d < trough) trough = d;
		}
		const up = peak > 0 ? RELIEF / peak : 0;
		const down = trough < 0 ? SEA_DEPTH / -trough : 0;
		let tallest = -1e9;
		let deepest = 1e9;
		for (const v of f) {
			const d = v - sea;
			const m = d >= 0 ? d * up : d * down;
			if (m > tallest) tallest = m;
			if (m < deepest) deepest = m;
		}
		worst = Math.max(
			worst,
			Math.abs(tallest - RELIEF),
			Math.abs(deepest + SEA_DEPTH),
		);
	}
console.log(`   over 18 combinations of shape and Land, the tallest point missed`);
console.log(
	`   ${RELIEF} m by at most ${worst.toExponential(1)} m, and the deepest missed ${SEA_DEPTH} m by the same.`,
);

console.log("\nC. one scale for both sides, against one for each");
for (const land of [0.3, 0.5, 0.65]) {
	const f = field(base({ ridge: 0.85 }), SEED);
	const sea = seaLevelFor(f, land);
	let peak = 0;
	let trough = 0;
	for (const v of f) {
		const d = v - sea;
		if (d > peak) peak = d;
		if (d < trough) trough = d;
	}
	// One scale: pick it so the tallest mountain is RELIEF. The floor follows.
	const one = RELIEF / peak;
	const floorOne = -trough * one;
	console.log(
		`   Land ${land}: one scale — peak ${RELIEF} m, floor ${floorOne.toFixed(0)} m,` +
			` span ${(RELIEF + floorOne).toFixed(0)} m (floor is ${(floorOne / RELIEF).toFixed(2)}x the peak)`,
	);
	console.log(
		`             two scales — peak ${RELIEF} m, floor ${SEA_DEPTH} m,` +
			` span ${RELIEF + SEA_DEPTH} m`,
	);
}
