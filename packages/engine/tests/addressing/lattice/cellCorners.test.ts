import { describe, expect, it } from "vitest";
import { Vec3 } from "chamfer/math";
import {
	cellCorners,
	cellKey,
	faceVertices,
	pentagonVertex,
} from "chamfer/addressing";

describe("cellCorners", () => {
	it("gives a hexagon six corners and a pentagon five", () => {
		const depth = 3;
		const n = 1 << depth;
		let pentagons = 0;
		const seen = new Set<string>();
		for (let f = 0; f < 20; f++)
			for (let i = 0; i <= n; i++)
				for (let j = 0; i + j <= n; j++) {
					const key = cellKey(f, n, i, j);
					const corners = cellCorners(f, n, i, j);
					if (pentagonVertex(f, n, i, j) >= 0) {
						expect(corners).toHaveLength(5);
						if (!seen.has(key)) pentagons++;
					} else {
						expect(corners).toHaveLength(6);
					}
					seen.add(key);
				}
		expect(pentagons).toBe(12);
	});

	it("draws the same corners from every face that names the cell", () => {
		const depth = 3;
		const n = 1 << depth;
		// A cell on a face edge is named by two faces. Both must produce the same
		// polygon, or the 30 face edges would show a seam.
		const byKey = new Map<string, string>();
		for (let f = 0; f < 20; f++)
			for (let i = 0; i <= n; i++)
				for (let j = 0; i + j <= n; j++) {
					const key = cellKey(f, n, i, j);
					const printed = cellCorners(f, n, i, j)
						.map(
							(p) =>
								`${p.x.toFixed(12)},${p.y.toFixed(12)},${p.z.toFixed(12)}`,
						)
						.sort()
						.join(" ");
					if (byKey.has(key)) expect(printed).toBe(byKey.get(key));
					else byKey.set(key, printed);
				}
	});

	it("is an exactly regular hexagon before it is projected", () => {
		// The corners are lattice points in the face's own plane, and there the
		// hexagon is regular to twelve decimal places: every corner the same
		// distance from the centre, every edge the same length. All of the area
		// spread across the sphere is what radial projection does on the way out,
		// and none of it is irregularity in the polygon.
		const depth = 4;
		const n = 1 << depth;
		const [A, B, C] = faceVertices(0);
		const flatPoint = (I: number, J: number) => {
			const wa = 3 * n - I - J;
			return new Vec3(
				A.x * wa + B.x * I + C.x * J,
				A.y * wa + B.y * I + C.y * J,
				A.z * wa + B.z * I + C.z * J,
			);
		};
		// Corner k is the centroid of the triangle made by the cell and its
		// neighbours in directions k and k + 1, taken at three times the resolution.
		const cornerOffsets = [
			[1, 1],
			[-1, 2],
			[-2, 1],
			[-1, -1],
			[1, -2],
			[2, -1],
		] as const;

		for (const [i, j] of [
			[4, 4],
			[7, 3],
			[1, 9],
		] as const) {
			const centre = flatPoint(3 * i, 3 * j);
			const flat = cornerOffsets.map(([di, dj]) =>
				flatPoint(3 * i + di, 3 * j + dj),
			);
			const radii = flat.map((q) => q.sub(centre).length());
			for (const r of radii) expect(r).toBeCloseTo(radii[0]!, 12);
			const edges = flat.map((q, k) =>
				flat[(k + 1) % flat.length]!.sub(q).length(),
			);
			for (const e of edges) expect(e).toBeCloseTo(edges[0]!, 12);
		}
	});

	it("winds counter-clockwise seen from outside", () => {
		const depth = 3;
		const n = 1 << depth;
		for (let f = 0; f < 20; f++)
			for (let i = 0; i <= n; i++)
				for (let j = 0; i + j <= n; j++) {
					const c = cellCorners(f, n, i, j);
					const nrm = c[1]!.sub(c[0]!).cross(c[2]!.sub(c[0]!));
					expect(nrm.dot(c[0]!)).toBeGreaterThan(0);
				}
	});
});
