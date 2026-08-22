import { describe, expect, it } from "vitest";
import type { BenchSheet } from "../src/BenchMessage.js";
import { BLOCK_COLORS, BlockType } from "chamfer/generation";
import { BAND_COLORS, paintPatch } from "../src/paintPatch.js";
import { PATCH_PICTURES } from "../src/PatchLook.js";
import { SEA_COLORS } from "chamfer/render";
import { outlinePatch } from "../src/outlinePatch.js";
import { paintSheet } from "../src/paintSheet.js";

const W = 32;
const H = 16;

/** A rectangle with something in every field, so no picture reads a flat one. */
function sheet(): BenchSheet {
	const count = W * H;
	const of = (f: (at: number) => number): Float32Array<ArrayBuffer> =>
		Float32Array.from({ length: count }, (_, at) => f(at));
	return {
		width: W,
		height: H,
		metres: of((at) => (at % 40) * 30 - 300),
		raw: of((at) => Math.sin(at) * 0.8),
		terrain: of((at) => (at % 11) / 10),
		mountain: of((at) => ((at * 7) % 13) / 12),
		cut: of((at) => Math.cos(at) * 4),
		cutScale: 4,
		rawLow: -1,
		rawHigh: 1,
		low: -300,
		high: 900,
	};
}

const paint = (picture: (typeof PATCH_PICTURES)[number]): Uint8ClampedArray => {
	const px = new Uint8ClampedArray(W * H * 4);
	paintSheet(sheet(), picture, px);
	return px;
};

describe("paintSheet", () => {
	it("leaves no pixel unpainted, in any picture", () => {
		for (const picture of PATCH_PICTURES) {
			const px = paint(picture);
			for (let at = 0; at < W * H; at++)
				expect(px[at * 4 + 3], `${picture} pixel ${at}`).toBe(255);
		}
	});

	/**
	 * The whole point of sending samples rather than pixels: six pictures of
	 * one sheet, each one a different reading of it.
	 */
	it("draws six different pictures of the same samples", () => {
		const seen = new Set<string>();
		for (const picture of PATCH_PICTURES)
			seen.add(paint(picture).join(","));
		expect(seen.size).toBe(PATCH_PICTURES.length);
	});

	it("reads the mountain layer for the mountain picture and the terrain layer for the terrain one", () => {
		expect(paint("terrain").join(",")).not.toBe(
			paint("mountain").join(","),
		);
	});
});

describe("the bench's colours", () => {
	/**
	 * **A preview whose green is a near-miss of the world's green answers a
	 * slightly different question than the one asked of it.** The bands used to
	 * be four literals typed beside the engine's four, which is two lists that
	 * drift apart the first time either is retuned.
	 */
	it("paints with the engine's own block colours", () => {
		expect(BAND_COLORS[0]).toBe(BLOCK_COLORS[BlockType.SAND]);
		expect(BAND_COLORS[1]).toBe(BLOCK_COLORS[BlockType.GRASS]);
		expect(BAND_COLORS[2]).toBe(BLOCK_COLORS[BlockType.STONE]);
		expect(BAND_COLORS[3]).toBe(BLOCK_COLORS[BlockType.SNOW]);
	});

	it("takes deep water to the sea's own deep colour", () => {
		const px = new Uint8ClampedArray(4);
		// Far under the water, where a look reaches no floor at all.
		paintPatch(px, 0, {
			metres: -400,
			raw: 0,
			layer: 0,
			cut: 0,
			cutScale: 1,
			rawLow: -1,
			rawHigh: 1,
			low: -400,
			high: 400,
			picture: "ground",
		});
		const want = SEA_COLORS.deep.map((v) =>
			Math.round(255 * Math.pow(v, 1 / 2.2)),
		);
		for (let ch = 0; ch < 3; ch++)
			expect(Math.abs(px[ch]! - want[ch]!)).toBeLessThanOrEqual(1);
	});
});

describe("outlinePatch", () => {
	it("marks the middle of the picture for a patch at zero, zero", () => {
		const px = new Uint8ClampedArray(W * H * 4);
		outlinePatch(px, W, H, {
			latitude: 0,
			longitude: 0,
			span: 2000,
			radius: 4000,
		});
		let marked = 0;
		let leftmost = W;
		for (let y = 0; y < H; y++)
			for (let x = 0; x < W; x++)
				if (px[(y * W + x) * 4 + 3] === 255) {
					marked++;
					if (x < leftmost) leftmost = x;
				}
		expect(marked).toBeGreaterThan(0);
		// Longitude zero is the middle column, and the ring is drawn around it.
		expect(leftmost).toBeGreaterThan(0);
		expect(leftmost).toBeLessThan(W / 2);
	});

	it("writes nothing outside the picture", () => {
		const px = new Uint8ClampedArray(W * H * 4);
		outlinePatch(px, W, H, {
			latitude: 89,
			longitude: 179,
			span: 9000,
			radius: 4000,
		});
		expect(px.length).toBe(W * H * 4);
	});
});
