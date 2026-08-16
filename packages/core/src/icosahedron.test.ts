import { describe, expect, it } from "vitest";
import {
	EDGES,
	FACES,
	FACE_CENTROIDS,
	VERTICES,
	faceVertices,
} from "./icosahedron.js";
import { cross, dot, sub } from "./Vec3.js";
import { length } from "./normalize.js";

describe("the icosahedron", () => {
	it("has 12 vertices, 20 faces and 30 edges", () => {
		expect(VERTICES).toHaveLength(12);
		expect(FACES).toHaveLength(20);
		expect(EDGES).toHaveLength(30);
	});

	it("satisfies Euler's formula", () => {
		expect(VERTICES.length - EDGES.length + FACES.length).toBe(2);
	});

	it("puts every vertex on the unit sphere", () => {
		for (const v of VERTICES) expect(length(v)).toBeCloseTo(1, 14);
	});

	it("gives all 30 edges the same length", () => {
		const lengths = EDGES.map(([a, b]) =>
			length(sub(VERTICES[a]!, VERTICES[b]!)),
		);
		const first = lengths[0]!;
		for (const l of lengths) expect(l).toBeCloseTo(first, 12);
	});

	it("winds every face counter-clockwise seen from outside", () => {
		// The face normal from A->B->C points away from the centre when the
		// winding is outward, which is what lets one direction table serve all
		// twenty faces.
		for (let f = 0; f < 20; f++) {
			const [a, b, c] = faceVertices(f);
			const n = cross(sub(b, a), sub(c, a));
			expect(dot(n, a)).toBeGreaterThan(0);
		}
	});

	it("gives each vertex five faces", () => {
		const count = new Map<number, number>();
		for (const f of FACES)
			for (const v of f) count.set(v, (count.get(v) ?? 0) + 1);
		for (let v = 0; v < 12; v++) expect(count.get(v)).toBe(5);
	});

	it("puts every centroid on the unit sphere", () => {
		for (const c of FACE_CENTROIDS) expect(length(c)).toBeCloseTo(1, 14);
	});
});
