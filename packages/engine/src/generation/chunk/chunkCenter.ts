import { Vec3 } from "../../math/Vec3.js";
import { joinPath } from "../../addressing/lattice/joinPath.js";
import { latticePosition } from "../../addressing/lattice/latticePosition.js";
import type { ChunkAddress } from "./ChunkAddress.js";

/**
 * The direction a chunk's triangle points, and how wide it is from there.
 *
 * Interest is a dot product against these two numbers: a chunk is in range when
 * the viewer's direction is within the sum of the two angles. Both are fixed by
 * the address, so they are computed once when a chunk enters the working set.
 */
export interface ChunkExtent {
	readonly x: number;
	readonly y: number;
	readonly z: number;

	/** Cosine of the angle from the centre to the furthest corner. */
	readonly cosRadius: number;
}

/** Where a chunk sits on the sphere, and how much of it it covers. */
export function chunkCenter(
	address: ChunkAddress,
	depth: number,
	chunkLevel: number,
): ChunkExtent {
	const n = 1 << depth;
	const m = 1 << (depth - chunkLevel);
	const corners = [
		[0, 0],
		[m, 0],
		[0, m],
	] as const;

	let sum = new Vec3(0, 0, 0);
	const points: Vec3[] = [];
	for (const [q, r] of corners) {
		const [i, j] = joinPath(address.path, q, r, depth);
		const p = latticePosition(address.face, n, i, j);
		points.push(p);
		sum = sum.add(p);
	}
	const centre = sum.normalize();

	let cosRadius = 1;
	for (const p of points) cosRadius = Math.min(cosRadius, centre.dot(p));
	return { x: centre.x, y: centre.y, z: centre.z, cosRadius };
}
