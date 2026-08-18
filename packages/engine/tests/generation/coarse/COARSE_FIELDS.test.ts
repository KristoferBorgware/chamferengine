import { describe, expect, it } from "vitest";
import {
	COARSE_FIELDS,
	CoarseMap,
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

	it("draws a difference only against a field the map carries", () => {
		const onTheMap = new Set(arraysOnTheMap.map(([name]) => name));
		for (const field of COARSE_FIELDS) {
			if (!field.against) continue;
			expect(
				onTheMap.has(field.against),
				`${field.key} is drawn against ${field.against}, which is not a field on CoarseMap`,
			).toBe(true);
			expect(field.against, field.key).not.toBe(field.key);
		}
	});

	it("puts sea level on a stop of the terrain ramp, not between two", () => {
		// The ground ramp is metres above sea level and symmetric about it, so
		// an odd stop count lands the middle stop at a height of zero and the
		// waterline is one named color. An even count puts it halfway between
		// two, which is where the last few metres of water drew as beach.
		const ground = COARSE_FIELDS.find((f) => f.key === "height")!;
		expect(ground.ramp.low).toBe(-ground.ramp.high);
		expect(ground.ramp.stops.length % 2).toBe(1);
	});

	it("names each field once", () => {
		const keys = COARSE_FIELDS.map((f) => f.key);
		expect(new Set(keys).size).toBe(keys.length);
	});

	it("is what CoarseMap hands to a worker", () => {
		const back = CoarseMap.fromSnapshot(map.toSnapshot());
		for (const field of COARSE_FIELDS)
			expect(coarseFieldOf(back, field).length, field.key).toBe(
				map.count,
			);
	});
});
