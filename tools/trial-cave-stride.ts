// What the cave walk saves by remembering corners, skipping by margin, and
// stopping an octave early -- and the proof that none of the three moves a
// block.
//
//   npx vite-node tools/trial-cave-stride.ts [columns]
//
// The cave field is read once a block down a column, three octaves a reading,
// eight hashes an octave -- and a column is a straight line through the field,
// so at a 24 m feature over 1 m blocks the widest octave sits in one lattice
// cell for two dozen readings. The carve already walks with all three savings
// (`carveRun`); this measures what each is worth for the caves before they are
// built in, because the cave scale is five times finer than the carve's and a
// bound that pays there may not pay here.
import { PlanetSettings } from "../packages/client/src/PlanetSettings.js";
import {
	NoiseCorners,
	buildCoarseMap,
	caveField,
	seedFromString,
	valueNoise3,
} from "chamfer/generation";
import { directionToCell } from "chamfer/addressing";
import { Vec3 } from "chamfer/math";

const COLUMNS = Number(process.argv[2] ?? 4000);

const settings = new PlanetSettings({ plain: false, caves: true });
const seed = seedFromString(settings.knobs.seed);
const map = buildCoarseMap(seed, settings.coarseOptions());
const shape = settings.shapeFor(map);
const radius = shape.seaLevelRadius;
const block = shape.blockSize;
const scale = settings.knobs.caveScale;
const threshold = settings.knobs.caveThreshold;
const ceiling = settings.knobs.caveCeiling;
const caveSeed = (seed + 2) | 0;

/** The deep setting the whole question is about. */
const REACH = 200;

/** The same accumulation `fbm` runs, reading each octave through the memo. */
function fbmCorners(
	x: number,
	y: number,
	z: number,
	corners: NoiseCorners,
): number {
	let sum = 0;
	let amplitude = 1;
	let total = 0;
	let f = 1;
	for (let o = 0; o < 3; o++) {
		sum += amplitude * valueNoise3(x * f, y * f, z * f, caveSeed, corners, o);
		total += amplitude;
		amplitude *= 0.5;
		f *= 2;
	}
	return sum / total;
}

/**
 * The most the field can move between one block and the next, provably.
 *
 * The same bound `carveStep` derives: the quintic fade's steepest slope per
 * axis per lattice unit, doubled by `s * 2 - 1`, over three axes -- times how
 * far the sample point travels in a block, which for the cave field is the
 * block in metres over the feature size, doubling per octave.
 */
function caveStride(): number {
	const gradient = 2 * (15 / 8) * Math.sqrt(3);
	const travel = block / scale;
	let sum = 0;
	let total = 0;
	let amplitude = 1;
	let f = 1;
	for (let o = 0; o < 3; o++) {
		sum += amplitude * gradient * travel * f;
		total += amplitude;
		amplitude *= 0.5;
		f *= 2;
	}
	return sum / total;
}

let state = 20260831;
const next = (): number => {
	state = (state * 1103515245 + 12345) & 0x7fffffff;
	return state / 0x7fffffff;
};

/** Land columns, since the sheet is what the walk is for. */
const spots: Vec3[] = [];
while (spots.length < COLUMNS) {
	const z = next() * 2 - 1;
	const phi = next() * Math.PI * 2;
	const r = Math.sqrt(1 - z * z);
	const dir = new Vec3(r * Math.cos(phi), r * Math.sin(phi), z);
	const cell = directionToCell(dir, map.n);
	if (map.heightAt(cell.face, cell.i, cell.j, shape.subdivisionDepth) > 20)
		spots.push(dir);
}

const first = Math.ceil(ceiling / block);
const last = Math.floor(REACH / block);
const layersPer = last - first + 1;

/** One pass over every column, one way. Returns blocks opened + readings. */
function walk(
	how: "plain" | "corners" | "stride",
	out: Uint8Array | null,
): { open: number; readings: number; ms: number } {
	const corners = new NoiseCorners(3);
	let open = 0;
	let readings = 0;
	const stride = caveStride();
	const at = performance.now();
	let wrote = 0;
	for (const dir of spots) {
		if (how === "stride") {
			let layer = first;
			while (layer <= last) {
				const r = radius - (layer + 0.5) * block;
				const f = fbmCorners(
					(dir.x * r) / scale,
					(dir.y * r) / scale,
					(dir.z * r) / scale,
					corners,
				);
				readings++;
				const inBand = f > -threshold && f < threshold;
				const margin = inBand
					? threshold - Math.abs(f)
					: Math.abs(f) - threshold;
				const span = Math.max(1, 1 + Math.floor(margin / stride));
				const to = Math.min(last + 1, layer + span);
				for (let l = layer; l < to; l++) {
					if (inBand) open++;
					if (out) out[wrote++] = inBand ? 1 : 0;
				}
				layer = to;
			}
			continue;
		}
		for (let layer = first; layer <= last; layer++) {
			const r = radius - (layer + 0.5) * block;
			const f =
				how === "plain"
					? caveField(dir.x, dir.y, dir.z, r, seed, scale)
					: fbmCorners(
							(dir.x * r) / scale,
							(dir.y * r) / scale,
							(dir.z * r) / scale,
							corners,
						);
			readings++;
			const inBand = f > -threshold && f < threshold;
			if (inBand) open++;
			if (out) out[wrote++] = inBand ? 1 : 0;
		}
	}
	return { open, readings, ms: performance.now() - at };
}

console.log(
	`${COLUMNS.toLocaleString("en-US")} land columns, caves to ${REACH} m,` +
		` ${layersPer} layers a column, feature ${scale} m, band ${threshold}`,
);

const blocksAll = new Uint8Array(COLUMNS * layersPer);
const blocksWith = new Uint8Array(COLUMNS * layersPer);
const plain = walk("plain", blocksAll);
const corners = walk("corners", blocksWith);
let moved = 0;
for (let n = 0; n < blocksAll.length; n++)
	if (blocksAll[n] !== blocksWith[n]) moved++;
console.log(
	`\nthe corner memo: ${plain.ms.toFixed(0)} ms plain, ` +
		`${corners.ms.toFixed(0)} ms remembered -- x${(plain.ms / corners.ms).toFixed(2)}, ` +
		`${moved} of ${blocksAll.length.toLocaleString("en-US")} blocks moved`,
);

const strided = walk("stride", blocksWith);
moved = 0;
for (let n = 0; n < blocksAll.length; n++)
	if (blocksAll[n] !== blocksWith[n]) moved++;
console.log(
	`the margin stride on top: ${strided.ms.toFixed(0)} ms, ` +
		`${(strided.readings / COLUMNS).toFixed(1)} readings a column against ` +
		`${(plain.readings / COLUMNS).toFixed(1)} -- ` +
		`${moved} blocks moved`,
);

// **Reading the third octave only when the first two leave doubt**, timed the
// way it would ship: same memo, same order, the last octave behind the test.
{
	const corners = new NoiseCorners(3);
	let open = 0;
	const at = performance.now();
	for (const dir of spots) {
		for (let layer = first; layer <= last; layer++) {
			const r = radius - (layer + 0.5) * block;
			const x = (dir.x * r) / scale;
			const y = (dir.y * r) / scale;
			const z = (dir.z * r) / scale;
			const two =
				valueNoise3(x, y, z, caveSeed, corners, 0) +
				0.5 * valueNoise3(x * 2, y * 2, z * 2, caveSeed, corners, 1);
			const gap = Math.abs(two) - threshold * 1.75;
			let inBand: boolean;
			if (gap > 0.25) inBand = false;
			else if (gap < -0.25) inBand = true;
			else {
				const sum =
					two +
					0.25 * valueNoise3(x * 4, y * 4, z * 4, caveSeed, corners, 2);
				const f = sum / 1.75;
				inBand = f > -threshold && f < threshold;
			}
			if (inBand) open++;
		}
	}
	console.log(
		`two octaves first: ${(performance.now() - at).toFixed(0)} ms, ` +
			`${open.toLocaleString("en-US")} open`,
	);
}

// **The third octave, and how often two settle it.** The last octave can move
// the sum by at most its own amplitude, so where the first two stand further
// from the band than that, the answer is known an octave early.
{
	const corners = new NoiseCorners(3);
	let settled = 0;
	let asked = 0;
	for (const dir of spots.slice(0, 500)) {
		for (let layer = first; layer <= last; layer++) {
			const r = radius - (layer + 0.5) * block;
			const x = (dir.x * r) / scale;
			const y = (dir.y * r) / scale;
			const z = (dir.z * r) / scale;
			const two =
				valueNoise3(x, y, z, caveSeed, corners, 0) +
				0.5 * valueNoise3(x * 2, y * 2, z * 2, caveSeed, corners, 1);
			asked++;
			// The band scaled to the raw sum: |sum| < threshold * 1.75, and
			// the third octave moves the sum by 0.25 at the very most.
			const gap = Math.abs(two) - threshold * 1.75;
			if (gap > 0.25 || gap < -0.25) settled++;
		}
	}
	console.log(
		`the third octave: two octaves settle ${((100 * settled) / asked).toFixed(1)}%` +
			` of readings on their own`,
	);
}
