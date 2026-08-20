import type { CloudPuff } from "../../sky/CloudPuff.js";

/** Floats a vertex carries: direction(3), corner(2), size, cover, radius, windRate. */
const STRIDE = 9;

/** Corners of a unit hexagon, in the billboard's own right/up plane. */
const CORNERS = Array.from({ length: 6 }, (_, k) => {
	const angle = (k * Math.PI) / 3;
	return [Math.cos(angle), Math.sin(angle)] as const;
});

/**
 * Every puff as a hexagon fan: a centre vertex and six rim vertices, wound the
 * same way for every puff so one index list serves them all.
 *
 * A vertex carries the puff's whole placement -- direction, radius, drift rate
 * -- because turning it and facing it to the eye both happen in the vertex
 * shader. Nothing here changes once the puffs are chosen, so this runs once
 * rather than every frame.
 */
export function buildPuffMesh(puffs: readonly CloudPuff[]): {
	vertices: Float32Array<ArrayBuffer>;
	indices: Uint32Array<ArrayBuffer>;
} {
	const vertices = new Float32Array(puffs.length * 7 * STRIDE);
	const indices = new Uint32Array(puffs.length * 6 * 3);

	let vAt = 0;
	let iAt = 0;
	for (let p = 0; p < puffs.length; p++) {
		const puff = puffs[p]!;
		const base = p * 7;
		const put = (cx: number, cy: number): void => {
			vertices[vAt++] = puff.direction.x;
			vertices[vAt++] = puff.direction.y;
			vertices[vAt++] = puff.direction.z;
			vertices[vAt++] = cx;
			vertices[vAt++] = cy;
			vertices[vAt++] = puff.size;
			vertices[vAt++] = puff.cover;
			vertices[vAt++] = puff.radius;
			vertices[vAt++] = puff.windRate;
		};
		put(0, 0);
		for (const [cx, cy] of CORNERS) put(cx, cy);

		for (let k = 0; k < 6; k++) {
			indices[iAt++] = base;
			indices[iAt++] = base + 1 + k;
			indices[iAt++] = base + 1 + ((k + 1) % 6);
		}
	}
	return { vertices, indices };
}
