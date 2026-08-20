import { describe, expect, it } from "vitest";
import { SEA_STRIDE, seaPatch } from "chamfer/render";

describe("seaPatch", () => {
	it("holds a triangular lattice of the size the level asks for", () => {
		for (const steps of [1, 2, 4, 16]) {
			const { vertices, indices } = seaPatch(steps);
			const across = steps + 1;
			expect(vertices.length / SEA_STRIDE).toBe(
				(across * (across + 1)) / 2,
			);
			// Upward and downward triangles come to exactly steps² between them.
			expect(indices.length).toBe(steps * steps * 3);
		}
	});

	it("names only vertices it has", () => {
		const { vertices, indices } = seaPatch(8);
		const count = vertices.length / SEA_STRIDE;
		for (const index of indices) {
			expect(index).toBeGreaterThanOrEqual(0);
			expect(index).toBeLessThan(count);
		}
	});

	it("keeps every point inside its own triangle", () => {
		// The shader reads the third weight as one minus the other two, so a
		// point outside the triangle would be a corner weighted negatively and
		// a vertex thrown off the sphere.
		const { vertices } = seaPatch(16);
		for (let at = 0; at < vertices.length; at += SEA_STRIDE) {
			const b = vertices[at]!;
			const c = vertices[at + 1]!;
			expect(b).toBeGreaterThanOrEqual(0);
			expect(c).toBeGreaterThanOrEqual(0);
			expect(b + c).toBeLessThanOrEqual(1 + 1e-9);
		}
	});

	it("puts a vertex on each of the three corners", () => {
		const { vertices } = seaPatch(4);
		const has = (b: number, c: number): boolean => {
			for (let at = 0; at < vertices.length; at += SEA_STRIDE)
				if (
					Math.abs(vertices[at]! - b) < 1e-9 &&
					Math.abs(vertices[at + 1]! - c) < 1e-9
				)
					return true;
			return false;
		};
		expect(has(0, 0)).toBe(true);
		expect(has(1, 0)).toBe(true);
		expect(has(0, 1)).toBe(true);
	});

	it("uses every vertex it built", () => {
		// A lattice point no triangle names is a hole in the water.
		const { vertices, indices } = seaPatch(8);
		const seen = new Set(indices);
		expect(seen.size).toBe(vertices.length / SEA_STRIDE);
	});
});
