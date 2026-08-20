/**
 * The same mesh as lines rather than filled triangles.
 *
 * WebGPU has no fill mode: a pipeline draws triangles or it draws lines, and
 * a line topology needs its own index buffer. Every triangle contributes its
 * three edges, so an edge shared by two triangles is drawn twice -- which
 * costs a little and is worth it, because deriving the unique edge set means
 * knowing how the mesh was built, and this way the lines are exactly the
 * triangles the filled pipeline draws rather than a second opinion about
 * them.
 */
export function wireIndices(triangles: Uint32Array): Uint32Array<ArrayBuffer> {
	const lines = new Uint32Array((triangles.length / 3) * 6);
	let at = 0;
	for (let corner = 0; corner < triangles.length; corner += 3) {
		const a = triangles[corner]!;
		const b = triangles[corner + 1]!;
		const c = triangles[corner + 2]!;
		lines[at++] = a;
		lines[at++] = b;
		lines[at++] = b;
		lines[at++] = c;
		lines[at++] = c;
		lines[at++] = a;
	}
	return lines;
}
