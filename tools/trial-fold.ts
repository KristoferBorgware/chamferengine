import { octaveNoise, seedFromString } from "chamfer/generation";
import type { NoiseSettings } from "chamfer/generation";
import { hash3, valueNoise3 } from "chamfer/generation";

/**
 * What the fold does to a field, at every setting rather than at its ends.
 *
 * **A fold that is mixed in cancels on one side.** The crease is an even
 * function of the octave and the plain octave is an odd one, and they disagree
 * about which end is high: plain noise peaks where the octave is `+1` and a
 * fold peaks where it is `0`. Blending them linearly therefore subtracts on
 * the positive half and adds on the negative half, which leaves the ridges
 * piled against a ceiling with nothing above them at part settings.
 *
 * This measures both forms over the whole planet at every fold from 0 to 1:
 * the range of the field, the spread of its top tenth against the spread of
 * its bottom tenth, and how clumped each tail is -- a thin ridge network scores
 * low, a broad basin scores high.
 *
 * Run by hand: `npx vite-node tools/trial-fold.ts`.
 */
const LEVEL = 7;
const SEED = seedFromString("chamfer") + 337;
const OCTAVE_SPREAD = 1000;
const RIDGE_GAIN = 2.2;

const SETTINGS = (ridge: number): NoiseSettings => ({
	frequency: 6800.7 / 600,
	octaves: 4,
	persistence: 0.5,
	lacunarity: 2,
	offsetX: 0,
	offsetY: 0,
	ridge,
});

/** The blend as it was: an odd term plus an even one. */
function mixedFold(
	x: number,
	y: number,
	z: number,
	seed: number,
	s: NoiseSettings,
): number {
	let sum = 0;
	let amplitude = 1;
	let total = 0;
	let f = s.frequency;
	let weight = 1;
	for (let o = 0; o < s.octaves; o++) {
		const ox = (2 * hash3(o, 0, 0, seed) - 1) * OCTAVE_SPREAD + s.offsetX;
		const oy = (2 * hash3(o, 1, 0, seed) - 1) * OCTAVE_SPREAD + s.offsetY;
		const oz = (2 * hash3(o, 2, 0, seed) - 1) * OCTAVE_SPREAD;
		const n = valueNoise3(x * f + ox, y * f + oy, z * f + oz, seed);
		let signal = n;
		if (s.ridge > 0) {
			const fold = 1 - Math.abs(n);
			const crease = fold * fold;
			signal = n * (1 - s.ridge) + (crease * 2 - 1) * s.ridge;
			signal *= weight;
			weight = Math.min(
				1,
				Math.max(0, 1 - s.ridge + s.ridge * crease * RIDGE_GAIN),
			);
		}
		sum += amplitude * signal;
		total += amplitude;
		amplitude *= s.persistence;
		f *= s.lacunarity;
	}
	return total > 0 ? sum / total : 0;
}

/** One face's lattice, as unit directions -- the same walk the labs make. */
const FACES = 20;
const N = 2 ** LEVEL;

function sample(
	read: (
		x: number,
		y: number,
		z: number,
		seed: number,
		s: NoiseSettings,
	) => number,
	ridge: number,
): { all: number[]; grids: Float64Array[] } {
	const s = SETTINGS(ridge);
	const all: number[] = [];
	const grids: Float64Array[] = [];
	for (let f = 0; f < FACES; f++) {
		const grid = new Float64Array((N + 1) * (N + 1)).fill(Number.NaN);
		for (let i = 0; i <= N; i++)
			for (let j = 0; j + i <= N; j++) {
				// A direction spread over the face, good enough for a
				// distribution: the question is the shape of the values, not
				// where each one landed.
				const a = (N - i - j) / N;
				const b = i / N;
				const c = j / N;
				const x = a - 0.3 * b + 0.1 * c + f * 0.017;
				const y = b + 0.2 * c - 0.1 * a - f * 0.011;
				const z = c - 0.15 * a + 0.25 * b + f * 0.023;
				const len = Math.sqrt(x * x + y * y + z * z) || 1;
				const v = read(x / len, y / len, z / len, SEED, s);
				grid[i * (N + 1) + j] = v;
				all.push(v);
			}
		grids.push(grid);
	}
	all.sort((p, q) => p - q);
	return { all, grids };
}

function clump(grids: Float64Array[], test: (v: number) => boolean): number {
	let kin = 0;
	let seen = 0;
	const steps: [number, number][] = [
		[1, 0],
		[-1, 0],
		[0, 1],
		[0, -1],
		[1, -1],
		[-1, 1],
	];
	for (const grid of grids)
		for (let i = 1; i < N; i++)
			for (let j = 1; j + i < N; j++) {
				const here = grid[i * (N + 1) + j]!;
				if (!test(here)) continue;
				for (const [di, dj] of steps) {
					const there = grid[(i + di) * (N + 1) + j + dj]!;
					if (Number.isNaN(there)) continue;
					seen++;
					if (test(there)) kin++;
				}
			}
	return seen > 0 ? (100 * kin) / seen : 0;
}

function report(
	read: (
		x: number,
		y: number,
		z: number,
		seed: number,
		s: NoiseSettings,
	) => number,
	name: string,
): void {
	console.log(`\n   ${name}`);
	console.log(
		"   fold |    min     max |  top tail  bottom tail |  which end | top clump  bottom clump",
	);
	for (const ridge of [0, 0.2, 0.35, 0.5, 0.65, 0.8, 0.85, 1]) {
		const { all, grids } = sample(read, ridge);
		const at = (t: number) => all[Math.floor(t * (all.length - 1))]!;
		const top = at(1) - at(0.9);
		const bottom = at(0.1) - at(0);
		const which =
			top > bottom
				? `top    x${(top / bottom).toFixed(2)}`
				: `BOTTOM x${(bottom / top).toFixed(2)}`;
		console.log(
			`   ${ridge.toFixed(2)} | ${at(0).toFixed(3).padStart(6)}  ${at(1)
				.toFixed(3)
				.padStart(5)} |    ${top.toFixed(3)}        ${bottom.toFixed(
				3,
			)} | ${which} |    ${clump(grids, (v) => v >= at(0.9))
				.toFixed(1)
				.padStart(5)}%       ${clump(grids, (v) => v <= at(0.1))
				.toFixed(1)
				.padStart(5)}%`,
		);
	}
}

/**
 * How steep the ground gets, which is the other half of what a fold is for.
 *
 * A tangent patch of the sphere, sampled on a square grid, read as metres and
 * differenced with its neighbour. The spacing is stated because a slope is
 * meaningless without one.
 */
const RADIUS = 6800.7;
const RELIEF = 300;
const SIDE = 256;
const SPAN = 0.5; // radians across the patch
const SPACING = (SPAN * RADIUS) / SIDE;

function slopes(
	read: (
		x: number,
		y: number,
		z: number,
		seed: number,
		s: NoiseSettings,
	) => number,
	ridge: number,
): number[] {
	const s = SETTINGS(ridge);
	const height = new Float64Array(SIDE * SIDE);
	for (let a = 0; a < SIDE; a++)
		for (let b = 0; b < SIDE; b++) {
			const u = (a / (SIDE - 1) - 0.5) * SPAN;
			const v = (b / (SIDE - 1) - 0.5) * SPAN;
			const x = 1;
			const y = u;
			const z = v;
			const len = Math.sqrt(x * x + y * y + z * z);
			height[a * SIDE + b] = read(x / len, y / len, z / len, SEED, s) * RELIEF;
		}
	const out: number[] = [];
	for (let a = 0; a < SIDE - 1; a++)
		for (let b = 0; b < SIDE - 1; b++) {
			const here = height[a * SIDE + b]!;
			out.push(
				(Math.atan(Math.abs(height[(a + 1) * SIDE + b]! - here) / SPACING) *
					180) /
					Math.PI,
			);
			out.push(
				(Math.atan(Math.abs(height[a * SIDE + b + 1]! - here) / SPACING) *
					180) /
					Math.PI,
			);
		}
	out.sort((p, q) => p - q);
	return out;
}

function steepness(
	read: (
		x: number,
		y: number,
		z: number,
		seed: number,
		s: NoiseSettings,
	) => number,
	name: string,
): void {
	console.log(`\n   ${name}`);
	console.log("   fold | median    90th    99th  steepest");
	for (const ridge of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
		const all = slopes(read, ridge);
		const at = (t: number) =>
			`${all[Math.floor(t * (all.length - 1))]!.toFixed(1)}°`.padStart(6);
		console.log(
			`   ${ridge.toFixed(2)} | ${at(0.5)}  ${at(0.9)}  ${at(0.99)}  ${at(1)}`,
		);
	}
}

console.log(
	`\n   ${FACES} faces at level ${LEVEL}, ${(
		FACES *
		((N + 1) * (N + 2)) *
		0.5
	).toLocaleString()} samples a row.`,
);
report(mixedFold, "The fold blended in: an odd term plus an even one");
report(octaveNoise, "The fold's crest moved: one shape at every setting");
console.log(
	`\n   Gradient over a ${(SPAN * RADIUS).toFixed(0)} m patch sampled every ` +
		`${SPACING.toFixed(1)} m, at ${RELIEF} m of relief.`,
);
steepness(mixedFold, "The fold blended in");
steepness(octaveNoise, "The fold's crest moved");
console.log("");
