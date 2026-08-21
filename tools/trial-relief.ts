import { fbm, octaveNoise, seaLevelFor, seedFromString } from "chamfer/generation";
import type { NoiseSettings } from "chamfer/generation";

/**
 * What Relief moves, and what it cannot move.
 *
 * Relief is one number for the whole planet, applied after the unitless field
 * is finished. It is a unit conversion. The question this answers is why a
 * control layer looks inert until Relief is raised, when Relief has no way to
 * know where that layer is high.
 */
const SIDE = 200;
const SPAN = 0.55; // radians across the patch
const SEED = seedFromString("chamfer");

const CONTINENT_SEED_OFFSET = 101;
const MOUNTAIN_SEED_OFFSET = 211;
const WARP_SEED_OFFSET = 977;
const WARP_OCTAVES = 3;
const GROUND_ROCK = 300;
const GROUND_SNOW = 400;

type Point = [number, number];

/** The lab's curve: piecewise linear, held flat past either end. */
function splineAt(points: Point[], at: number): number {
	if (at <= points[0]![0]) return points[0]![1];
	const last = points[points.length - 1]!;
	if (at >= last[0]) return last[1];
	for (let n = 1; n < points.length; n++) {
		const [x1, y1] = points[n]!;
		if (at > x1) continue;
		const [x0, y0] = points[n - 1]!;
		const span = x1 - x0;
		if (span <= 1e-9) return y1;
		return y0 + ((y1 - y0) * (at - x0)) / span;
	}
	return last[1];
}

function surface(over: Partial<NoiseSettings> = {}): NoiseSettings {
	return {
		basis: "value",
		frequency: 8,
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

const PLAIN = surface({ ridge: 0 });
const CREASED = surface({ ridge: 0.85 });
const WARP_AMPLITUDE = 0.8;
const WARP_FREQUENCY = 2;
const DETAIL = 1.5;

/** The lab's warped read of the terrain stack. */
function stack(x: number, y: number, z: number, s: NoiseSettings): number {
	const w = (SEED + WARP_SEED_OFFSET) | 0;
	const a = WARP_AMPLITUDE;
	return octaveNoise(
		x + a * fbm(x, y, z, WARP_FREQUENCY, WARP_OCTAVES, w),
		y + a * fbm(x, y, z, WARP_FREQUENCY, WARP_OCTAVES, w + 1),
		z + a * fbm(x, y, z, WARP_FREQUENCY, WARP_OCTAVES, w + 2),
		SEED,
		s,
	);
}

/** The `blend` merge, with the mountain layer switchable. */
function fieldAt(
	x: number,
	y: number,
	z: number,
	mountain: Point[] | null,
	continent: Point[],
): number {
	const contRaw = fbm(x, y, z, 3, 2, (SEED + CONTINENT_SEED_OFFSET) | 0);
	const mountRaw = fbm(x, y, z, 4.5, 2, (SEED + MOUNTAIN_SEED_OFFSET) | 0);
	const cont = splineAt(continent, contRaw);
	const mount = mountain ? splineAt(mountain, mountRaw) : 1;
	const plain = stack(x, y, z, PLAIN);
	const creased = stack(x, y, z, CREASED);
	const base = cont * 2 - 1;
	const shape = plain * (1 - mount) + creased * mount;
	return base + shape * mount * DETAIL;
}

/** The curve in the screenshot: a steep knee where the histogram is dense. */
const MOUNTAIN: Point[] = [
	[-1, 0.1],
	[-0.35, 0.25],
	[0.1, 0.9],
	[1, 0.93],
];
const CONTINENT: Point[] = [
	[-1, 0.08],
	[-0.3, 0.2],
	[-0.05, 0.34],
	[0.15, 0.62],
	[1, 0.95],
];

/** A square of directions, so neighbours can be compared. */
function patch(mountain: Point[] | null): Float64Array {
	const c: [number, number, number] = [0, 0.7071067811865476, 0.7071067811865476];
	const u: [number, number, number] = [1, 0, 0];
	const v: [number, number, number] = [0, 0.7071067811865476, -0.7071067811865476];
	const out = new Float64Array(SIDE * SIDE);
	for (let r = 0; r < SIDE; r++)
		for (let q = 0; q < SIDE; q++) {
			const a = (q / (SIDE - 1) - 0.5) * SPAN;
			const b = (r / (SIDE - 1) - 0.5) * SPAN;
			let x = c[0] + u[0] * a + v[0] * b;
			let y = c[1] + u[1] * a + v[1] * b;
			let z = c[2] + u[2] * a + v[2] * b;
			const len = Math.sqrt(x * x + y * y + z * z);
			x /= len;
			y /= len;
			z /= len;
			out[r * SIDE + q] = fieldAt(x, y, z, mountain, CONTINENT);
		}
	return out;
}

/** Metres, the `multiply` way: the raw field times Relief, above the sea cut. */
function metres(raw: Float64Array, sea: number, relief: number, seaDepth: number): Float64Array {
	const out = new Float64Array(raw.length);
	for (let n = 0; n < raw.length; n++) {
		const d = raw[n]! - sea;
		out[n] = d >= 0 ? d * relief : d * seaDepth;
	}
	return out;
}

/** The spread of local roughness -- how much the CHARACTER of the ground varies. */
function roughnessSpread(height: Float64Array): { low: number; high: number; spread: number } {
	const W = 8;
	const roughs: number[] = [];
	for (let r = W; r < SIDE - W; r += 3)
		for (let q = W; q < SIDE - W; q += 3) {
			let steps = 0;
			let count = 0;
			for (let dr = -W; dr <= W; dr++)
				for (let dq = -W; dq < W; dq++) {
					const at = (r + dr) * SIDE + (q + dq);
					steps += Math.abs(height[at + 1]! - height[at]!);
					count++;
				}
			roughs.push(steps / count);
		}
	roughs.sort((x, y) => x - y);
	const low = roughs[Math.floor(roughs.length * 0.1)]!;
	const high = roughs[Math.floor(roughs.length * 0.9)]!;
	return { low, high, spread: high / Math.max(1e-9, low) };
}

const withMountain = patch(MOUNTAIN);
const withoutMountain = patch(null);
const sorted = Float64Array.from(withMountain).sort();
const sea = sorted[Math.floor(sorted.length * (1 - 0.65))]!;

console.log("A. does Relief change the SHAPE of the ground?");
const low = metres(withMountain, sea, 50, 10);
const high = metres(withMountain, sea, 1790, 10);
let worstRatio = 0;
let bestRatio = 1e9;
for (let n = 0; n < low.length; n++) {
	if (low[n]! <= 0.001) continue;
	const ratio = high[n]! / low[n]!;
	if (ratio > worstRatio) worstRatio = ratio;
	if (ratio < bestRatio) bestRatio = ratio;
}
console.log(
	`   every land point at Relief 1790 divided by the same point at Relief 50:`,
);
console.log(
	`   between ${bestRatio.toFixed(6)} and ${worstRatio.toFixed(6)} -- one constant, 1790/50 = 35.8`,
);

console.log("\nB. what Relief DOES change: which ground band the land reaches");
console.log("   Relief |   tallest |  grass |   rock |   snow");
for (const relief of [50, 300, 600, 1100, 1790]) {
	const m = metres(withMountain, sea, relief, 10);
	let tallest = 0;
	let land = 0;
	let grass = 0;
	let rock = 0;
	let snow = 0;
	for (const v of m) {
		if (v > tallest) tallest = v;
		if (v <= 0) continue;
		land++;
		if (v < GROUND_ROCK) grass++;
		else if (v < GROUND_SNOW) rock++;
		else snow++;
	}
	console.log(
		`   ${String(relief).padStart(6)} | ${(tallest.toFixed(0) + " m").padStart(9)} | ` +
			`${((grass / land) * 100).toFixed(1).padStart(5)}% | ${((rock / land) * 100).toFixed(1).padStart(5)}% | ` +
			`${((snow / land) * 100).toFixed(1).padStart(5)}%`,
	);
}

console.log("\nC. what the mountain layer does, in the unitless field -- before any metres");
console.log("                            calm 10% | rough 10% | spread");
for (const [label, p] of [
	["mountain curve on", withMountain],
	["mountain layer off", withoutMountain],
] as [string, Float64Array][]) {
	const r = roughnessSpread(p);
	console.log(
		`   ${label.padEnd(20)} ${r.low.toFixed(5).padStart(9)} | ${r.high.toFixed(5).padStart(9)} | ${(r.spread.toFixed(2) + "x").padStart(6)}`,
	);
}
console.log("   Relief is not in this measurement at all. It cannot be:");
console.log("   section A showed it is one constant over every land point.");

console.log("\nD. where the map actually sits, between each pair of control points");
const raws: number[] = [];
for (let r = 0; r < SIDE; r += 2)
	for (let q = 0; q < SIDE; q += 2) {
		const a = (q / (SIDE - 1) - 0.5) * SPAN;
		const b = (r / (SIDE - 1) - 0.5) * SPAN;
		let x = 0 + a;
		let y = 0.7071067811865476 + 0.7071067811865476 * b;
		let z = 0.7071067811865476 - 0.7071067811865476 * b;
		const len = Math.sqrt(x * x + y * y + z * z);
		x /= len;
		y /= len;
		z /= len;
		raws.push(fbm(x, y, z, 4.5, 2, (SEED + MOUNTAIN_SEED_OFFSET) | 0));
	}
for (let n = 1; n < MOUNTAIN.length; n++) {
	const x0 = MOUNTAIN[n - 1]![0];
	const x1 = MOUNTAIN[n]![0];
	const share = raws.filter((v) => v >= x0 && v < x1).length / raws.length;
	console.log(
		`   x ${x0.toFixed(2).padStart(5)} to ${x1.toFixed(2).padStart(5)}: ` +
			`${((share * 100).toFixed(1) + "%").padStart(6)} of the map, ` +
			`curve goes ${MOUNTAIN[n - 1]![1].toFixed(2)} to ${MOUNTAIN[n]![1].toFixed(2)}`,
	);
}
