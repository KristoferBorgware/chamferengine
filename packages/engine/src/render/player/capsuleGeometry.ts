import type { PlayerBody } from "./PlayerBody.js";
import { Vec3 } from "../../math/Vec3.js";

/** Position and color, the same six floats a marker vertex carries. */
export const CAPSULE_STRIDE = 6;

/** How many sides the capsule is drawn with, around its own axis. */
const AROUND = 14;

/** How many rings each rounded end is cut into. */
const CAP = 4;

/** The color a player is drawn in. */
const BODY_COLOR = [0.42, 0.62, 0.95] as const;

/**
 * How the surface is shaded, from where its own normal points.
 *
 * **Baked, not lit.** A body lit by the scene's sun goes dark with the scene,
 * and the one thing a player marker must never do is disappear -- a capsule is
 * how someone finds themselves after flying away, and dusk is when they most
 * want to. `UP` rounds it top to bottom and `FRONT` says which way it faces.
 */
const FLOOR = 0.45;
const UP = 0.4;
const FRONT = 0.15;

/** Where the ring at each azimuth stands, so no trigonometry runs per frame. */
const COS_AROUND = new Float64Array(AROUND + 1);
const SIN_AROUND = new Float64Array(AROUND + 1);
for (let k = 0; k <= AROUND; k++) {
	const angle = (2 * Math.PI * k) / AROUND;
	COS_AROUND[k] = Math.cos(angle);
	SIN_AROUND[k] = Math.sin(angle);
}

/**
 * The rings the capsule is built from, bottom to top, as `sin` and `cos` of
 * each one's angle up the rounded end it belongs to.
 *
 * The lower end runs from straight down to level and the upper end from level
 * to straight up, so the two meet at their own level rings -- and the segment
 * between those two **is** the cylinder, with no third case to write. A
 * capsule is one stack of rings from foot to crown.
 */
const RING_SIN = new Float64Array(2 * (CAP + 1));
const RING_COS = new Float64Array(2 * (CAP + 1));

/** Whether a ring belongs to the upper rounded end, which stands `height - radius` up. */
const RING_HIGH = new Uint8Array(2 * (CAP + 1));
for (let k = 0; k <= CAP; k++) {
	const below = -Math.PI / 2 + (Math.PI / 2) * (k / CAP);
	RING_SIN[k] = Math.sin(below);
	RING_COS[k] = Math.cos(below);
	const above = (Math.PI / 2) * (k / CAP);
	RING_SIN[CAP + 1 + k] = Math.sin(above);
	RING_COS[CAP + 1 + k] = Math.cos(above);
	RING_HIGH[CAP + 1 + k] = 1;
}

const RINGS = RING_SIN.length;

/** Two triangles a quad, one quad per azimuth per gap between rings. */
const VERTICES = (RINGS - 1) * AROUND * 6;

/**
 * A player as a capsule: a cylinder with a rounded end on each.
 *
 * The whole shape sits between the feet and the top of the head -- the rounded
 * ends are pushed a radius inward rather than added to the ends -- so what is
 * drawn is the same `height` the collision and the water tests measure, and a
 * player standing on the ground is not drawn sunk into it.
 *
 * Under a thousand vertices, rebuilt when the player moves. Nothing here is
 * worth keeping between frames except the two tables above, which never
 * change.
 */
export function capsuleGeometry(body: PlayerBody): Float32Array<ArrayBuffer> {
	const up = body.position.normalize();
	// The heading is already along the ground, and squaring it against `up`
	// again costs one dot product and removes any drift a caller handed in.
	const ahead = body.heading.sub(up.scale(body.heading.dot(up)));
	const forward = ahead.length() > 1e-9 ? ahead.normalize() : anyAcross(up);
	const right = forward.cross(up).normalize();

	const radius = body.radius;
	const out = new Float32Array(VERTICES * CAPSULE_STRIDE);
	let at = 0;

	/** One vertex of ring `r` at azimuth `k`, written where the cursor is. */
	const put = (r: number, k: number): void => {
		const sin = RING_SIN[r]!;
		const cos = RING_COS[r]!;
		const around = k % AROUND;
		const ca = COS_AROUND[around]!;
		const sa = SIN_AROUND[around]!;

		// Out from the axis at this azimuth, and how far up the ring stands.
		const outX = right.x * ca + forward.x * sa;
		const outY = right.y * ca + forward.y * sa;
		const outZ = right.z * ca + forward.z * sa;
		const along =
			(RING_HIGH[r] ? body.height - radius : radius) + radius * sin;
		const wide = radius * cos;

		out[at++] = body.position.x + outX * wide + up.x * along;
		out[at++] = body.position.y + outY * wide + up.y * along;
		out[at++] = body.position.z + outZ * wide + up.z * along;

		// The surface normal is the same blend as the point, with the radius
		// divided out: `cos` across and `sin` up. Its share along the heading
		// is `cos` times how far round the ring has come.
		const shade =
			FLOOR + UP * Math.max(0, sin) + FRONT * Math.max(0, cos * sa);
		out[at++] = BODY_COLOR[0] * shade;
		out[at++] = BODY_COLOR[1] * shade;
		out[at++] = BODY_COLOR[2] * shade;
	};

	// Counter-clockwise seen from outside, so the back-facing half is culled:
	// azimuth turns from `right` toward `forward`, which is the way a right
	// handed frame turns when seen from `up`.
	for (let r = 0; r + 1 < RINGS; r++)
		for (let k = 0; k < AROUND; k++) {
			put(r, k);
			put(r, k + 1);
			put(r + 1, k + 1);
			put(r, k);
			put(r + 1, k + 1);
			put(r + 1, k);
		}

	return out;
}

/** Any unit vector across another, for a heading that says nothing. */
function anyAcross(up: Vec3): Vec3 {
	const seed = Math.abs(up.x) < 0.9 ? new Vec3(1, 0, 0) : new Vec3(0, 1, 0);
	return up.cross(seed).normalize();
}
