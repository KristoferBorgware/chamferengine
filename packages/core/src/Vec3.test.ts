import { describe, expect, it } from "vitest";
import { add, cross, dot, scale, sub, vec3 } from "./Vec3.js";

describe("dot", () => {
	it("is zero for perpendicular axes", () => {
		expect(dot(vec3(1, 0, 0), vec3(0, 1, 0))).toBe(0);
	});

	it("is the squared length of a vector against itself", () => {
		expect(dot(vec3(1, 2, 2), vec3(1, 2, 2))).toBe(9);
	});
});

describe("cross", () => {
	it("takes x cross y to z, right-handed", () => {
		expect(cross(vec3(1, 0, 0), vec3(0, 1, 0))).toEqual({
			x: 0,
			y: 0,
			z: 1,
		});
	});

	it("is perpendicular to both inputs", () => {
		const a = vec3(1, 2, 3);
		const b = vec3(4, 5, 6);
		const c = cross(a, b);
		expect(dot(c, a)).toBe(0);
		expect(dot(c, b)).toBe(0);
	});
});

describe("add, sub and scale", () => {
	it("round-trips a vector through add and sub", () => {
		const a = vec3(1, 2, 3);
		const b = vec3(4, 5, 6);
		expect(sub(add(a, b), b)).toEqual(a);
	});

	it("doubles each component", () => {
		expect(scale(vec3(1, 2, 3), 2)).toEqual({ x: 2, y: 4, z: 6 });
	});
});
