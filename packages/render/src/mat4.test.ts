import { describe, expect, it } from "vitest";
import { lookAt, multiply, perspective } from "./mat4.js";

/** Apply a column-major 4x4 to a point, returning the perspective divide. */
function apply(m: Float32Array, p: readonly [number, number, number]) {
	const out = [0, 0, 0, 0];
	for (let r = 0; r < 4; r++)
		out[r] =
			m[0 * 4 + r]! * p[0] +
			m[1 * 4 + r]! * p[1] +
			m[2 * 4 + r]! * p[2] +
			m[3 * 4 + r]!;
	return {
		x: out[0]! / out[3]!,
		y: out[1]! / out[3]!,
		z: out[2]! / out[3]!,
		w: out[3]!,
	};
}

describe("perspective", () => {
	it("maps the near plane to depth 0 and the far plane to depth 1", () => {
		// WebGPU's clip space runs 0 to 1 in depth, unlike OpenGL's -1 to 1.
		const m = perspective(Math.PI / 3, 1.5, 1, 100);
		expect(apply(m, [0, 0, -1]).z).toBeCloseTo(0, 5);
		expect(apply(m, [0, 0, -100]).z).toBeCloseTo(1, 5);
	});

	it("looks down negative z", () => {
		const m = perspective(Math.PI / 3, 1, 1, 100);
		expect(apply(m, [0, 0, -10]).w).toBeGreaterThan(0);
	});
});

describe("lookAt", () => {
	it("puts the target at the origin of view space", () => {
		const m = lookAt([0, 0, 10], [0, 0, 0], [0, 1, 0]);
		const p = apply(m, [0, 0, 0]);
		expect(p.x).toBeCloseTo(0, 6);
		expect(p.y).toBeCloseTo(0, 6);
		expect(p.z).toBeCloseTo(-10, 6);
	});

	it("keeps the basis orthonormal", () => {
		const m = lookAt([3, 4, 5], [0, 1, 0], [0, 1, 0]);
		const rows = [0, 1, 2].map((r) => [m[r]!, m[4 + r]!, m[8 + r]!]);
		for (const row of rows) {
			const len = Math.sqrt(row[0]! ** 2 + row[1]! ** 2 + row[2]! ** 2);
			expect(len).toBeCloseTo(1, 5);
		}
		for (let a = 0; a < 3; a++)
			for (let b = a + 1; b < 3; b++) {
				const d =
					rows[a]![0]! * rows[b]![0]! +
					rows[a]![1]! * rows[b]![1]! +
					rows[a]![2]! * rows[b]![2]!;
				expect(d).toBeCloseTo(0, 5);
			}
	});
});

describe("multiply", () => {
	it("applies the right-hand matrix first", () => {
		const view = lookAt([0, 0, 10], [0, 0, 0], [0, 1, 0]);
		const proj = perspective(Math.PI / 3, 1, 1, 100);
		const both = multiply(proj, view);
		const direct = apply(proj, [apply(view, [0, 0, 0]).x, 0, -10]);
		expect(apply(both, [0, 0, 0]).z).toBeCloseTo(direct.z, 4);
	});
});
