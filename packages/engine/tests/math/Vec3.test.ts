import { describe, expect, it } from "vitest";
import { Vec3 } from "chamfer/math";

describe("dot", () => {
	it("is zero for perpendicular axes", () => {
		expect(new Vec3(1, 0, 0).dot(new Vec3(0, 1, 0))).toBe(0);
	});

	it("is the squared length of a vector against itself", () => {
		expect(new Vec3(1, 2, 2).dot(new Vec3(1, 2, 2))).toBe(9);
	});
});

describe("cross", () => {
	it("takes x cross y to z, right-handed", () => {
		const c = new Vec3(1, 0, 0).cross(new Vec3(0, 1, 0));
		expect([c.x, c.y, c.z]).toEqual([0, 0, 1]);
	});

	it("is perpendicular to both inputs", () => {
		const a = new Vec3(1, 2, 3);
		const b = new Vec3(4, 5, 6);
		const c = a.cross(b);
		expect(c.dot(a)).toBe(0);
		expect(c.dot(b)).toBe(0);
	});
});

describe("add, sub and scale", () => {
	it("round-trips a vector through add and sub", () => {
		const a = new Vec3(1, 2, 3);
		const b = new Vec3(4, 5, 6);
		expect(a.add(b).sub(b)).toEqual(a);
	});

	it("doubles each component", () => {
		const s = new Vec3(1, 2, 3).scale(2);
		expect([s.x, s.y, s.z]).toEqual([2, 4, 6]);
	});
});

describe("length", () => {
	it("measures a 3-4-5 triangle in the plane", () => {
		expect(new Vec3(3, 4, 0).length()).toBe(5);
	});

	it("measures a 1-2-2 triple in three dimensions", () => {
		expect(new Vec3(1, 2, 2).length()).toBe(3);
	});

	it("agrees with Math.hypot on values both compute exactly", () => {
		// The two disagree by one ULP on arbitrary inputs, which is why the
		// engine uses sqrt. On exactly representable results they match, so
		// this pins the arithmetic without pinning the implementation.
		expect(new Vec3(3, 4, 0).length()).toBe(Math.hypot(3, 4, 0));
	});
});

describe("normalize", () => {
	it("keeps the direction and sets the length to 1", () => {
		const n = new Vec3(0, 1700, 0).normalize();
		expect([n.x, n.y, n.z]).toEqual([0, 1, 0]);
	});

	it("returns unit length for a vector along no axis", () => {
		const n = new Vec3(1, 2, 2).normalize();
		expect(n.length()).toBeCloseTo(1, 15);
		expect(n.x).toBeCloseTo(1 / 3, 15);
	});

	it("produces the same bits at every radius", () => {
		// Identity is integer and directions are precision-robust: scaling a
		// position by any power of two changes the exponent alone, so the
		// direction comes back identical rather than merely close.
		const base = new Vec3(1, 2, 2).normalize();
		const far = new Vec3(1 * 1024, 2 * 1024, 2 * 1024).normalize();
		expect(far).toEqual(base);
	});
});
