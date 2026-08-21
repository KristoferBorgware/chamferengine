/** Three floats a vertex carries: where it sits in its triangle, and its drop. */
export const SEA_STRIDE = 3;

/** What one chunk's patch is built out of. */
export interface SeaPatch {
	vertices: Float32Array<ArrayBuffer>;

	/** The surface first, then the skirt. */
	indices: Uint32Array<ArrayBuffer>;

	/** How many indices the surface uses, which is where the skirt starts. */
	surfaceIndices: number;
}

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
 * `steps` is how many pieces each side is cut into, so the surface holds
 * `(steps+1)(steps+2)/2` vertices and `steps²` triangles.
 *
 * **Each of the three edges then grows a curtain hanging inward from the
 * rim.** Two chunks that meet are not the same size: the selection drops a
 * chunk's level with distance, so a chunk twice as wide as its neighbour cuts
 * the shared edge into vertices twice as far apart. Where the finer side puts
 * a vertex halfway along one of the coarser side's segments, a wave lifts it
 * off the straight line the coarser side draws, and the two surfaces part
 * along a slit that goes right through to the sea floor. The curtain fills
 * that slit. It is the last thing in the index list so a caller can draw
 * every surface before any curtain, which is what keeps a curtain out of the
 * picture everywhere the water is already closed.
 *
 * A curtain vertex sits where its rim vertex sits and carries a `1` in its
 * third float, which the vertex shader reads as metres to drop.
 */
export function seaPatch(steps: number): SeaPatch {
	const across = steps + 1;
	const surface = (across * (across + 1)) / 2;
	// One duplicate per rim vertex per edge. The three corners each sit on two
	// edges and so are duplicated twice, which costs three vertices and keeps
	// the three edges independent of each other.
	const count = surface + 3 * across;
	const vertices = new Float32Array(count * SEA_STRIDE);
	const indices = new Uint32Array(steps * steps * 3 + 3 * steps * 6);

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
			vertices[at++] = 0;
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
	const surfaceIndices = index;

	// The three rims, each walked from one corner to the next.
	const rims: number[][] = [[], [], []];
	for (let q = 0; q <= steps; q++) rims[0]!.push(start[0]! + q);
	for (let r = 0; r <= steps; r++) rims[1]!.push(start[r]! + (steps - r));
	for (let r = 0; r <= steps; r++) rims[2]!.push(start[r]!);

	let hem = surface;
	for (const rim of rims) {
		const first = hem;
		for (const vertex of rim) {
			vertices[hem * SEA_STRIDE] = vertices[vertex * SEA_STRIDE]!;
			vertices[hem * SEA_STRIDE + 1] = vertices[vertex * SEA_STRIDE + 1]!;
			vertices[hem * SEA_STRIDE + 2] = 1;
			hem++;
		}
		for (let step = 0; step < steps; step++) {
			const a = rim[step]!;
			const b = rim[step + 1]!;
			const under = first + step;
			indices[index++] = a;
			indices[index++] = b;
			indices[index++] = under;
			indices[index++] = b;
			indices[index++] = under + 1;
			indices[index++] = under;
		}
	}

	return { vertices, indices: indices.slice(0, index), surfaceIndices };
}
