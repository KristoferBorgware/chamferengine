import type { ChunkAtlas } from "./ChunkAtlas.js";
import { horizonAngle } from "./horizonAngle.js";

/**
 * Which chunks a viewer can see, nearest first.
 *
 * A chunk is in range when the angle from the viewer's own direction to the
 * chunk's centre is inside the horizon plus the chunk's own angular size. That
 * is one dot product per chunk, and the comparison is against a cosine so no
 * angle is ever taken.
 *
 * Nearest first, so a caller that stops early has the chunks under the viewer
 * rather than the ones on the skyline.
 */
export function residentChunks(
	atlas: ChunkAtlas,
	viewer: { readonly x: number; readonly y: number; readonly z: number },
	viewerRadius: number,
	surfaceRadius: number,
	limit = Number.POSITIVE_INFINITY,
): number[] {
	const length = Math.sqrt(
		viewer.x * viewer.x + viewer.y * viewer.y + viewer.z * viewer.z,
	);
	const ux = viewer.x / length;
	const uy = viewer.y / length;
	const uz = viewer.z / length;
	const horizon = horizonAngle(viewerRadius, surfaceRadius);

	const found: { key: number; cos: number }[] = [];
	for (let key = 0; key < atlas.extents.length; key++) {
		const extent = atlas.extents[key]!;
		const cos = ux * extent.x + uy * extent.y + uz * extent.z;
		// Adding the chunk's own angular size to the horizon keeps a chunk whose
		// centre is over the edge but whose near corner is not.
		const reach = Math.cos(
			Math.min(Math.PI, horizon + Math.acos(extent.cosRadius)),
		);
		if (cos >= reach) found.push({ key, cos });
	}
	found.sort((a, b) => b.cos - a.cos || a.key - b.key);
	return found.slice(0, limit).map((f) => f.key);
}
