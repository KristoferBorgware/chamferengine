import type { RayWorld } from "chamfer/addressing";
import { Vec3 } from "chamfer/math";
import { rayWalk } from "chamfer/addressing";

/**
 * Metres a trailing camera stops short of what its own ray hit.
 *
 * A camera exactly on a face is coplanar with it, and which of the two wins a
 * pixel is then whatever the depth test happens to decide -- so the wall it
 * stopped against flickers. This is the near plane's own distance over again,
 * for the same reason.
 */
const SKIN = 0.2;

/**
 * How far back the camera has to be before it trails rather than sits at the eye.
 *
 * Under this it is the eye, exactly: an offset of a few centimetres is a first
 * person view with arithmetic on it.
 */
const TRAILS = 0.5;

/**
 * Where a trailing camera stands, once the ground is in the way.
 *
 * **The player is held out of walls and the camera is not.** It sits metres
 * behind the eye and above it, so on a hillside or in a doorway the place it
 * wants is routinely inside rock -- and a camera inside rock looks out through
 * the back of every face around it, which draws as the world turning inside
 * out.
 *
 * So the offset is walked rather than taken: the ray runs from the eye back
 * along it, and whatever it meets first is where the camera stops, pulled a
 * little nearer than the hit so it is never coplanar with the face it stopped
 * against.
 */
export function behindPlayer(
	eye: Vec3,
	look: Vec3,
	up: Vec3,
	chase: number,
	world: RayWorld,
): Vec3 {
	if (chase < TRAILS) return eye;
	const offset = up.scale(chase * 0.35).sub(look.scale(chase));
	const span = offset.length();
	if (span < 1e-6) return eye;
	const walked = rayWalk(eye, offset.scale(1 / span), world, span);
	if (!walked) return eye.add(offset);
	return eye.add(offset.scale(Math.max(0, walked.distance - SKIN) / span));
}
