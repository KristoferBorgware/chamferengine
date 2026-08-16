/**
 * A 4x4 matrix in column-major order, which is the layout WGSL's `mat4x4f`
 * reads. The elements are `float32`: this is GPU-facing data.
 *
 * Instances are immutable. `elements` is the buffer to upload.
 */
export class Mat4 {
	readonly elements: Float32Array<ArrayBuffer>;

	private constructor(elements: Float32Array<ArrayBuffer>) {
		this.elements = elements;
	}

	/** A projection matrix for WebGPU's clip space, whose depth runs 0 to 1. */
	static perspective(
		fovY: number,
		aspect: number,
		near: number,
		far: number,
	): Mat4 {
		const f = 1 / Math.tan(fovY / 2);
		const m = new Float32Array(16);
		m[0] = f / aspect;
		m[5] = f;
		m[10] = far / (near - far);
		m[11] = -1;
		m[14] = (far * near) / (near - far);
		return new Mat4(m);
	}

	/** A view matrix looking from `eye` toward `target`. */
	static lookAt(
		eye: readonly [number, number, number],
		target: readonly [number, number, number],
		up: readonly [number, number, number],
	): Mat4 {
		const zx = eye[0] - target[0];
		const zy = eye[1] - target[1];
		const zz = eye[2] - target[2];
		const zl = Math.sqrt(zx * zx + zy * zy + zz * zz);
		const z = [zx / zl, zy / zl, zz / zl] as const;

		const xx = up[1] * z[2] - up[2] * z[1];
		const xy = up[2] * z[0] - up[0] * z[2];
		const xz = up[0] * z[1] - up[1] * z[0];
		const xl = Math.sqrt(xx * xx + xy * xy + xz * xz);
		const x = [xx / xl, xy / xl, xz / xl] as const;

		const y = [
			z[1] * x[2] - z[2] * x[1],
			z[2] * x[0] - z[0] * x[2],
			z[0] * x[1] - z[1] * x[0],
		] as const;

		const m = new Float32Array(16);
		m[0] = x[0];
		m[1] = y[0];
		m[2] = z[0];
		m[4] = x[1];
		m[5] = y[1];
		m[6] = z[1];
		m[8] = x[2];
		m[9] = y[2];
		m[10] = z[2];
		m[12] = -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]);
		m[13] = -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]);
		m[14] = -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]);
		m[15] = 1;
		return new Mat4(m);
	}

	/**
	 * The inverse, or the identity where there is none.
	 *
	 * A sky shader turns a pixel back into the direction it looks along, which
	 * is this matrix applied to a point on the far plane.
	 */
	inverse(): Mat4 {
		const m = this.elements;
		const out = new Float32Array(16);
		const a = (r: number, c: number) => m[c * 4 + r]!;

		const s0 = a(0, 0) * a(1, 1) - a(1, 0) * a(0, 1);
		const s1 = a(0, 0) * a(1, 2) - a(1, 0) * a(0, 2);
		const s2 = a(0, 0) * a(1, 3) - a(1, 0) * a(0, 3);
		const s3 = a(0, 1) * a(1, 2) - a(1, 1) * a(0, 2);
		const s4 = a(0, 1) * a(1, 3) - a(1, 1) * a(0, 3);
		const s5 = a(0, 2) * a(1, 3) - a(1, 2) * a(0, 3);
		const c5 = a(2, 2) * a(3, 3) - a(3, 2) * a(2, 3);
		const c4 = a(2, 1) * a(3, 3) - a(3, 1) * a(2, 3);
		const c3 = a(2, 1) * a(3, 2) - a(3, 1) * a(2, 2);
		const c2 = a(2, 0) * a(3, 3) - a(3, 0) * a(2, 3);
		const c1 = a(2, 0) * a(3, 2) - a(3, 0) * a(2, 2);
		const c0 = a(2, 0) * a(3, 1) - a(3, 0) * a(2, 1);

		const det = s0 * c5 - s1 * c4 + s2 * c3 + s3 * c2 - s4 * c1 + s5 * c0;
		if (det === 0) {
			for (let d = 0; d < 4; d++) out[d * 4 + d] = 1;
			return new Mat4(out);
		}
		const k = 1 / det;
		const put = (r: number, c: number, value: number) => {
			out[c * 4 + r] = value * k;
		};

		put(0, 0, a(1, 1) * c5 - a(1, 2) * c4 + a(1, 3) * c3);
		put(0, 1, -a(0, 1) * c5 + a(0, 2) * c4 - a(0, 3) * c3);
		put(0, 2, a(3, 1) * s5 - a(3, 2) * s4 + a(3, 3) * s3);
		put(0, 3, -a(2, 1) * s5 + a(2, 2) * s4 - a(2, 3) * s3);
		put(1, 0, -a(1, 0) * c5 + a(1, 2) * c2 - a(1, 3) * c1);
		put(1, 1, a(0, 0) * c5 - a(0, 2) * c2 + a(0, 3) * c1);
		put(1, 2, -a(3, 0) * s5 + a(3, 2) * s2 - a(3, 3) * s1);
		put(1, 3, a(2, 0) * s5 - a(2, 2) * s2 + a(2, 3) * s1);
		put(2, 0, a(1, 0) * c4 - a(1, 1) * c2 + a(1, 3) * c0);
		put(2, 1, -a(0, 0) * c4 + a(0, 1) * c2 - a(0, 3) * c0);
		put(2, 2, a(3, 0) * s4 - a(3, 1) * s2 + a(3, 3) * s0);
		put(2, 3, -a(2, 0) * s4 + a(2, 1) * s2 - a(2, 3) * s0);
		put(3, 0, -a(1, 0) * c3 + a(1, 1) * c1 - a(1, 2) * c0);
		put(3, 1, a(0, 0) * c3 - a(0, 1) * c1 + a(0, 2) * c0);
		put(3, 2, -a(3, 0) * s3 + a(3, 1) * s1 - a(3, 2) * s0);
		put(3, 3, a(2, 0) * s3 - a(2, 1) * s1 + a(2, 2) * s0);
		return new Mat4(out);
	}

	/** The product `this * b`, applying `b` first. */
	multiply(b: Mat4): Mat4 {
		const a = this.elements;
		const e = b.elements;
		const m = new Float32Array(16);
		for (let c = 0; c < 4; c++)
			for (let r = 0; r < 4; r++) {
				let sum = 0;
				for (let k = 0; k < 4; k++)
					sum += a[k * 4 + r]! * e[c * 4 + k]!;
				m[c * 4 + r] = sum;
			}
		return new Mat4(m);
	}
}
