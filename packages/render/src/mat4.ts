/**
 * A 4x4 matrix in column-major order, which is the layout WGSL's `mat4x4f`
 * reads. `float32` throughout: this is GPU-facing data.
 */
export type Mat4 = Float32Array<ArrayBuffer>;

/** A projection matrix for WebGPU's clip space, whose depth runs 0 to 1. */
export function perspective(
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
	return m;
}

/** A view matrix looking from `eye` toward `target`. */
export function lookAt(
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
	return m;
}

/** The product `a * b`, applying `b` first. */
export function multiply(a: Mat4, b: Mat4): Mat4 {
	const m = new Float32Array(16);
	for (let c = 0; c < 4; c++)
		for (let r = 0; r < 4; r++) {
			let sum = 0;
			for (let k = 0; k < 4; k++) sum += a[k * 4 + r]! * b[c * 4 + k]!;
			m[c * 4 + r] = sum;
		}
	return m;
}
