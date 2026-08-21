import { fbm, octaveNoise, seedFromString } from "chamfer/generation";
import type { NoiseSettings } from "chamfer/generation";

/**
 * Whether each control layer should carry its own Relief, in metres.
 *
 * Today one Relief converts the finished unitless field to metres, and the
 * balance between the continent base and the terrain over it is `detail`, a
 * bare ratio. The alternative is two numbers in metres -- how far the
 * continents rise, how far the terrain rises on top -- with the total falling
 * out. This measures what each arrangement can and cannot say.
 */
const SIDE = 180;
const SPAN = 0.55; // radians across the patch
const SEED = seedFromString("chamfer");

const CONTINENT_SEED_OFFSET = 101;
const MOUNTAIN_SEED_OFFSET = 211;
const WARP_SEED_OFFSET = 977;
const WARP_OCTAVES = 3;
const LAND_FRACTION = 0.65;

type Point = [number, number];

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
		ridge: 0,
		jitter: 0,
		feature: "f1",
		spinSin: 0,
		spinCos: 1,
		...over,
	};
}

const PLAIN = surface({ ridge: 0 });
const CREASED = surface({ ridge: 0.85 });

function stack(x: number, y: number, z: number, s: NoiseSettings): number {
	const w = (SEED + WARP_SEED_OFFSET) | 0;
	const a = 0.8;
	return octaveNoise(
		x + a * fbm(x, y, z, 2, WARP_OCTAVES, w),
		y + a * fbm(x, y, z, 2, WARP_OCTAVES, w + 1),
		z + a * fbm(x, y, z, 2, WARP_OCTAVES, w + 2),
		SEED,
		s,
	);
}

const MOUNTAIN: Point[] = [
	[-1, 0.1],
	[-0.35, 0.25],
	[0.1, 0.9],
	[1, 0.93],
];

/** The two halves of the sum, kept apart so each can be priced on its own. */
function parts(continent: Point[]): { base: Float64Array; terrain: Float64Array } {
	const base = new Float64Array(SIDE * SIDE);
	const terrain = new Float64Array(SIDE * SIDE);
	for (let r = 0; r < SIDE; r++)
		for (let q = 0; q < SIDE; q++) {
			const a = (q / (SIDE - 1) - 0.5) * SPAN;
			const b = (r / (SIDE - 1) - 0.5) * SPAN;
			let x = a;
			let y = 0.7071067811865476 * (1 + b);
			let z = 0.7071067811865476 * (1 - b);
			const len = Math.sqrt(x * x + y * y + z * z);
			x /= len;
			y /= len;
			z /= len;
			const contRaw = fbm(x, y, z, 3, 2, (SEED + CONTINENT_SEED_OFFSET) | 0);
			const mountRaw = fbm(x, y, z, 4.5, 2, (SEED + MOUNTAIN_SEED_OFFSET) | 0);
			const mount = splineAt(MOUNTAIN, mountRaw);
			const plain = stack(x, y, z, PLAIN);
			const creased = stack(x, y, z, CREASED);
			const shape = plain * (1 - mount) + creased * mount;
			base[r * SIDE + q] = splineAt(continent, contRaw) * 2 - 1;
			terrain[r * SIDE + q] = shape * mount;
		}
	return { base, terrain };
}

function seaCut(field: Float64Array): number {
	const sorted = Float64Array.from(field).sort();
	return sorted[Math.floor(sorted.length * (1 - LAND_FRACTION))]!;
}

const CONTINENTS: [string, Point[]][] = [
	[
		"shipped shelf-and-rise",
		[
			[-1, 0.08],
			[-0.3, 0.2],
			[-0.05, 0.34],
			[0.15, 0.62],
			[1, 0.95],
		],
	],
	[
		"a shallow curve",
		[
			[-1, 0.4],
			[1, 0.6],
		],
	],
	[
		"the whole range",
		[
			[-1, 0],
			[1, 1],
		],
	],
];

console.log("A. today: one Relief and a bare ratio.");
console.log("   Detail is held at 1.5 and Relief at 1,100 m throughout.");
console.log("   Only the CONTINENT curve moves -- a knob about the other layer.");
console.log("   continent curve            terrain reaches | continents reach");
for (const [label, curve] of CONTINENTS) {
	const { base, terrain } = parts(curve);
	const field = new Float64Array(base.length);
	for (let n = 0; n < field.length; n++)
		field[n] = base[n]! + terrain[n]! * 1.5;
	const sea = seaCut(field);
	let peak = 0;
	for (const v of field) if (v - sea > peak) peak = v - sea;
	const scale = 1100 / peak; // the `fit` rule
	let tLow = 1e9;
	let tHigh = -1e9;
	let bLow = 1e9;
	let bHigh = -1e9;
	for (let n = 0; n < field.length; n++) {
		const t = terrain[n]! * 1.5 * scale;
		const b = base[n]! * scale;
		if (t < tLow) tLow = t;
		if (t > tHigh) tHigh = t;
		if (b < bLow) bLow = b;
		if (b > bHigh) bHigh = b;
	}
	console.log(
		`   ${label.padEnd(24)} ${((tHigh - tLow).toFixed(0) + " m").padStart(15)} | ` +
			`${((bHigh - bLow).toFixed(0) + " m").padStart(15)}`,
	);
}

console.log("\nB. per-layer metres: does the tallest point equal the two knobs added up?");
console.log("   continents | terrain |   sum | tallest actually reached | miss");
const { base, terrain } = parts(CONTINENTS[0]![1]);
for (const [contRelief, terrRelief] of [
	[600, 300],
	[600, 600],
	[900, 200],
	[300, 800],
	[1000, 100],
] as [number, number][]) {
	const m = new Float64Array(base.length);
	for (let n = 0; n < m.length; n++)
		m[n] = base[n]! * contRelief + terrain[n]! * terrRelief;
	const sea = seaCut(m);
	let tallest = 0;
	for (const v of m) if (v - sea > tallest) tallest = v - sea;
	const sum = contRelief + terrRelief;
	console.log(
		`   ${String(contRelief).padStart(10)} | ${String(terrRelief).padStart(7)} | ` +
			`${String(sum).padStart(5)} | ${(tallest.toFixed(0) + " m").padStart(24)} | ` +
			`${(((tallest / sum - 1) * 100).toFixed(0) + "%").padStart(5)}`,
	);
}

console.log("\nC. what per-layer metres costs: `fit` cannot survive it.");
console.log("   Under `fit` the field is divided by its own peak, so only the");
console.log("   RATIO of the two knobs is left. Two settings, same ratio:");
for (const [contRelief, terrRelief] of [
	[600, 300],
	[1200, 600],
] as [number, number][]) {
	const m = new Float64Array(base.length);
	for (let n = 0; n < m.length; n++)
		m[n] = base[n]! * contRelief + terrain[n]! * terrRelief;
	const sea = seaCut(m);
	let peak = 0;
	for (const v of m) if (v - sea > peak) peak = v - sea;
	const scale = 1100 / peak;
	let digest = 0;
	for (let n = 0; n < m.length; n++)
		digest = (digest * 31 + Math.round((m[n]! - sea) * scale * 1e6)) | 0;
	console.log(
		`   continents ${String(contRelief).padStart(4)} m, terrain ${String(terrRelief).padStart(4)} m` +
			`  ->  world digest ${digest}`,
	);
}
console.log("   Same world. Two metre knobs under `fit` are one ratio knob wearing");
console.log("   two hats, which is what `detail` already is.");
