// Three ways to blend eight lattice corners, timed and checked against each
// other.
//
//   npx vite-node tools/trial-noise-blend.ts
//
// Hashing is `38%` of a reading and the blend is the other `62%`, so the blend
// is what is left to attack once the corners are cached. Two candidates:
//
//   **unrolled** -- the same eight products summed in the same order, with the
//   loop, the bit twiddling, the three ternaries and the repeated `1 - u`
//   taken out. Every operation and every rounding is where it was, so it is
//   the same world to the bit.
//
//   **nested** -- seven lerps, which is how every other value-noise
//   implementation writes it. Fewer multiplies, and **a different world**: it
//   is the same number in exact arithmetic and a last-bit away in this one.
import { fade } from "../packages/engine/src/generation/noise/fade.js";
import { hash3 } from "../packages/engine/src/generation/noise/hash3.js";
import { valueNoise3 } from "chamfer/generation";

/** The eight corners of the cell a point falls in, in the order both forms use. */
function corners(
	xi: number,
	yi: number,
	zi: number,
	seed: number,
	into: Float64Array,
): void {
	for (let c = 0; c < 8; c++)
		into[c] = hash3(xi + (c & 1), yi + ((c >> 1) & 1), zi + (c >> 2), seed);
}

const held = new Float64Array(8);

/** The loop this replaced, kept so the two can be checked against each other. */
function looped(u: number, v: number, w: number): number {
	let s = 0;
	for (let c = 0; c < 8; c++) {
		const dx = c & 1;
		const dy = (c >> 1) & 1;
		const dz = c >> 2;
		const wx = dx ? u : 1 - u;
		const wy = dy ? v : 1 - v;
		const wz = dz ? w : 1 - w;
		s += wx * wy * wz * held[c]!;
	}
	return s * 2 - 1;
}

/** The same eight products, in the same order, written out. */
function unrolled(u: number, v: number, w: number): number {
	const nu = 1 - u;
	const nv = 1 - v;
	const nw = 1 - w;
	let s = nu * nv * nw * held[0]!;
	s += u * nv * nw * held[1]!;
	s += nu * v * nw * held[2]!;
	s += u * v * nw * held[3]!;
	s += nu * nv * w * held[4]!;
	s += u * nv * w * held[5]!;
	s += nu * v * w * held[6]!;
	s += u * v * w * held[7]!;
	return s * 2 - 1;
}

/** Seven lerps, which is the same value and not the same arithmetic. */
function nested(u: number, v: number, w: number): number {
	const a = held[0]! + (held[1]! - held[0]!) * u;
	const b = held[2]! + (held[3]! - held[2]!) * u;
	const c = held[4]! + (held[5]! - held[4]!) * u;
	const d = held[6]! + (held[7]! - held[6]!) * u;
	const e = a + (b - a) * v;
	const f = c + (d - c) * v;
	return (e + (f - e) * w) * 2 - 1;
}

// **Do the two agree with the one that ships?** The unrolled form has to, to
// the bit; the nested one is measured for how far off it is.
let sameUnrolled = 0;
let sameNested = 0;
let worst = 0;
const RUNS = 200000;
for (let n = 0; n < RUNS; n++) {
	const x = n * 0.00713 - 700;
	const y = n * 0.00311 + 40;
	const z = n * 0.00517 - 200;
	const xi = Math.floor(x);
	const yi = Math.floor(y);
	const zi = Math.floor(z);
	corners(xi, yi, zi, 4242, held);
	const u = fade(x - xi);
	const v = fade(y - yi);
	const w = fade(z - zi);
	const ships = valueNoise3(x, y, z, 4242);
	// **The proof the change was free.** The loop is what the engine used to
	// run and `valueNoise3` is what it runs now; if they ever differ here, a
	// world has moved.
	if (looped(u, v, w) !== ships)
		throw new Error("the unrolled blend is not the loop");
	if (unrolled(u, v, w) === ships) sameUnrolled++;
	const near = nested(u, v, w);
	if (near === ships) sameNested++;
	worst = Math.max(worst, Math.abs(near - ships));
}

const best = (run: () => void): number => {
	let least = Infinity;
	for (let p = 0; p < 5; p++) {
		const at = performance.now();
		run();
		if (p > 0) least = Math.min(least, performance.now() - at);
	}
	return least;
};

const N = 4000000;
let sink = 0;
// **Three loops and not one loop over three functions.** Passing the blend in
// makes the call site polymorphic, which stops it being inlined -- and then
// what is timed is the call rather than the arithmetic. Measured that way all
// three came out within a few nanoseconds of each other and the loop looked
// fastest, which is the benchmark measuring itself.
corners(3, 5, 7, 4242, held);
const one = best(() => {
	for (let n = 0; n < N; n++) {
		const t = (n & 1023) / 1024;
		sink += looped(t, 1 - t, t * t);
	}
});
const two = best(() => {
	for (let n = 0; n < N; n++) {
		const t = (n & 1023) / 1024;
		sink += unrolled(t, 1 - t, t * t);
	}
});
const three = best(() => {
	for (let n = 0; n < N; n++) {
		const t = (n & 1023) / 1024;
		sink += nested(t, 1 - t, t * t);
	}
});
if (sink === 1e99) console.log(sink);

const line = (what: string, ms: number, same: number): void =>
	console.log(
		what.padEnd(12) +
			`${((ms / N) * 1e6).toFixed(1)} ns`.padStart(10) +
			`${((100 * ms) / one).toFixed(0)}%`.padStart(8) +
			same.padStart(34),
	);

console.log(
	`the blend alone, corners already in hand, ${N.toLocaleString("en-US")} readings\n`,
);
console.log(
	"form".padEnd(12) +
		"a blend".padStart(10) +
		"of now".padStart(8) +
		"against the loop".padStart(34),
);
line("looped", one, "the form this replaced");
line(
	"unrolled",
	two,
	`${((100 * sameUnrolled) / RUNS).toFixed(2)}% identical`,
);
line(
	"nested",
	three,
	`${((100 * sameNested) / RUNS).toFixed(1)}% identical, worst ${worst.toExponential(1)}`,
);
