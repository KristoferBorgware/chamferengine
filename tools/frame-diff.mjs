#!/usr/bin/env node
// How much two frames of the same view differ, pixel by pixel.
//
//   node tools/frame-diff.mjs <a.png> <b.png> [--skip 0,0,540,200]
//
// Written for one question: is the light on the terrain directional? Take two
// frames from one camera with the sun at the same height and opposite sides of
// the sky. Light that comes from a direction moves between the faces -- one
// side of every block gains what the other loses. Light that does not is the
// same number over the whole picture, and the two frames come out the same.
//
// The reading is the spread of the per-pixel ratio between them. A ratio of 1
// everywhere with no spread is a picture that did not change; a wide spread is
// one where some faces brightened while others darkened.
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

/** A PNG as width, height and one byte per channel, RGB. */
function readPng(path) {
	const file = readFileSync(path);
	let at = 8;
	let width = 0;
	let height = 0;
	let depth = 0;
	let kind = 0;
	const parts = [];
	while (at < file.length) {
		const length = file.readUInt32BE(at);
		const tag = file.toString("ascii", at + 4, at + 8);
		const body = file.subarray(at + 8, at + 8 + length);
		if (tag === "IHDR") {
			width = body.readUInt32BE(0);
			height = body.readUInt32BE(4);
			depth = body[8];
			kind = body[9];
		} else if (tag === "IDAT") parts.push(body);
		else if (tag === "IEND") break;
		at += 12 + length;
	}
	if (depth !== 8) throw new Error(`${path}: ${depth} bits a channel`);
	const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[kind];
	if (!channels) throw new Error(`${path}: color type ${kind}`);
	const raw = inflateSync(Buffer.concat(parts));
	const stride = width * channels;
	const out = new Uint8Array(width * height * 3);
	const line = new Uint8Array(stride);
	const previous = new Uint8Array(stride);
	let read = 0;
	for (let row = 0; row < height; row++) {
		const filter = raw[read++];
		for (let i = 0; i < stride; i++) {
			const x = raw[read + i];
			const a = i >= channels ? line[i - channels] : 0;
			const b = previous[i];
			const c = i >= channels ? previous[i - channels] : 0;
			let value = x;
			if (filter === 1) value = x + a;
			else if (filter === 2) value = x + b;
			else if (filter === 3) value = x + ((a + b) >> 1);
			else if (filter === 4) {
				const p = a + b - c;
				const pa = Math.abs(p - a);
				const pb = Math.abs(p - b);
				const pc = Math.abs(p - c);
				value = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
			}
			line[i] = value & 0xff;
		}
		read += stride;
		for (let x = 0; x < width; x++) {
			const from = x * channels;
			const to = (row * width + x) * 3;
			out[to] = line[from];
			out[to + 1] = channels >= 3 ? line[from + 1] : line[from];
			out[to + 2] = channels >= 3 ? line[from + 2] : line[from];
		}
		previous.set(line);
	}
	return { width, height, rgb: out };
}

const args = process.argv.slice(2);
const a = readPng(args[0]);
const b = readPng(args[1]);
if (a.width !== b.width || a.height !== b.height)
	throw new Error("two different sizes");
const flag = (name, fallback) => {
	const at = args.indexOf(name);
	return at < 0 ? fallback : args[at + 1];
};
// The readout is drawn over the world and says different things in the two
// frames, so it is left out.
const [sx, sy, sw, sh] = flag("--skip", "0,0,540,200").split(",").map(Number);
// A box to compare and nothing else, for a question about one thing in the
// picture rather than about the whole of it.
const only = flag("--only", "");
const [ox, oy, ow, oh] = only ? only.split(",").map(Number) : [0, 0, 0, 0];

const ratios = [];
let sumA = 0;
let sumB = 0;
let moved = 0;
let counted = 0;
for (let y = 0; y < a.height; y++) {
	for (let x = 0; x < a.width; x++) {
		if (x >= sx && x < sx + sw && y >= sy && y < sy + sh) continue;
		if (only && (x < ox || x >= ox + ow || y < oy || y >= oy + oh))
			continue;
		const at = (y * a.width + x) * 3;
		const la = (a.rgb[at] + a.rgb[at + 1] + a.rgb[at + 2]) / 3;
		const lb = (b.rgb[at] + b.rgb[at + 1] + b.rgb[at + 2]) / 3;
		// Pixels too dark to carry a ratio say nothing about the light.
		if (la < 6 || lb < 6) continue;
		counted++;
		sumA += la;
		sumB += lb;
		moved += Math.abs(la - lb);
		ratios.push(la / lb);
	}
}
ratios.sort((x, y) => x - y);
const mean = ratios.reduce((s, r) => s + r, 0) / ratios.length;
let spread = 0;
for (const r of ratios) spread += (r - mean) * (r - mean);
spread = Math.sqrt(spread / ratios.length);
const pick = (f) => ratios[Math.min(ratios.length - 1, Math.floor(f * ratios.length))];
console.log(`${counted} pixels compared`);
console.log(
	`  mean brightness ${(sumA / counted).toFixed(1)} against ${(sumB / counted).toFixed(1)}`,
);
console.log(`  mean absolute move ${(moved / counted).toFixed(2)} of 255`);
console.log(
	`  ratio ${mean.toFixed(3)} +- ${spread.toFixed(3)} ` +
		`(${(100 * spread) / mean > 0 ? ((100 * spread) / mean).toFixed(1) : "0"}% spread), ` +
		`5th ${pick(0.05).toFixed(3)}, 95th ${pick(0.95).toFixed(3)}`,
);
