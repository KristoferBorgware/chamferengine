import type { ColumnPatch } from "chamfer/mesh";
import { columnFrame } from "chamfer/mesh";

/** The patch's cells as a plan is drawn from: flat, in metres from the middle. */
export interface CaveCellPlan {
	readonly count: number;

	/** Per cell, its middle: east then north. */
	readonly at: Float32Array<ArrayBuffer>;

	/** Per cell, six corners in the same frame; a pentagon repeats its last. */
	readonly corners: Float32Array<ArrayBuffer>;

	readonly degree: Uint8Array<ArrayBuffer>;

	/** Per cell, its six neighbours as indices, `-1` off the patch. */
	readonly ring: Int32Array<ArrayBuffer>;

	/** The rectangle the cells fill, east then north, grown by half a cell. */
	readonly low: [number, number];
	readonly high: [number, number];
}

/**
 * The patch's cells laid out flat, in metres from its middle.
 *
 * **The same two axes the mesh is laid out on**, taken from
 * {@link columnFrame}, so a cell drawn on the plan is over the same ground as
 * the column drawn in the volume. The height a cell stands at is left out
 * entirely: the plan is a map, and east and north at one radius are what a map
 * is drawn on.
 *
 * `east` and `north` are both perpendicular to the patch's own up, and the
 * middle points along that up -- so the middle's own east and north are zero
 * and there is nothing to subtract from a cell's.
 */
export function caveCellsOf(patch: ColumnPatch, radius: number): CaveCellPlan {
	const { count, centre } = patch;
	const frame = columnFrame(centre);
	const at = new Float32Array(count * 2);
	const corners = new Float32Array(count * 12);
	const ring = new Int32Array(count * 6);
	const degree = new Uint8Array(count);
	let lowEast = Infinity;
	let highEast = -Infinity;
	let lowNorth = Infinity;
	let highNorth = -Infinity;

	for (let c = 0; c < count; c++) {
		const x = patch.directions[c * 3]!;
		const y = patch.directions[c * 3 + 1]!;
		const z = patch.directions[c * 3 + 2]!;
		const e =
			(x * frame.east.x + y * frame.east.y + z * frame.east.z) * radius;
		const n =
			(x * frame.north.x + y * frame.north.y + z * frame.north.z) *
			radius;
		at[c * 2] = e;
		at[c * 2 + 1] = n;
		if (e < lowEast) lowEast = e;
		if (e > highEast) highEast = e;
		if (n < lowNorth) lowNorth = n;
		if (n > highNorth) highNorth = n;

		const deg = patch.degree[c]!;
		degree[c] = deg;
		for (let m = 0; m < 6; m++) {
			// A pentagon has five corners and the sixth slot repeats the last,
			// so a reader drawing six points draws the pentagon rather than a
			// hexagon with one corner dragged to the origin.
			const from = Math.min(m, deg - 1);
			const cx = patch.corner[c * 18 + from * 3]!;
			const cy = patch.corner[c * 18 + from * 3 + 1]!;
			const cz = patch.corner[c * 18 + from * 3 + 2]!;
			corners[c * 12 + m * 2] =
				(cx * frame.east.x + cy * frame.east.y + cz * frame.east.z) *
				radius;
			corners[c * 12 + m * 2 + 1] =
				(cx * frame.north.x + cy * frame.north.y + cz * frame.north.z) *
				radius;
		}
		for (let k = 0; k < 6; k++) ring[c * 6 + k] = patch.ring[c * 6 + k]!;
	}

	// The rim's own hexagons stand half a cell past their centres, so the
	// rectangle is grown by one -- a plan cut at the centres clips every cell on
	// the edge of the patch in half.
	const inset = count > 1 ? Math.hypot(at[2]! - at[0]!, at[3]! - at[1]!) : 1;
	return {
		count,
		at,
		corners,
		degree,
		ring,
		low: [lowEast - inset, lowNorth - inset],
		high: [highEast + inset, highNorth + inset],
	};
}
