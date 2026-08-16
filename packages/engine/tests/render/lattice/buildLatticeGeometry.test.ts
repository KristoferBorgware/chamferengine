import { describe, expect, it } from "vitest";
import { Vec3 } from "chamfer/math";
import { buildLatticeGeometry } from "chamfer/render";

describe("buildLatticeGeometry", () => {
	it("draws every cell once", () => {
		for (const depth of [1, 2, 3, 4]) {
			const g = buildLatticeGeometry(depth, 1700);
			expect(g.cellCount).toBe(10 * 4 ** depth + 2);
		}
	});

	it("costs four triangles a hexagon and three a pentagon", () => {
		const depth = 4;
		const g = buildLatticeGeometry(depth, 1700);
		const cells = 10 * 4 ** depth + 2;
		expect(g.triangleCount).toBe((cells - 12) * 4 + 12 * 3);
		expect(g.indices.length).toBe(g.triangleCount * 3);
	});

	it("emits six vertices a hexagon and five a pentagon", () => {
		const depth = 3;
		const g = buildLatticeGeometry(depth, 1700);
		const cells = 10 * 4 ** depth + 2;
		expect(g.vertices.length / 6).toBe((cells - 12) * 6 + 12 * 5);
	});

	it("keeps every index inside the vertex array", () => {
		const g = buildLatticeGeometry(3, 1700);
		const vertexCount = g.vertices.length / 6;
		for (const idx of g.indices) expect(idx).toBeLessThan(vertexCount);
	});

	it("puts every vertex on the sphere, within the lift", () => {
		const radius = 1700;
		const g = buildLatticeGeometry(3, radius);
		for (let v = 0; v < g.vertices.length; v += 6) {
			const r = new Vec3(
				g.vertices[v]!,
				g.vertices[v + 1]!,
				g.vertices[v + 2]!,
			).length();
			expect(r).toBeGreaterThan(radius * 0.999);
			expect(r).toBeLessThan(radius * 1.001);
		}
	});

	it("paints exactly twelve cells as pentagons", () => {
		// One per icosahedron vertex, at every subdivision level, in every world.
		for (const depth of [2, 3, 4]) {
			const g = buildLatticeGeometry(depth, 1700);
			let redCells = 0;
			let v = 0;
			while (v < g.vertices.length) {
				const isRed = Math.abs(g.vertices[v + 3]! - 0.86) < 1e-6;
				// A pentagon contributes five vertices, a hexagon six.
				const corners = isRed ? 5 : 6;
				if (isRed) redCells++;
				v += corners * 6;
			}
			expect(redCells).toBe(12);
		}
	});

	it("holds no NaN", () => {
		const g = buildLatticeGeometry(3, 1700);
		for (const x of g.vertices) expect(Number.isFinite(x)).toBe(true);
	});

	it("gives every vertex a color inside the unit range", () => {
		const g = buildLatticeGeometry(2, 1700);
		for (let v = 0; v < g.vertices.length; v += 6)
			for (let c = 3; c < 6; c++) {
				expect(g.vertices[v + c]!).toBeGreaterThanOrEqual(0);
				expect(g.vertices[v + c]!).toBeLessThanOrEqual(1);
			}
	});
});
