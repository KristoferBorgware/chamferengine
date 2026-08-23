import type { Box } from "../../math/Box.js";
import type { ChunkExtent } from "./chunkCenter.js";
import { boxAxes } from "../../math/boxAxes.js";

/**
 * The box holding a chunk's ground, from one radius to another.
 *
 * **A chunk is a wedge, not a ball.** It is a small triangle on the surface
 * extruded down through the crust, and how far down depends on how deep anybody
 * has dug: a shaft to the bottom of a 1,232 m crust needs a ball 616 m in
 * radius, 77 times the half-width of a 16 m chunk and some thousands of times
 * its volume, every cubic metre of it voting to be kept. A box grows downward
 * without growing sideways.
 *
 * The long axis is the chunk's own direction from the planet's centre. Along
 * it the wedge runs from a corner at the inner radius -- the nearest the inner
 * surface comes to the middle -- out to the outer surface at the centre, which
 * is the furthest any of it reaches.
 *
 * Across, both half-widths are the radius of the disc the triangle sits in, at
 * the outer radius where it is widest. A point of the patch is
 * `outer * sin(angle from the centre)` off the axis and the angle is largest at
 * a corner, so this contains every one of them. It is looser than following the
 * triangle's own three sides, and it cannot be wrong about a point on an arc
 * between two corners, which is where a tighter shape would have to be careful.
 */
export function chunkWedge(
	extent: ChunkExtent,
	inner: number,
	outer: number,
): Box {
	const axes = boxAxes(extent.x, extent.y, extent.z);

	// The nearest the inner surface comes to the axis's own line, and the
	// furthest the outer surface reaches along it.
	const near = inner * extent.cosRadius;
	const far = outer;
	const middle = (near + far) / 2;
	const across =
		outer * Math.sqrt(Math.max(0, 1 - extent.cosRadius * extent.cosRadius));

	return {
		center: [extent.x * middle, extent.y * middle, extent.z * middle],
		axes,
		halves: [(far - near) / 2, across, across],
	};
}
