import { describe, expect, it } from "vitest";
import {
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

	it("gives every picture a range that is not empty", () => {
		for (const field of COARSE_FIELDS)
			expect(field.ramp.high, field.key).toBeGreaterThan(field.ramp.low);
	});

	it("names a step of the build it stops at", () => {
		// A picture that does not need the slow step must not wait for it, and
		// the pane's own entry is where that is stated.
		for (const field of COARSE_FIELDS)
			expect(COARSE_STAGES, field.id).toContain(field.stage);
	});

	it("holds every material line inside the range it draws against", () => {
		// **The colours are not here any more and the range still is.** Which
		// block stands at a height is `GROUND_LINES` and the client's one
		// painter reads it there, so a colour cannot drift away from the world
		// by being written down twice. What a picture still owns is the two
		// ends it is stretched between, and a line outside them is a material
		// the picture cannot show: the grey pictures would saturate before
		// reaching it, and nothing would say so.
		for (const field of COARSE_FIELDS)
			for (const line of [0, GROUND_LINES.rock, GROUND_LINES.snow]) {
				expect(line, `${field.id} at ${line} m`).toBeGreaterThanOrEqual(
					field.ramp.low,
				);
				expect(line, `${field.id} at ${line} m`).toBeLessThanOrEqual(
					field.ramp.high,
				);
			}
	});

	it("keeps sea level and both material lines on one grid", () => {
		// The waterline is the one place a reader has to be able to trust. It
		// and the two material lines land on a 100 m grid, and each picture's
		// own ends land on the same grid, so no end cuts a band in half.
		for (const field of COARSE_FIELDS)
			for (const metres of [
				field.ramp.low,
				field.ramp.high,
				0,
				GROUND_LINES.rock,
				GROUND_LINES.snow,
			])
				expect(Math.abs(metres % 100), `${field.id} at ${metres} m`).toBe(0);
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
