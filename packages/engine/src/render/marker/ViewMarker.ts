import type { Vec3 } from "../../math/Vec3.js";

/**
 * A camera drawn as an object, so a decision taken from it can be looked at.
 *
 * Which level each chunk is drawn at and which chunks are drawn at all are both
 * read from a camera, and neither is visible from that camera -- from there the
 * world always looks complete. Holding the decision at one place and flying
 * away from it is how either one is seen, and then the place itself has to be
 * on screen or there is nothing to fly back to.
 *
 * A box says where, and a cone says what the camera could see: apex on the box,
 * opening at the camera's own field of view, reaching as far as the camera
 * does.
 */
export interface ViewMarker {
	/** Where the camera stands, in world space. */
	readonly position: Vec3;

	/** Unit vector along the direction it looks. */
	readonly direction: Vec3;

	/** Half the width of the box drawn at {@link ViewMarker.position}. */
	readonly size: number;

	/**
	 * Half the angle the cone opens by, in radians.
	 *
	 * The camera's own vertical field of view, halved, so the cone's surface
	 * lies on the frustum's top and bottom planes exactly. It is narrower than
	 * the frustum across the screen, where the aspect ratio widens it, and the
	 * two agree up and down.
	 */
	readonly spread: number;

	/**
	 * How far the cone reaches along {@link ViewMarker.direction}.
	 *
	 * A length with a meaning rather than one that looks right: pass how far
	 * the camera can actually see, and the cone encloses the ground its view
	 * could have drawn.
	 */
	readonly reach: number;
}
