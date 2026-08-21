import { octaveNoise, seedFromString } from "chamfer/generation";
import type { NoiseSettings } from "chamfer/generation";

/**
 * Whether the ground can be high without being rough, and rough without being
 * high.
 *
 * A landscape reads as varied when its regions differ in **character**: plains
 * here, a range over there, a high flat plateau somewhere else. A single
 * octave stack cannot do that, because fBm is homogeneous -- every octave
 * applies everywhere at the same amplitude, so one statistic describes the
 * whole planet.
 *
 * The test is the correlation between how high a place is and how rough it is.
 * Locked together, there are only two kinds of place: low and smooth, or high
 * and jagged. That is exactly "either hills or peaky mountains".
 */
const SIDE = 220;
const STEP = 0.02;

function base(over: Partial<NoiseSettings> = {}): NoiseSettings {
	return {
		basis: "value",
		frequency: 1,
		octaves: 6,
		persistence: 0.5,
		lacunarity: 2,
		offsetX: 0,
		offsetY: 0,
		ridge: 0,
		jitter: 0,
		feature: "f1",
		spinSin: 0,
		spinCos: 1,
		...over,
	};
}

/** A square patch of one field, so neighbours can be compared. */
function patch(make: (x: number, y: number) => number): Float64Array {
	const out = new Float64Array(SIDE * SIDE);
	for (let r = 0; r < SIDE; r++)
		for (let q = 0; q < SIDE; q++) out[r * SIDE + q] = make(q * STEP, r * STEP);
	return out;
}

/**
 * How much the character of the ground VARIES across one map.
 *
 * The first instinct is to ask whether height and roughness move together.
 * They do not, and that is the point: fBm is homogeneous, so its roughness is
 * the same everywhere and has nothing to correlate with. A landscape reads as
 * varied when some neighbourhoods are smooth and others are not -- so the
 * measure is the SPREAD of local roughness, not its correlation with anything.
 */
function character(height: Float64Array): {
	spread: number;
	low: number;
	high: number;
} {
	const W = 9;
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
	return { spread: high / Math.max(1e-9, low), low, high };
}

const SEED = seedFromString("chamfer");
const terrain = base({ frequency: 6, octaves: 6 });
const ridged = base({ frequency: 6, octaves: 6, ridge: 0.85 });
// The control fields are slow: they say what KIND of place this is, and a kind
// that changed as fast as the ground would not read as a region at all.
const controlA = base({ frequency: 1.1, octaves: 2 });
const controlB = base({ frequency: 0.7, octaves: 2 });

const at = (s: NoiseSettings, x: number, y: number, seed = SEED): number =>
	octaveNoise(x, y, 0.37, seed, s);

console.log("  how much the ground's character varies across one map");
console.log("                                   calmest 10% | roughest 10% | spread");
const report = (label: string, p: Float64Array): void => {
	const r = character(p);
	console.log(
		`  ${label.padEnd(30)} ${r.low.toFixed(4).padStart(12)} | ` +
			`${r.high.toFixed(4).padStart(12)} | ${(r.spread.toFixed(1) + "x").padStart(6)}`,
	);
};

report("one stack, plain", patch((x, y) => at(terrain, x, y)));
report("one stack, ridged", patch((x, y) => at(ridged, x, y)));

// The quote's rule: multiply the base height by the control fields.
report(
	"base x controls (multiply)",
	patch((x, y) => {
		const cont = at(controlA, x, y, SEED + 1);
		const ero = (at(controlB, x, y, SEED + 2) + 1) / 2;
		return cont * ero * ((at(terrain, x, y) + 1) / 2);
	}),
);

// Amplitude as a field: the control decides how much relief is allowed here,
// and the base elevation is added rather than multiplied.
report(
	"base + terrain x amplitude",
	patch((x, y) => {
		const cont = at(controlA, x, y, SEED + 1);
		const amp = (at(controlB, x, y, SEED + 2) + 1) / 2;
		return cont + at(terrain, x, y) * amp * 0.6;
	}),
);

// And the same, with the control also choosing the CHARACTER: smooth hills
// where it is low, creased ridges where it is high.
report(
	"base + blend(hills, ridges)",
	patch((x, y) => {
		const cont = at(controlA, x, y, SEED + 1);
		const amp = (at(controlB, x, y, SEED + 2) + 1) / 2;
		const shape = at(terrain, x, y) * (1 - amp) + at(ridged, x, y) * amp;
		return cont + shape * amp * 0.9;
	}),
);
