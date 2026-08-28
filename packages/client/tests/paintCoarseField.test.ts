import { describe, expect, it } from "vitest";
import {
	COARSE_FIELDS,
	GROUND_LINES,
	buildCoarseMap,
	coarseFieldOf,
	makeBlend,
	readBlend,
} from "chamfer/generation";
import { positionOf } from "chamfer/coordinates";
import { paintPatch } from "../src/paintPatch.js";
import { paintCoarseField } from "../src/paintCoarseField.js";

const W = 96;
const H = 48;
// **A planet big enough for the layers that ship.** The continentalness layer
// is 6,000 m across at its widest and a level-6 map at 32 m cells is a planet
// 1,700 m in radius, so the widest octave is three times the world: the field
// never crosses the curve's middle and the map comes out entirely ocean, which
// draws in one colour. At 100 m cells the planet is 5,313 m and 22% of it is
// land (F-093).
const map = buildCoarseMap(77, { level: 6, cellMetres: 100 });
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
	 * The reason a pixel takes a blend rather than the one cell it lands on. A
	 * map far finer than the picture drawn one cell per pixel shows one cell in
	 * five and speckles; the blend of the three cells around the direction does
	 * not.
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
			// Land, sea, the depth of the water and a contour line every
			// hundred metres: a picture of a planet is never a handful of
			// colours, whichever of the two it is.
			expect(
				seen.size,
				`${which.id} drew one color`,
			).toBeGreaterThanOrEqual(20);
		}
	});

	it("names a block on land and water over the sea", () => {
		// **The Ground picture is bands, and the bands are the world's own
		// materials.** What is checked is which channel leads rather than the
		// exact triple, because the painter is the bench's: land takes a
		// contour line every hundred metres and the sea is the floor seen
		// through however much water stands over it, so neither lands on a
		// stop exactly. Grass leads in green, water in blue, and snow is
		// bright in all three.
		const which = COARSE_FIELDS.find((f) => f.id === "ground")!;
		const px = paint(which);
		const blend = makeBlend();
		const values = coarseFieldOf(map, which);
		let land = 0;
		let sea = 0;
		for (let r = 0; r < H; r++)
			for (let q = 0; q < W; q++) {
				const dir = positionOf(
					{
						latitude: (0.5 - (r + 0.5) / H) * 180,
						longitude: ((q + 0.5) / W) * 360 - 180,
						altitude: 0,
					},
					1,
				);
				map.index.blendInto(dir, blend);
				const metres = readBlend(values, blend);
				const at = (r * W + q) * 4;
				const [red, green, blue] = [px[at]!, px[at + 1]!, px[at + 2]!];
				// **At the waterline the sea is sand**, because what makes
				// water blue here is how much of it a look passes through and
				// at the shore that is none -- and the shallows above it are
				// the teal the ocean shell is drawn in, whose green leads its
				// blue. What is blue is a deep, so that is where this asks.
				if (metres < -150) {
					sea++;
					expect(blue, `sea at ${r},${q}`).toBeGreaterThan(red);
				} else if (metres > 0 && metres < GROUND_LINES.rock) {
					land++;
					expect(green, `grass at ${r},${q}`).toBeGreaterThan(red);
					expect(green).toBeGreaterThan(blue);
				}
			}
		// A picture of one material tests nothing about the other.
		expect(land).toBeGreaterThan(100);
		expect(sea).toBeGreaterThan(100);
	});

	it("holds a height past the last material line at that material", () => {
		// The material lines stop well inside what a height can reach, so the
		// deepest sea and the tallest peak have to land on the end materials
		// rather than running off them.
		const px = new Uint8ClampedArray(4);
		for (const metres of [-5000, 5000]) {
			paintPatch(px, 0, {
				metres,
				raw: metres,
				layer: 0,
				rawLow: -400,
				rawHigh: 400,
				low: -400,
				high: 400,
				picture: "ground",
			});
			for (let channel = 0; channel < 3; channel++) {
				expect(
					px[channel],
					`channel ${channel} at ${metres}`,
				).toBeGreaterThanOrEqual(0);
				expect(px[channel]).toBeLessThanOrEqual(255);
			}
			expect(px[3]).toBe(255);
		}
		// Under the sea it is water and over the snow line it is snow, at any
		// distance past either.
		paintPatch(px, 0, {
			metres: 5000,
			raw: 0,
			layer: 0,
			rawLow: -400,
			rawHigh: 400,
			low: -400,
			high: 400,
			picture: "ground",
		});
		expect(px[0]).toBeGreaterThan(200);
		expect(px[1]).toBeGreaterThan(200);
		expect(px[2]).toBeGreaterThan(200);
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
