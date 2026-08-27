/**
 * The landscape bench's lighting rig, written once.
 *
 * **Three places want these numbers and only one of them is the shader**: the
 * shader shades with them, the renderer sends the key direction in the uniform,
 * and the markers stand balls where they shine from. Written out separately the
 * three agree until any one of them is retuned -- and a ball that has drifted
 * from the light it is a picture of is worse than no ball at all, because it is
 * read as the truth.
 *
 * **Every one of them is a direction, not a place.** A light standing at a
 * point is one that can be walked into, and how far off it stands would depend
 * on how wide the patch is; a direction is the same light at every zoom and on
 * a patch of any size.
 */

/** One light: which way it comes from, how strong, and the ball's colour. */
export interface PatchLight {
	readonly at: readonly [number, number, number];
	readonly share: number;
	readonly tint: readonly [number, number, number];
}

/**
 * The key, over the viewer's left shoulder.
 *
 * **Low, because it is the one that says which way a slope faces.** It used to
 * stand high, which was covering for a mesh whose caps pointed into the ground:
 * with that fixed the light overhead carries how bright the picture is, and the
 * key is free to come down and do the shading. Left, because relief is read the
 * way it is drawn on a map, with the light over the reader's shoulder.
 */
export const PATCH_KEY: readonly [number, number, number] = [-0.62, 0.37, 0.16];

/**
 * How high the fill stands, against its own reach across the ground.
 *
 * **Opposite the key in the horizontal, and still above the horizon.** Dropped
 * below it, the fill lights the undersides of overhangs and every wall the key
 * misses, which is uplighting -- and it takes back exactly the contrast the key
 * was placed to make. Lower than the key, so it never competes with it.
 */
export const PATCH_FILL_LIFT = 0.2;

/**
 * How strong the light from straight above is.
 *
 * **The strongest of the four, because this is a table.** A patch of columns
 * has two kinds of face -- caps and vertical walls -- and what makes the
 * structure legible is that a cap is plainly brighter than a wall. Only a light
 * overhead does that; everything nearer the horizon lights the walls and
 * flattens the caps together.
 */
export const PATCH_TOP_SHARE = 1.35;

/** How much of the light the fill carries. Enough that no face is black. */
export const PATCH_FILL_SHARE = 0.15;

/**
 * How much the light that follows the camera carries.
 *
 * **The one light that cannot leave a face unreadable**, so nothing being
 * looked at is ever lit by the sky term alone -- which is what made a patch
 * seen from the wrong side a flat silhouette. Small, because it comes from
 * where the viewer is and a strong light there flattens everything it reaches.
 */
export const PATCH_HEAD_SHARE = 0.18;

/** How far the camera light is lifted above the eye before it is normalised. */
export const PATCH_HEAD_LIFT = 1.2;

/** The fill's own direction, which is the key's, mirrored and levelled. */
export function patchFill(): [number, number, number] {
	const across = Math.hypot(PATCH_KEY[0], PATCH_KEY[2]) || 1;
	return [-PATCH_KEY[0], PATCH_FILL_LIFT * across, -PATCH_KEY[2]];
}
