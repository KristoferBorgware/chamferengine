import { describe, expect, it } from "vitest";
import { length, normalize } from "./normalize.js";
import { vec3 } from "./Vec3.js";

describe("length", () => {
	it("measures a 3-4-5 triangle in the plane", () => {
		expect(length(vec3(3, 4, 0))).toBe(5);
	});

	it("measures a 1-2-2 triple in three dimensions", () => {
		expect(length(vec3(1, 2, 2))).toBe(3);
	});

	it("agrees with Math.hypot on values both compute exactly", () => {
		// The two disagree by one ULP on arbitrary inputs, which is why the
		// engine uses sqrt. On exactly representable results they match, so
		// this pins the arithmetic without pinning the implementation.
		expect(length(vec3(3, 4, 0))).toBe(Math.hypot(3, 4, 0));
	});
});

describe("normalize", () => {
	it("keeps the direction and sets the length to 1", () => {
		const n = normalize(vec3(0, 1700, 0));
		expect(n).toEqual({ x: 0, y: 1, z: 0 });
	});

	it("returns unit length for a vector along no axis", () => {
		const n = normalize(vec3(1, 2, 2));
		expect(length(n)).toBeCloseTo(1, 15);
		expect(n.x).toBeCloseTo(1 / 3, 15);
	});

	it("produces the same bits at every radius", () => {
		// Identity is integer and directions are precision-robust: scaling a
		// position by any power of two changes the exponent alone, so the
		// direction comes back identical rather than merely close.
		const base = vec3(1, 2, 2);
		const far = vec3(1 * 1024, 2 * 1024, 2 * 1024);
		expect(normalize(far)).toEqual(normalize(base));
	});
});
