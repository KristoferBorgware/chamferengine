/** Two floats a vertex carries: where it sits in its triangle. */
export const SEA_STRIDE = 2;

/**
 * One chunk's triangle, subdivided, in barycentric coordinates.
 *
 * **The patch is the same shape for every chunk at a level**, because a chunk
 * is a triangle and a triangle subdivided is a triangle subdivided. What
 * differs between two chunks is only where their three corners point, so the
 * mesh here is built once per level of subdivision and every chunk that wants
 * it is one instance carrying three directions. The vertex shader blends them
 * -- one barycentric blend, evaluated once, which is the same construction
 * every cell centre in the world is placed by.
 *
 * `steps` is how many pieces each side is cut into, so the patch holds
 * `(steps+1)(steps+2)/2` vertices and `steps²` triangles. A chunk drawn at a
 * coarser level of detail asks for fewer, which is the whole of the sea's LOD:
 * the same triangle, fewer points across it.
 */
export function seaPatch(steps: number): {
	vertices: Float32Array<ArrayBuffer>;
	indices: Uint32Array<ArrayBuffer>;
} {
	const across = steps + 1;
	const count = (across * (across + 1)) / 2;
	const vertices = new Float32Array(count * SEA_STRIDE);
	const indices = new Uint32Array(steps * steps * 3);

	// Row `r` holds `steps - r + 1` points, so a row starts where all the
	// rows under it ended.
	const start = new Int32Array(across);
	for (let r = 1; r < across; r++)
		start[r] = start[r - 1]! + (steps - (r - 1) + 1);

	let at = 0;
	for (let r = 0; r <= steps; r++) {
		for (let q = 0; q <= steps - r; q++) {
			vertices[at++] = q / steps;
			vertices[at++] = r / steps;
		}
	}

	let index = 0;
	for (let r = 0; r < steps; r++) {
		for (let q = 0; q < steps - r; q++) {
			const here = start[r]! + q;
			const above = start[r + 1]! + q;
			// The upward triangle, which every lattice point but the last of
			// a row has.
			indices[index++] = here;
			indices[index++] = here + 1;
			indices[index++] = above;
			// And the downward one filling the gap beside it, which the last
			// point of a row does not have.
			if (q < steps - r - 1) {
				indices[index++] = here + 1;
				indices[index++] = above + 1;
				indices[index++] = above;
			}
		}
	}
	// Upward and downward triangles come to exactly `steps²` between them,
	// so nothing is trimmed here in practice -- the slice is what says so.
	return { vertices, indices: indices.slice(0, index) };
}
