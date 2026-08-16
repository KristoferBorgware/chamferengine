import { describe, expect, it } from "vitest";
import { Vec3 } from "chamfer/math";
import { faceOf, faceVertices } from "chamfer/addressing";

/** Ground truth: solve dir = a*A + b*B + c*C and require every weight positive. */
function containingFace(dir: Vec3): number | null {
	for (let f = 0; f < 20; f++) {
		const [a, b, c] = faceVertices(f);
		const det = a.dot(b.cross(c));
		const wa = dir.dot(b.cross(c)) / det;
		const wb = a.dot(dir.cross(c)) / det;
		const wc = a.dot(b.cross(dir)) / det;
		if (wa >= -1e-9 && wb >= -1e-9 && wc >= -1e-9) return f;
	}
	return null;
}

/** A repeatable sampler, so a failure can be reproduced exactly. */
function sampler(seed: number) {
	let s = seed >>> 0;
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 2 ** 32;
	};
}

describe("faceOf", () => {
	it("picks the containing face on 20,000 random directions", () => {
		const rnd = sampler(12345);
		let mismatches = 0;
		for (let k = 0; k < 20000; k++) {
			const dir = new Vec3(
				rnd() * 2 - 1,
				rnd() * 2 - 1,
				rnd() * 2 - 1,
			).normalize();
			if (containingFace(dir) !== faceOf(dir)) mismatches++;
		}
		expect(mismatches).toBe(0);
	});
});
