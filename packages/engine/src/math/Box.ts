/**
 * A box in any orientation: a centre, three axes, and a half-width along each.
 *
 * The axes are unit vectors and perpendicular to each other, so a point's
 * position inside is three dot products. Nine numbers rather than a matrix
 * because nothing here rotates one -- a box is built where it stands and tested
 * where it was built.
 *
 * What it is for is a shape a ball fits badly. A chunk is a wedge into the
 * planet: a triangle a few tens of metres across, extruded down through as much
 * crust as anybody has dug. A ball around that reaches as far sideways as it
 * does downward, and a ball cannot be widened in one direction only.
 */
export interface Box {
	readonly center: readonly [number, number, number];

	/** Three perpendicular unit vectors. */
	readonly axes: readonly [
		readonly [number, number, number],
		readonly [number, number, number],
		readonly [number, number, number],
	];

	/** Half the box's width along each axis, in the same order. */
	readonly halves: readonly [number, number, number];
}
