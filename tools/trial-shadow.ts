/**
 * What a shadow march against the coarse map actually finds.
 *
 * The same walk the fragment shader runs, on the CPU against the real map, so
 * the algorithm can be checked without a GPU in the way: how much of a patch
 * of ground is in shadow, how that moves with the height of the sun, and what
 * it looks like drawn.
 *
 *   npx vite-node tools/trial-shadow.ts -- "<query string>" [out directory]
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import {
	FLAT_COARSE_LEVEL,
	PlanetSettings,
} from "../packages/client/src/PlanetSettings.js";
import {
	buildCoarseMap,
	flatCoarseMap,
	seedFromString,
} from "chamfer/generation";
import { Vec3 } from "chamfer/math";

const settings = PlanetSettings.fromParams(
	new URLSearchParams(process.argv[2] ?? "seed=chamfer"),
);
const OUT = process.argv[3] ?? "/tmp/shadow";
mkdirSync(OUT, { recursive: true });

const seed = seedFromString(settings.knobs.seed);
const map = settings.coarseMapRuns
	? buildCoarseMap(seed, settings.coarseOptions())
	: flatCoarseMap(seed, FLAT_COARSE_LEVEL);
const shape = settings.shapeFor(map);
const SEA = shape.seaLevelRadius;

/** Metres above sea level at a direction, the way the shader reads it. */
const groundAt = (dir: Vec3): number =>
	map.index.sampleAt(map.height, dir.normalize());

const STEPS = 24;
const NEAR = 6;
const LIFT = 3;
const SOFTNESS = 24;

/** How much of the sun reaches a point on the surface. */
function sunReach(up: Vec3, sun: Vec3, reach: number, strength: number): number {
	if (strength <= 0 || up.dot(sun) <= 0) return 1;
	const base = SEA + groundAt(up) + LIFT;
	const start = up.scale(base);
	const growth = Math.pow(reach / NEAR, 1 / STEPS);
	let t = NEAR;
	let clear = 1;
	for (let s = 0; s < STEPS; s++) {
		const p = start.add(sun.scale(t));
		const r = p.length();
		const above = r - (SEA + groundAt(p.scale(1 / r)));
		if (above < 0) return 1 - strength;
		clear = Math.min(clear, (above * SOFTNESS) / t);
		t *= growth;
	}
	return 1 - strength * (1 - Math.min(1, Math.max(0, clear)));
}

/** A local frame at a direction: east and north across it. */
function frameAt(centre: Vec3): { east: Vec3; north: Vec3 } {
	let east = new Vec3(0, 1, 0).cross(centre);
	east = east.length() < 1e-6 ? new Vec3(1, 0, 0) : east.normalize();
	return { east, north: centre.cross(east).normalize() };
}

/** Write an 8-bit greyscale image as a PNG. */
function writePng(path: string, size: number, grey: Uint8Array): void {
	const raw = Buffer.alloc(size * (size * 3 + 1));
	for (let row = 0; row < size; row++) {
		const at = row * (size * 3 + 1);
		raw[at] = 0;
		for (let x = 0; x < size; x++) {
			const v = grey[row * size + x]!;
			raw[at + 1 + x * 3] = v;
			raw[at + 2 + x * 3] = v;
			raw[at + 3 + x * 3] = v;
		}
	}
	const table: number[] = [];
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c >>> 0;
	}
	const chunk = (tag: string, body: Buffer): Buffer => {
		const head = Buffer.alloc(8);
		head.writeUInt32BE(body.length, 0);
		head.write(tag, 4, "ascii");
		let crc = 0xffffffff;
		for (const byte of Buffer.concat([head.subarray(4), body]))
			crc = table[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
		const tail = Buffer.alloc(4);
		tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 0);
		return Buffer.concat([head, body, tail]);
	};
	const header = Buffer.alloc(13);
	header.writeUInt32BE(size, 0);
	header.writeUInt32BE(size, 4);
	header[8] = 8;
	header[9] = 2;
	writeFileSync(
		path,
		Buffer.concat([
			Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
			chunk("IHDR", header),
			chunk("IDAT", deflateSync(raw)),
			chunk("IEND", Buffer.alloc(0)),
		]),
	);
}

/** The tallest ground the map holds, and where. */
let peak = -Infinity;
let peakCell = 0;
for (let cell = 0; cell < map.height.length; cell++)
	if (map.height[cell]! > peak) {
		peak = map.height[cell]!;
		peakCell = cell;
	}
console.log(
	`radius ${SEA.toFixed(0)} m, map level ${map.level}, cell ${settings.coarseCell.toFixed(1)} m, ` +
		`tallest ground ${peak.toFixed(0)} m`,
);
void peakCell;

const SIZE = 256;
const SPAN = 3000;
const REACH = settings.knobs.shadowReach;

// A patch of real ground, with the sun coming in at a set height above the
// local horizon from a fixed compass bearing.
const centre = new Vec3(0.31, 0.62, 0.72).normalize();
const { east, north } = frameAt(centre);

for (const degrees of [5, 10, 20, 35, 60]) {
	const angle = (degrees * Math.PI) / 180;
	const sun = centre
		.scale(Math.sin(angle))
		.add(east.scale(Math.cos(angle)))
		.normalize();
	const grey = new Uint8Array(SIZE * SIZE);
	let shadowed = 0;
	let partial = 0;
	for (let row = 0; row < SIZE; row++)
		for (let col = 0; col < SIZE; col++) {
			const x = ((col - SIZE / 2) * SPAN) / SIZE / settings.radius;
			const y = ((row - SIZE / 2) * SPAN) / SIZE / settings.radius;
			const up = centre
				.add(east.scale(x))
				.add(north.scale(y))
				.normalize();
			const reach = sunReach(up, sun, REACH, 1);
			grey[row * SIZE + col] = Math.round(255 * reach);
			if (reach < 0.02) shadowed++;
			else if (reach < 0.98) partial++;
		}
	writePng(`${OUT}/sun-${degrees}deg.png`, SIZE, grey);
	console.log(
		`sun ${String(degrees).padStart(2)} deg up, reach ${REACH} m: ` +
			`${((100 * shadowed) / (SIZE * SIZE)).toFixed(1)}% full shadow, ` +
			`${((100 * partial) / (SIZE * SIZE)).toFixed(1)}% partial`,
	);
}
