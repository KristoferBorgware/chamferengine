import type { Mat4 } from "./Mat4.js";

/**
 * The six planes a view-projection matrix bounds space with.
 *
 * Each is `(a, b, c, d)` with `a·x + b·y + c·z + d >= 0` inside, read off the
 * matrix by adding and subtracting its rows. That works for any projection the
 * matrix describes, so nothing here needs to know the field of view, the aspect
 * ratio or where the far plane was put.
 *
 * The planes are normalised, which is what makes `d` a distance and lets a
 * sphere be tested against one by a single comparison.
 */
export class Frustum {
	/** Six planes of four numbers, in one array. */
	private readonly planes = new Float64Array(24);

	constructor(viewProj: Mat4) {
		const m = viewProj.elements;
		// Column-major: m[column * 4 + row].
		const row = (r: number): [number, number, number, number] => [
			m[r]!,
			m[4 + r]!,
			m[8 + r]!,
			m[12 + r]!,
		];
		const [x0, x1, x2, x3] = row(0);
		const [y0, y1, y2, y3] = row(1);
		const [z0, z1, z2, z3] = row(2);
		const [w0, w1, w2, w3] = row(3);

		// Clip space runs 0 to 1 in depth here, so near is the z row alone
		// rather than w plus z.
		const sides: [number, number, number, number][] = [
			[w0 + x0, w1 + x1, w2 + x2, w3 + x3],
			[w0 - x0, w1 - x1, w2 - x2, w3 - x3],
			[w0 + y0, w1 + y1, w2 + y2, w3 + y3],
			[w0 - y0, w1 - y1, w2 - y2, w3 - y3],
			[z0, z1, z2, z3],
			[w0 - z0, w1 - z1, w2 - z2, w3 - z3],
		];

		for (let p = 0; p < 6; p++) {
			const [a, b, c, d] = sides[p]!;
			const length = Math.sqrt(a * a + b * b + c * c);
			const scale = length > 0 ? 1 / length : 0;
			this.planes[p * 4] = a * scale;
			this.planes[p * 4 + 1] = b * scale;
			this.planes[p * 4 + 2] = c * scale;
			this.planes[p * 4 + 3] = d * scale;
		}
	}

	/**
	 * Whether a sphere is anywhere inside, taking a plane at a time.
	 *
	 * A sphere outside one plane is outside the frustum; a sphere inside all
	 * six may still be outside a corner, and is reported as inside. That is the
	 * right trade for culling: a false yes costs one wasted draw and a false no
	 * would cost a hole in the world.
	 */
	holds(x: number, y: number, z: number, radius: number): boolean {
		for (let p = 0; p < 6; p++) {
			const at = p * 4;
			const distance =
				this.planes[at]! * x +
				this.planes[at + 1]! * y +
				this.planes[at + 2]! * z +
				this.planes[at + 3]!;
			if (distance < -radius) return false;
		}
		return true;
	}
}
