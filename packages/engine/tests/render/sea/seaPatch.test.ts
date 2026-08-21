import { describe, expect, it } from "vitest";
import { SEA_STRIDE, seaPatch } from "chamfer/render";

describe("seaPatch", () => {
	it("holds a triangular lattice of the size the level asks for", () => {
		for (const steps of [1, 2, 4, 16]) {
			const { vertices, indices, surfaceIndices } = seaPatch(steps);
			const across = steps + 1;
			// The surface, and one duplicate per rim vertex per edge.
			expect(vertices.length / SEA_STRIDE).toBe(
				(across * (across + 1)) / 2 + 3 * across,
			);
			// Upward and downward triangles come to exactly steps² between them.
			expect(surfaceIndices).toBe(steps * steps * 3);
			// Two triangles per step of each of the three rims.
			expect(indices.length - surfaceIndices).toBe(3 * steps * 2 * 3);
		}
	});

	it("hangs a curtain under every rim vertex and nowhere else", () => {
		const steps = 8;
		const { vertices, surfaceIndices, indices } = seaPatch(steps);
		const drop = (at: number): number => vertices[at * SEA_STRIDE + 2]!;
		const count = vertices.length / SEA_STRIDE;
		const surface = ((steps + 1) * (steps + 2)) / 2;
		for (let at = 0; at < surface; at++) expect(drop(at)).toBe(0);
		for (let at = surface; at < count; at++) expect(drop(at)).toBe(1);

		// A curtain vertex stands exactly under the rim vertex it hangs from,
		// or the two surfaces it is closing between do not meet it.
		const rim = new Set<string>();
		for (let at = 0; at < surface; at++) {
			const b = vertices[at * SEA_STRIDE]!;
			const c = vertices[at * SEA_STRIDE + 1]!;
			if (b === 0 || c === 0 || Math.abs(b + c - 1) < 1e-9)
				rim.add(`${b},${c}`);
		}
		for (let at = surface; at < count; at++)
			expect(
				rim.has(
					`${vertices[at * SEA_STRIDE]!},${vertices[at * SEA_STRIDE + 1]!}`,
				),
			).toBe(true);

		// The surface comes first, so a caller can draw all of it before any
		// curtain. Nothing in the surface range names a curtain vertex.
		for (let at = 0; at < surfaceIndices; at++)
			expect(indices[at]!).toBeLessThan(surface);
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
