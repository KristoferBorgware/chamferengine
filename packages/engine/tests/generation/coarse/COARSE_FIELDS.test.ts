import { describe, expect, it } from "vitest";
import {
	BLOCK_COLORS,
	BlockType,
	COARSE_FIELDS,
	COARSE_STAGES,
	CoarseMap,
	GROUND_LINES,
	coarseFieldOf,
	flatCoarseMap,
} from "chamfer/generation";

/**
 * The map holds its fields as typed properties and the table describes them,
 * which is two places that have to agree. Nothing in the type system makes
 * them, so these tests do.
 */
describe("COARSE_FIELDS", () => {
	const map = flatCoarseMap(1, 3);

	/** Every `Float32Array` on a map is a field, and every field is drawable. */
	const arraysOnTheMap = Object.entries(map).filter(
		([, value]) => value instanceof Float32Array,
	);

	it("describes every field the map carries", () => {
		const described = new Set(COARSE_FIELDS.map((f) => f.key));
		for (const [name] of arraysOnTheMap)
			expect(
				described.has(name as never),
				`${name} is a field on CoarseMap with no entry in COARSE_FIELDS, so the editor cannot draw it`,
			).toBe(true);
	});

	it("describes nothing the map does not carry", () => {
		const onTheMap = new Set(arraysOnTheMap.map(([name]) => name));
		for (const field of COARSE_FIELDS)
			expect(
				onTheMap.has(field.key),
				`COARSE_FIELDS names ${field.key}, which is not a field on CoarseMap`,
			).toBe(true);
	});

	it("reads the array its key names", () => {
		for (const field of COARSE_FIELDS) {
			const array = coarseFieldOf(map, field);
			expect(array).toBeInstanceOf(Float32Array);
			expect(array.length).toBe(map.count);
			expect(array).toBe(map[field.key]);
		}
	});

	it("gives every ramp two stops or more and a range that is not empty", () => {
		for (const field of COARSE_FIELDS) {
			expect(field.ramp.stops.length, field.key).toBeGreaterThanOrEqual(
				2,
			);
			expect(field.ramp.high, field.key).toBeGreaterThan(field.ramp.low);
			for (const stop of field.ramp.stops)
				for (const channel of stop) {
					expect(channel, field.key).toBeGreaterThanOrEqual(0);
					expect(channel, field.key).toBeLessThanOrEqual(1);
				}
		}
	});

	it("names a step of the build it stops at", () => {
		// A picture that does not need the slow step must not wait for it, and
		// the pane's own entry is where that is stated.
		for (const field of COARSE_FIELDS)
			expect(COARSE_STAGES, field.id).toContain(field.stage);
	});

	it("puts sea level where a ramp changes color, not part way through one", () => {
		// The waterline is the one place a reader has to be able to trust, and
		// a ramp that runs a colour across it draws the last few metres of
		// water as beach. A blended ramp lands it on a stop, which needs an odd
		// count over a symmetric range; a banded one lands it on a band edge.
		for (const field of COARSE_FIELDS) {
			const { low, high, stops, hard } = field.ramp;
			if (!hard) {
				expect(low, field.id).toBe(-high);
				expect(stops.length % 2, field.id).toBe(1);
				continue;
			}
			const width = (high - low) / stops.length;
			expect(-low / width, field.id).toBe(Math.round(-low / width));
		}
	});

	it("bands the ground picture on the elevations the world builds to", () => {
		// The map and the world are two drawings of one thing, and colour is
		// what both of them draw. They agree only if the band edges are the
		// same numbers the materials are chosen by, so a colour moved on one
		// side without the other is caught here rather than by standing on
		// white ground beside a green pixel.
		const ground = COARSE_FIELDS.find((f) => f.id === "ground")!;
		const { low, high, stops } = ground.ramp;
		expect(ground.ramp.hard).toBe(true);
		const width = (high - low) / stops.length;
		const bandOf = (metres: number): number => (metres - low) / width;
		for (const line of [0, GROUND_LINES.rock, GROUND_LINES.snow])
			expect(bandOf(line), `${line} m`).toBe(Math.round(bandOf(line)));

		// And the colour of each land band is the block that band builds.
		expect(stops[bandOf(GROUND_LINES.rock) - 1]).toEqual(
			BLOCK_COLORS[BlockType.GRASS],
		);
		expect(stops[bandOf(GROUND_LINES.rock)]).toEqual(
			BLOCK_COLORS[BlockType.STONE],
		);
		expect(stops[bandOf(GROUND_LINES.snow)]).toEqual(
			BLOCK_COLORS[BlockType.SNOW],
		);
		expect(bandOf(GROUND_LINES.snow)).toBe(stops.length - 1);
	});

	it("names each picture once", () => {
		const ids = COARSE_FIELDS.map((f) => f.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("is what CoarseMap hands to a worker", () => {
		const back = CoarseMap.fromSnapshot(map.toSnapshot());
		for (const field of COARSE_FIELDS)
			expect(coarseFieldOf(back, field).length, field.key).toBe(
				map.count,
			);
	});
});
