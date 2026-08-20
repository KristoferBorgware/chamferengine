/** Two floats a vertex carries: where it sits on the unit disc. */
export const SEA_STRIDE = 2;

/**
 * A disc of triangles, finest at its middle, as a mesh that never changes.
 *
 * The sea follows the camera, and a mesh that followed it by being rebuilt
 * would be rebuilt every time the player moved. This one is built once in its
 * own flat unit disc and carried onto the planet in the vertex shader, which
 * knows where the camera is standing and how far it can see: nothing here
 * moves, and nothing is uploaded twice.
 *
 * **Rings are packed toward the middle**, because a ring near the horizon
 * covers hundreds of times the ground a ring underfoot does and needs none of
 * the detail. `curve` is the power the ring spacing follows: at 1 the rings
 * are evenly spread and the far ones are wasted on the horizon, and higher
 * pulls them in around the viewer, where a wave is metres across rather than
 * a smudge in the distance.
 */
export function seaDisc(
	rings: number,
	sectors: number,
	curve = 2.5,
): {
	vertices: Float32Array<ArrayBuffer>;
	indices: Uint32Array<ArrayBuffer>;
} {
	// One vertex at the middle, then a full ring of them per step outward.
	const vertices = new Float32Array((1 + rings * sectors) * SEA_STRIDE);
	const indices = new Uint32Array(sectors * 3 + (rings - 1) * sectors * 6);

	let at = SEA_STRIDE;
	for (let ring = 1; ring <= rings; ring++) {
		const out = (ring / rings) ** curve;
		for (let sector = 0; sector < sectors; sector++) {
			const around = (sector / sectors) * Math.PI * 2;
			vertices[at++] = Math.cos(around) * out;
			vertices[at++] = Math.sin(around) * out;
		}
	}

	let index = 0;
	// The middle fan, which is the only place a triangle has a corner rather
	// than an edge facing inward.
	for (let sector = 0; sector < sectors; sector++) {
		indices[index++] = 0;
		indices[index++] = 1 + sector;
		indices[index++] = 1 + ((sector + 1) % sectors);
	}
	for (let ring = 0; ring < rings - 1; ring++) {
		const inner = 1 + ring * sectors;
		const outer = inner + sectors;
		for (let sector = 0; sector < sectors; sector++) {
			const next = (sector + 1) % sectors;
			indices[index++] = inner + sector;
			indices[index++] = outer + sector;
			indices[index++] = outer + next;
			indices[index++] = inner + sector;
			indices[index++] = outer + next;
			indices[index++] = inner + next;
		}
	}
	return { vertices, indices };
}
