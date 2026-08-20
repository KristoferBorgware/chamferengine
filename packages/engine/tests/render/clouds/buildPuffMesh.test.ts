import { describe, expect, it } from "vitest";
import { generateCloudPuffs } from "chamfer/sky";
import { buildPuffMesh } from "chamfer/render";

const LAYERS = [
	{ radius: 6800, windRate: 0.02, size: 64, spread: 180, thickness: 70 },
];
const STRIDE = 10;

describe("a puff as a hexagon fan", () => {
	it("is seven vertices and six triangles per puff, every index in range", () => {
		const puffs = generateCloudPuffs(42, 120, 20, LAYERS);
		const { vertices, indices } = buildPuffMesh(puffs);

		expect(vertices.length).toBe(puffs.length * 7 * STRIDE);
		expect(indices.length).toBe(puffs.length * 6 * 3);
		for (const index of indices) {
			expect(index).toBeGreaterThanOrEqual(0);
			expect(index).toBeLessThan(puffs.length * 7);
		}
		for (const value of vertices) expect(Number.isFinite(value)).toBe(true);
	});

	it("gives the centre vertex a zero corner and the rim its hexagon", () => {
		const puffs = generateCloudPuffs(42, 120, 20, LAYERS).slice(0, 1);
		const { vertices } = buildPuffMesh(puffs);
		// Centre: direction takes the first three floats, the corner the next.
		expect(vertices[3]).toBe(0);
		expect(vertices[4]).toBe(0);
		for (let k = 0; k < 6; k++) {
			const at = (1 + k) * STRIDE;
			const cx = vertices[at + 3]!;
			const cy = vertices[at + 4]!;
			expect(Math.sqrt(cx * cx + cy * cy)).toBeCloseTo(1, 6);
		}
	});

	it("is empty buffers for no puffs", () => {
		const { vertices, indices } = buildPuffMesh([]);
		expect(vertices.length).toBe(0);
		expect(indices.length).toBe(0);
	});
});
