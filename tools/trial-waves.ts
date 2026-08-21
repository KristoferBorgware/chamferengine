/**
 * What the sea's wave field looks like, measured away from the GPU.
 *
 * The shader's height field is ported here so a patch of it can be sampled on
 * a grid, shaded, written out as a picture, and -- the part a picture cannot
 * settle -- scored for how regular it is. The score is the height field's own
 * autocorrelation: shift the patch by a lag and see how well it still matches
 * itself. A field built from a few sines matches itself almost perfectly one
 * wavelength over, whatever the crests look like up close; a field with real
 * variety does not.
 *
 *   npx vite-node tools/trial-waves.ts -- [out directory]
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = process.argv[2] ?? "/tmp/waves";
mkdirSync(OUT, { recursive: true });

/** The planet the client opens on. */
const RADIUS = 6800.65;

/** The default swell: metres between crests, and trough to crest. */
const WAVE_SCALE = 45;
const WAVE_HEIGHT = 4;
const CHOP = 2.5;

type Vec = [number, number, number];

const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec, s: number): Vec => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec, b: Vec): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: Vec): Vec => {
	const l = Math.sqrt(dot(a, a));
	return [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a: Vec, b: Vec): Vec => [
	a[1] * b[2] - a[2] * b[1],
	a[2] * b[0] - a[0] * b[2],
	a[0] * b[1] - a[1] * b[0],
];

/** One hashed value per lattice corner, from three wrapping multiplies. */
function hash13(x: number, y: number, z: number): number {
	const qx = Math.imul(Math.floor(x) | 0, 1597334677);
	const qy = Math.imul(Math.floor(y) | 0, 3812015801 | 0);
	const qz = Math.imul(Math.floor(z) | 0, 2798796415 | 0);
	const n = Math.imul(qx ^ qy ^ qz, 1597334677) >>> 0;
	return n / 4294967295;
}

/** Value noise in three dimensions, quintic faded, over -1 to 1. */
function vnoise3(x: number, y: number, z: number): number {
	const ix = Math.floor(x);
	const iy = Math.floor(y);
	const iz = Math.floor(z);
	const fx = x - ix;
	const fy = y - iy;
	const fz = z - iz;
	const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
	const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
	const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
	const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
	const a = mix(hash13(ix, iy, iz), hash13(ix + 1, iy, iz), ux);
	const b = mix(hash13(ix, iy + 1, iz), hash13(ix + 1, iy + 1, iz), ux);
	const c = mix(hash13(ix, iy, iz + 1), hash13(ix + 1, iy, iz + 1), ux);
	const d = mix(hash13(ix, iy + 1, iz + 1), hash13(ix + 1, iy + 1, iz + 1), ux);
	return mix(mix(a, b, uy), mix(c, d, uy), uz) * 2 - 1;
}

/** The two axes every octave of the shipped field folds along. */
const AXIS_A: Vec = [0.86, 0.36, 0.36];
const AXIS_B: Vec = [-0.31, 0.8, 0.51];

/** One octave of the shipped field: two folded bands, multiplied. */
function shippedOctave(d: Vec, k: number, drift: number, chop: number): number {
	const a = dot(d, AXIS_A) * k + drift;
	const b = dot(d, AXIS_B) * k + drift;
	const wa = 1 - Math.abs(Math.sin(a));
	const wb = 1 - Math.abs(Math.sin(b));
	const ra = Math.abs(Math.cos(a));
	const rb = Math.abs(Math.cos(b));
	const wx = wa + (ra - wa) * wa;
	const wy = wb + (rb - wb) * wb;
	return Math.pow(1 - Math.pow(wx * wy, 0.65), chop);
}

/** The shipped swell, in metres off the sea radius. */
export function shippedSwell(dir: Vec, seconds: number): number {
	let k = (2 * Math.PI * RADIUS) / Math.max(1, WAVE_SCALE);
	let chop = Math.max(1, CHOP);
	const wf = k * 0.3;
	const warp: Vec = [
		vnoise3(dir[0] * wf, dir[1] * wf, dir[2] * wf),
		vnoise3(dir[0] * wf + 19.3, dir[1] * wf + 7.7, dir[2] * wf + 3.1),
		vnoise3(dir[0] * wf - 5.2, dir[1] * wf + 11.9, dir[2] * wf + 23.4),
	];
	let d = norm(add(dir, scale(warp, 1.6 / k)));
	let h = 0;
	let amp = 1;
	let total = 0;
	const drift = seconds * 0.8;
	for (let o = 0; o < 3; o++) {
		let band = shippedOctave(d, k, drift, chop);
		band += shippedOctave(d, k, -drift, chop);
		h += band * amp;
		total += amp * 2;
		d = norm([d[1] * 0.8 + d[2] * 0.6, d[2] * 0.8 - d[0] * 0.6, d[0]]);
		k *= 1.9;
		amp *= 0.22;
		chop = chop + (1 - chop) * 0.2;
	}
	return (h / total - 0.5) * WAVE_HEIGHT;
}

/**
 * A patch of the field, sampled on a flat grid across the tangent plane.
 *
 * Metres across the plane rather than radians of direction, so a lag in the
 * autocorrelation is a distance and the numbers can be quoted in metres.
 */
function patch(
	field: (dir: Vec, seconds: number) => number,
	size: number,
	metres: number,
	seconds: number,
): Float32Array {
	const centre = norm([0.31, 0.62, 0.72]);
	let e1 = cross([0, 1, 0], centre);
	e1 = norm(e1);
	const e2 = norm(cross(centre, e1));
	const out = new Float32Array(size * size);
	const step = metres / size;
	for (let j = 0; j < size; j++) {
		for (let i = 0; i < size; i++) {
			const x = ((i - size / 2) * step) / RADIUS;
			const y = ((j - size / 2) * step) / RADIUS;
			const dir = norm(add(centre, add(scale(e1, x), scale(e2, y))));
			out[j * size + i] = field(dir, seconds);
		}
	}
	return out;
}

/**
 * How well the patch matches itself one wave over, at its best lag.
 *
 * A field of a few sines returns close to 1: shifted by a wavelength along the
 * direction the sines run, every crest lands on a crest. A field whose crests
 * differ from each other returns much less. Lags shorter than half a
 * wavelength are excluded, because every smooth field matches itself there.
 */
function regularity(
	heights: Float32Array,
	size: number,
	metres: number,
	wavelength: number,
): { peak: number; atMetres: number; atDegrees: number } {
	const step = metres / size;
	let mean = 0;
	for (const h of heights) mean += h;
	mean /= heights.length;
	let variance = 0;
	for (const h of heights) variance += (h - mean) * (h - mean);
	variance /= heights.length;

	let peak = -1;
	let atMetres = 0;
	let atDegrees = 0;
	const stride = 2;
	for (let a = 0; a < 90; a++) {
		const angle = (a * Math.PI) / 90;
		for (let r = wavelength * 0.5; r <= wavelength * 4; r += step) {
			const lx = Math.round((Math.cos(angle) * r) / step);
			const ly = Math.round((Math.sin(angle) * r) / step);
			if (Math.abs(lx) >= size / 2 || Math.abs(ly) >= size / 2) continue;
			let sum = 0;
			let count = 0;
			for (let j = Math.max(0, -ly); j < Math.min(size, size - ly); j += stride)
				for (let i = Math.max(0, -lx); i < Math.min(size, size - lx); i += stride) {
					sum +=
						(heights[j * size + i]! - mean) *
						(heights[(j + ly) * size + i + lx]! - mean);
					count++;
				}
			const value = sum / count / variance;
			if (value > peak) {
				peak = value;
				atMetres = r;
				atDegrees = (a * 180) / 90;
			}
		}
	}
	return { peak, atMetres, atDegrees };
}

/** Write an 8-bit RGB image as a PNG. */
function writePng(path: string, size: number, rgb: Uint8Array): void {
	const raw = Buffer.alloc(size * (size * 3 + 1));
	for (let j = 0; j < size; j++) {
		raw[j * (size * 3 + 1)] = 0;
		Buffer.from(rgb.buffer, j * size * 3, size * 3).copy(
			raw,
			j * (size * 3 + 1) + 1,
		);
	}
	const chunk = (tag: string, body: Buffer): Buffer => {
		const head = Buffer.alloc(8);
		head.writeUInt32BE(body.length, 0);
		head.write(tag, 4, "ascii");
		const crcTable: number[] = [];
		for (let n = 0; n < 256; n++) {
			let c = n;
			for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
			crcTable[n] = c >>> 0;
		}
		let crc = 0xffffffff;
		const over = Buffer.concat([head.subarray(4), body]);
		for (const byte of over) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
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

/**
 * The patch shaded from above: sun on the slope, and a hard highlight.
 *
 * The shading is the picture's whole job -- a height field printed as
 * brightness hides the shape a slope gives it, and it is the slope the eye
 * reads a wave from.
 */
function shade(heights: Float32Array, size: number, metres: number): Uint8Array {
	const step = metres / size;
	const rgb = new Uint8Array(size * size * 3);
	const sun = norm([0.4, 0.35, 0.85]);
	for (let j = 0; j < size; j++)
		for (let i = 0; i < size; i++) {
			const l = heights[j * size + Math.max(0, i - 1)]!;
			const r = heights[j * size + Math.min(size - 1, i + 1)]!;
			const d = heights[Math.max(0, j - 1) * size + i]!;
			const u = heights[Math.min(size - 1, j + 1) * size + i]!;
			const n = norm([-(r - l) / (2 * step), -(u - d) / (2 * step), 1]);
			const lambert = Math.max(0, dot(n, sun));
			const half = norm(add(sun, [0, 0, 1]));
			const spec = Math.pow(Math.max(0, dot(n, half)), 400);
			const base = 0.18 + 0.55 * lambert + 1.4 * spec;
			const at = (j * size + i) * 3;
			rgb[at] = Math.min(255, base * 110);
			rgb[at + 1] = Math.min(255, base * 150);
			rgb[at + 2] = Math.min(255, base * 205);
		}
	return rgb;
}


/**
 * The same patch as the vertex shader leaves it for the rasterizer.
 *
 * A sea patch is cut into at most 16 pieces a side and a chunk is 64 m, so a
 * vertex stands every 4 m and everything between two of them is the straight
 * line the rasterizer draws. The normal is worse off: the shader takes it from
 * a difference over 0.0004 radians, which on this planet is an arm of 2.72 m,
 * so the slope a fragment is shaded by is measured across most of a wave.
 */
function throughTheMesh(
	field: (dir: Vec, seconds: number) => number,
	size: number,
	metres: number,
	seconds: number,
	spacing: number,
	normalArc: number,
): { heights: Float32Array; normals: Float32Array } {
	const centre = norm([0.31, 0.62, 0.72]);
	const e1 = norm(cross([0, 1, 0], centre));
	const e2 = norm(cross(centre, e1));
	const at = (x: number, y: number): number =>
		field(norm(add(centre, add(scale(e1, x / RADIUS), scale(e2, y / RADIUS)))), seconds);

	// The vertex grid, and the two slopes the shader hands each vertex.
	const across = Math.ceil(metres / spacing) + 2;
	const vh = new Float32Array(across * across);
	const vnx = new Float32Array(across * across);
	const vny = new Float32Array(across * across);
	for (let j = 0; j < across; j++)
		for (let i = 0; i < across; i++) {
			const x = (i - across / 2) * spacing;
			const y = (j - across / 2) * spacing;
			const h = at(x, y);
			vh[j * across + i] = h;
			vnx[j * across + i] = (at(x + normalArc, y) - h) / normalArc;
			vny[j * across + i] = (at(x, y + normalArc) - h) / normalArc;
		}

	// What the rasterizer draws between them: linear in both.
	const heights = new Float32Array(size * size);
	const normals = new Float32Array(size * size * 2);
	const step = metres / size;
	for (let j = 0; j < size; j++)
		for (let i = 0; i < size; i++) {
			const x = (i - size / 2) * step;
			const y = (j - size / 2) * step;
			const gx = x / spacing + across / 2;
			const gy = y / spacing + across / 2;
			const i0 = Math.min(across - 2, Math.max(0, Math.floor(gx)));
			const j0 = Math.min(across - 2, Math.max(0, Math.floor(gy)));
			const tx = gx - i0;
			const ty = gy - j0;
			const lerp2 = (grid: Float32Array): number => {
				const a = grid[j0 * across + i0]! + (grid[j0 * across + i0 + 1]! - grid[j0 * across + i0]!) * tx;
				const b = grid[(j0 + 1) * across + i0]! + (grid[(j0 + 1) * across + i0 + 1]! - grid[(j0 + 1) * across + i0]!) * tx;
				return a + (b - a) * ty;
			};
			heights[j * size + i] = lerp2(vh);
			normals[(j * size + i) * 2] = lerp2(vnx);
			normals[(j * size + i) * 2 + 1] = lerp2(vny);
		}
	return { heights, normals };
}

/** Root-mean-square slope of a height grid, as a tangent. */
function rmsSlope(heights: Float32Array, size: number, metres: number): number {
	const step = metres / size;
	let sum = 0;
	let count = 0;
	for (let j = 1; j < size - 1; j++)
		for (let i = 1; i < size - 1; i++) {
			const gx = (heights[j * size + i + 1]! - heights[j * size + i - 1]!) / (2 * step);
			const gy = (heights[(j + 1) * size + i]! - heights[(j - 1) * size + i]!) / (2 * step);
			sum += gx * gx + gy * gy;
			count++;
		}
	return Math.sqrt(sum / count);
}

/** Shade from a slope field given per fragment rather than from the heights. */
function shadeSlopes(slopes: Float32Array, size: number): Uint8Array {
	const rgb = new Uint8Array(size * size * 3);
	const sun = norm([0.4, 0.35, 0.85]);
	const half = norm(add(sun, [0, 0, 1]));
	for (let at = 0; at < size * size; at++) {
		const n = norm([-slopes[at * 2]!, -slopes[at * 2 + 1]!, 1]);
		const lambert = Math.max(0, dot(n, sun));
		const spec = Math.pow(Math.max(0, dot(n, half)), 400);
		const base = 0.18 + 0.55 * lambert + 1.4 * spec;
		rgb[at * 3] = Math.min(255, base * 110);
		rgb[at * 3 + 1] = Math.min(255, base * 150);
		rgb[at * 3 + 2] = Math.min(255, base * 205);
	}
	return rgb;
}



/**
 * Which way the slopes face, and how much they agree.
 *
 * A field folded along two fixed axes has its crests running two ways and no
 * other, so the gradient directions pile into a few bins. The number is the
 * fullest bin divided by the average one: 1.0 is a field with no preferred
 * direction, and anything much over it is a weave a person can see.
 */
function anisotropy(
	heights: Float32Array,
	size: number,
	metres: number,
): { ratio: number; degrees: number } {
	const step = metres / size;
	const BINS = 36;
	const bins = new Float64Array(BINS);
	for (let j = 1; j < size - 1; j++)
		for (let i = 1; i < size - 1; i++) {
			const gx = (heights[j * size + i + 1]! - heights[j * size + i - 1]!) / (2 * step);
			const gy = (heights[(j + 1) * size + i]! - heights[(j - 1) * size + i]!) / (2 * step);
			const power = gx * gx + gy * gy;
			if (power < 1e-9) continue;
			// Modulo half a turn: a crest has no front and no back.
			let angle = Math.atan2(gy, gx);
			if (angle < 0) angle += Math.PI;
			bins[Math.min(BINS - 1, Math.floor((angle / Math.PI) * BINS))] += power;
		}
	let total = 0;
	let peak = 0;
	let at = 0;
	for (let b = 0; b < BINS; b++) {
		total += bins[b]!;
		if (bins[b]! > peak) {
			peak = bins[b]!;
			at = b;
		}
	}
	return { ratio: (peak * BINS) / total, degrees: (at * 180) / BINS };
}

/**
 * The shipped field with the two things that make it a weave taken out.
 *
 * The fold stays -- a crest with a length and a width is what makes it read as
 * water -- and two things change. **The two bands are given independent phase
 * offsets from noise instead of a shared offset of the sample point.** A
 * shared offset slides the whole pattern sideways and leaves its geometry
 * intact, which is why the crests still line up across a bay; two offsets
 * shear it, so the angle the crests cross at varies from place to place.
 * **And the octaves are given a gain the eye can see.** At 0.22 the second
 * octave is a fifth of the first and the third a twentieth, so the surface is
 * one wavelength wearing a texture; at 0.5 it is three.
 */
export interface Shear {
	/** Radians of phase each band is bent by, independently of the other. */
	shear: number;
	/** How many wavelengths one bend of the shear field runs over. */
	shearOver: number;
	/** How many octaves are given their own bend before the rest go unbent. */
	shearOctaves: number;
	/** How many octaves are summed. */
	octaves: number;
	/** What each octave is worth against the one before it. */
	gain: number;
	/** How far a slow field raises and flattens the whole swell. */
	groups: number;
}

/** One octave, with a phase per band rather than one for both. */
function shearedOctave(
	d: Vec,
	k: number,
	phaseA: number,
	phaseB: number,
	chop: number,
): number {
	const a = dot(d, AXIS_A) * k + phaseA;
	const b = dot(d, AXIS_B) * k + phaseB;
	const wa = 1 - Math.abs(Math.sin(a));
	const wb = 1 - Math.abs(Math.sin(b));
	const wx = wa + (Math.abs(Math.cos(a)) - wa) * wa;
	const wy = wb + (Math.abs(Math.cos(b)) - wb) * wb;
	return Math.pow(1 - Math.pow(wx * wy, 0.65), chop);
}

export function shearedSwell(dir: Vec, seconds: number, s: Shear): number {
	let k = (2 * Math.PI * RADIUS) / Math.max(1, WAVE_SCALE);
	const k0 = k;
	let chop = Math.max(1, CHOP);
	let d = dir;
	let h = 0;
	let amp = 1;
	let total = 0;
	const drift = seconds * 0.8;
	for (let o = 0; o < s.octaves; o++) {
		// The bend is read well below this octave's own frequency, so the
		// crests stay coherent over a train and the angle they cross at
		// drifts over many of them.
		let shearA = 0;
		let shearB = 0;
		if (o < s.shearOctaves) {
			const wf = k / s.shearOver;
			const p: Vec = [d[0] * wf, d[1] * wf, d[2] * wf];
			shearA = vnoise3(p[0] + 19.3, p[1] + 7.7, p[2] + 3.1) * s.shear;
			shearB = vnoise3(p[0] - 5.2, p[1] + 11.9, p[2] + 23.4) * s.shear;
		}
		let band = shearedOctave(d, k, drift + shearA, drift + shearB, chop);
		band += shearedOctave(d, k, -drift + shearA, -drift + shearB, chop);
		h += band * amp;
		total += amp * 2;
		d = norm([d[1] * 0.8 + d[2] * 0.6, d[2] * 0.8 - d[0] * 0.6, d[0]]);
		k *= 1.9;
		amp *= s.gain;
		chop = chop + (1 - chop) * 0.2;
	}
	let height = h / total - 0.5;
	if (s.groups > 0) {
		const gf = k0 / 12;
		const g = vnoise3(dir[0] * gf + 51.1, dir[1] * gf + 3.3, dir[2] * gf - 8.8);
		height *= 1 + s.groups * g;
	}
	return height * WAVE_HEIGHT;
}

const SIZE = 512;
const SPANS = [400, 1600];

/** A sea patch at full detail: 64 m chunk cut 16 ways. */
const VERTEX_SPACING = 4;

/** 0.0004 radians of the shipped normal step, in metres on this planet. */
const NORMAL_ARC = 0.0004 * RADIUS;

for (const span of SPANS) {
	const heights = patch(shippedSwell, SIZE, span, 0);
	writePng(`${OUT}/shipped-${span}m.png`, SIZE, shade(heights, SIZE, span));
	const score = regularity(heights, SIZE, span, WAVE_SCALE);
	console.log(
		`shipped field, ${span} m across: repeats at ${score.peak.toFixed(3)} ` +
			`(lag ${score.atMetres.toFixed(0)} m, ${score.atDegrees.toFixed(0)} deg), ` +
			`rms slope ${rmsSlope(heights, SIZE, span).toFixed(4)}`,
	);
}

// What survives the vertex grid, and what the shading is actually given.
const span = 400;
const truth = patch(shippedSwell, SIZE, span, 0);
const mesh = throughTheMesh(shippedSwell, SIZE, span, 0, VERTEX_SPACING, NORMAL_ARC);
writePng(`${OUT}/shipped-through-mesh-${span}m.png`, SIZE, shadeSlopes(mesh.normals, SIZE));
writePng(`${OUT}/shipped-mesh-heights-${span}m.png`, SIZE, shade(mesh.heights, SIZE, span));
console.log(
	`\nthrough the mesh, ${span} m across, a vertex every ${VERTEX_SPACING} m:`,
);
console.log(
	`  rms slope: field ${rmsSlope(truth, SIZE, span).toFixed(4)}, ` +
		`mesh heights ${rmsSlope(mesh.heights, SIZE, span).toFixed(4)}`,
);
let shaded = 0;
for (let at = 0; at < SIZE * SIZE; at++)
	shaded += mesh.normals[at * 2]! ** 2 + mesh.normals[at * 2 + 1]! ** 2;
console.log(
	`  rms slope the fragment is shaded by: ${Math.sqrt(shaded / (SIZE * SIZE)).toFixed(4)} ` +
		`(a ${NORMAL_ARC.toFixed(2)} m arm)`,
);

console.log("");
for (const across of SPANS) {
	const field = patch(shippedSwell, SIZE, across, 0);
	const a = anisotropy(field, SIZE, across);
	console.log(
		`shipped                      ${String(across).padStart(5)} m: ` +
			`slopes agree ${a.ratio.toFixed(2)}x at ${a.degrees.toFixed(0)} deg`,
	);
}

const BASE = { shear: 12, gain: 0.4, shearOver: 16, groups: 0.5, shearOctaves: 2 };
const CANDIDATES: { name: string; shear: Shear }[] = [
	{ name: "3 octaves, gain 0.4", shear: { ...BASE, octaves: 3 } },
	{ name: "4 octaves, gain 0.4", shear: { ...BASE, octaves: 4 } },
];
console.log("");
for (const candidate of CANDIDATES) {
	for (const across of SPANS) {
		const field = patch((d, t) => shearedSwell(d, t, candidate.shear), SIZE, across, 0);
		const a = anisotropy(field, SIZE, across);
		const r = regularity(field, SIZE, across, WAVE_SCALE);
		const slug = candidate.name.replace(/[^a-z0-9]+/g, "-");
		writePng(`${OUT}/${slug}-${across}m.png`, SIZE, shade(field, SIZE, across));
		console.log(
			`${candidate.name.padEnd(28)} ${String(across).padStart(5)} m: ` +
				`slopes agree ${a.ratio.toFixed(2)}x at ${a.degrees.toFixed(0)} deg, ` +
				`repeats at ${r.peak.toFixed(3)}, rms slope ${rmsSlope(field, SIZE, across).toFixed(4)}`,
		);
	}
}

// The chosen field, and what the vertex grid leaves of it. The narrowest
// octave has to stay wide enough for the vertices to draw, or the surface
// gains crests that move as the camera does.
console.log("");
for (const octaves of [3, 4]) {
	const field = { ...BASE, octaves };
	const across = 400;
	const truthField = patch((d, t) => shearedSwell(d, t, field), SIZE, across, 0);
	const through = throughTheMesh(
		(d, t) => shearedSwell(d, t, field),
		SIZE,
		across,
		0,
		VERTEX_SPACING,
		NORMAL_ARC,
	);
	writePng(
		`${OUT}/chosen-${octaves}-through-mesh.png`,
		SIZE,
		shadeSlopes(through.normals, SIZE),
	);
	// How far the drawn surface stands from the field it is drawn from.
	let error = 0;
	for (let at = 0; at < SIZE * SIZE; at++)
		error += (through.heights[at]! - truthField[at]!) ** 2;
	console.log(
		`${octaves} octaves at a vertex every ${VERTEX_SPACING} m: ` +
			`narrowest wave ${(WAVE_SCALE / 1.9 ** (octaves - 1)).toFixed(1)} m, ` +
			`rms slope ${rmsSlope(truthField, SIZE, across).toFixed(4)} field ` +
			`-> ${rmsSlope(through.heights, SIZE, across).toFixed(4)} drawn, ` +
			`rms miss ${Math.sqrt(error / (SIZE * SIZE)).toFixed(3)} m`,
	);
}

