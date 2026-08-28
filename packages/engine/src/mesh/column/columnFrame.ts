import { Vec3 } from "../../math/Vec3.js";

/**
 * The three axes a patch is drawn in: out of the ground, east, and north.
 *
 * **A patch is drawn flat, in metres from its own middle**, rather than on the
 * sphere: a patch a few kilometres across is looked at from a few kilometres
 * away, and a position carrying the planet's whole radius spends its `float32`
 * on ground nobody is looking at.
 *
 * There is no global north (invariant 8), so the frame is built from the
 * patch's own up: a pole to lean on, swapped for another wherever the first one
 * is the up itself, and two cross products. Anything that has to agree with a
 * column mesh about where a cell is on screen -- a cut across the patch, a plan
 * of it -- reads its axes from here rather than deriving a second set.
 */
export function columnFrame(at: Vec3): {
	up: Vec3;
	east: Vec3;
	north: Vec3;
} {
	const up = at.normalize();
	const pole = new Vec3(0, 1, 0);
	const along = Math.abs(up.dot(pole)) > 0.999 ? new Vec3(1, 0, 0) : pole;
	const east = along.cross(up).normalize();
	return { up, east, north: up.cross(east).normalize() };
}
