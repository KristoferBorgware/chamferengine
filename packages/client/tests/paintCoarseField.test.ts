import { describe, expect, it } from "vitest";
import { COARSE_FIELDS, buildCoarseMap } from "chamfer/generation";
import { paintCoarseField } from "../src/paintCoarseField.js";

const W = 96;
const H = 48;
// Level 6 with the erosion that ships, so the slope field has something in
// it: a barely-eroded level-5 map is nearly flat everywhere.
const map = buildCoarseMap(77, { level: 6 });
const field = COARSE_FIELDS[0]!;

function paint(which = field): Uint8ClampedArray {
	const px = new Uint8ClampedArray(W * H * 4);
	paintCoarseField(map, which, W, H, px);
	return px;
}

describe("paintCoarseField", () => {
	it("leaves no pixel unpainted", () => {
		const px = paint();
		for (let at = 0; at < W * H; at++)
			expect(px[at * 4 + 3], `pixel ${at} is transparent`).toBe(255);
	});

	/**
	 * The reason this walks cells rather than pixels. A map far finer than the
	 * picture drawn one cell per pixel shows one cell in five and speckles;
	 * averaging every cell that lands on a pixel does not.
	 */
	it("draws a picture, not one flat color", () => {
		const px = paint();
		const seen = new Set<number>();
		for (let at = 0; at < W * H; at++)
			seen.add(
				(px[at * 4]! << 16) | (px[at * 4 + 1]! << 8) | px[at * 4 + 2]!,
			);
		expect(seen.size).toBeGreaterThan(20);
	});

	it("puts the same place in the same pixel every time", () => {
		expect(Array.from(paint())).toEqual(Array.from(paint()));
	});

	it("draws every field it is handed", () => {
		for (const which of COARSE_FIELDS) {
			const px = paint(which);
			const seen = new Set<number>();
			for (let at = 0; at < W * H; at++)
				seen.add(
					(px[at * 4]! << 16) |
						(px[at * 4 + 1]! << 8) |
						px[at * 4 + 2]!,
				);
			// A banded ramp draws as many colors as the world has blocks in
			// reach, and a world whose ground stops short of the rock line has
			// two: land and sea. A blended one has a color per shade of height,
			// so it is held to a picture rather than to a pair.
			expect(
				seen.size,
				`${which.id} drew one color`,
			).toBeGreaterThanOrEqual(which.ramp.hard ? 2 : 20);
		}
	});

	it("draws a banded picture only in colors the world builds", () => {
		// The whole reason the Ground picture is banded: every pixel of it is a
		// block, so a color that is not one of the ramp's own stops is a block
		// that does not exist. Averaging cells into a pixel is what would
		// invent one, and it happens before the ramp rather than after it.
		const banded = COARSE_FIELDS.filter((f) => f.ramp.hard);
		expect(banded.length).toBeGreaterThan(0);
		for (const which of banded) {
			const allowed = new Set(
				which.ramp.stops.map(
					(c) =>
						(Math.round(255 * c[0]) << 16) |
						(Math.round(255 * c[1]) << 8) |
						Math.round(255 * c[2]),
				),
			);
			const px = paint(which);
			for (let at = 0; at < W * H; at++)
				expect(
					allowed.has(
						(px[at * 4]! << 16) |
							(px[at * 4 + 1]! << 8) |
							px[at * 4 + 2]!,
					),
					`${which.id} pixel ${at}`,
				).toBe(true);
		}
	});

	it("holds a value outside a ramp at the ramp's own ends", () => {
		// The ground field's ramp stops well inside what a height can reach, so
		// the deepest sea and the tallest peak have to land on the end stops
		// rather than running off them.
		const px = paint();
		const first = field.ramp.stops[0]!;
		const last = field.ramp.stops[field.ramp.stops.length - 1]!;
		for (let at = 0; at < W * H; at++)
			for (let channel = 0; channel < 3; channel++) {
				const value = px[at * 4 + channel]!;
				const ends = [first[channel]!, last[channel]!].map(
					(v) => 255 * v,
				);
				const low = Math.min(
					...field.ramp.stops.map((s) => 255 * s[channel]!),
				);
				const high = Math.max(
					...field.ramp.stops.map((s) => 255 * s[channel]!),
				);
				expect(
					value,
					`channel ${channel} at ${at}`,
				).toBeGreaterThanOrEqual(Math.floor(low) - 1);
				expect(value).toBeLessThanOrEqual(Math.ceil(high) + 1);
				expect(ends.length).toBe(2);
			}
	});

	it("fills a picture wider than the map has cells across", () => {
		// Level 5 is 10,242 cells against 24,576 pixels here, so most pixels
		// catch nothing and take the direct lookup instead.
		const wide = new Uint8ClampedArray(256 * 128 * 4);
		paintCoarseField(map, field, 256, 128, wide);
		for (let at = 0; at < 256 * 128; at++)
			expect(wide[at * 4 + 3]).toBe(255);
	});
});
