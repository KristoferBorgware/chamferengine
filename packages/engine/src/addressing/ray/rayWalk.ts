import type { CellRef } from "../../edit/CellRef.js";
import type { RayHit } from "./RayHit.js";
import type { RayWorld } from "./RayWorld.js";
import type { Vec3 } from "../../math/Vec3.js";
import { acrossEdge } from "../neighbours/acrossEdge.js";
import { faceOf } from "../lookup/faceOf.js";
import { faceWeights } from "./faceWeights.js";
import { hexRound } from "../lattice/hexRound.js";

/** How many cells a walk may step before it gives up. */
const STEP_LIMIT = 4096;

/**
 * Step a ray cell to cell and return the first solid one it meets.
 *
 * Central projection from the planet's centre onto a face plane is the gnomonic
 * projection, which maps great circles to straight lines — and a ray together
 * with the origin defines a plane, so its track over the ground is a great
 * circle. The track is therefore exactly straight in a face's barycentric
 * coordinates, and so is every boundary it crosses, because a cell is the
 * region a barycentric rounding maps to a lattice point. Neither is
 * approximated and nothing is re-projected between steps.
 *
 * Four families of boundary. Three are hexagon edges, one per **pair** of
 * weights: the bisector between two lattice points is where a difference of two
 * weights is halfway, so a cell is `|(a-b) - (A-B)| <= 1` and its two rotations,
 * and crossing one moves `+1` on one weight and `-1` on another — the six
 * neighbours of the ring. Reading one weight on its own instead describes the
 * hexagon turned 30 degrees from the cell, which holds for three quarters of it.
 * The fourth family is radial: layer boundaries are concentric spheres and
 * `|P + t*d| = r` is a quadratic.
 *
 * Each family gives `t` by division, the nearest is stepped, and the loop
 * repeats. Nothing here reads a chunk, a mesh or a collider, so the count of
 * steps follows the reach: a twelve-block reach walks about eight cells on a
 * planet of 40,962 surface cells and about eight on one of 167,772,162.
 */
export function rayWalk(
	origin: Vec3,
	direction: Vec3,
	world: RayWorld,
	maxDistance: number,
): RayHit | null {
	// A length rather than a ratio: `direction` is a unit vector, so this is a
	// distance far under a block and far over the noise in a root.
	const eps = maxDistance * 1e-9;
	const n = world.n;

	let face = faceOf(origin.normalize());
	let w0 = faceWeights(face, origin);
	let wd = faceWeights(face, direction);
	let s0 = w0[0] + w0[1] + w0[2];
	let sd = wd[0] + wd[1] + wd[2];
	let [ka, kb, kc] = hexRound(
		(n * w0[0]) / s0,
		(n * w0[1]) / s0,
		(n * w0[2]) / s0,
		n,
	);
	let layer = world.layerOfRadius(origin.length());
	let t = 0;

	const dd = direction.dot(direction);
	const pd = origin.dot(direction);
	const pp = origin.dot(origin);

	let previous: CellRef | null = null;
	let entered = 0;
	for (let step = 0; step < STEP_LIMIT; step++) {
		const cell: CellRef = { face, i: kb, j: kc, layer };
		if (world.solidAt(cell))
			return { cell, previous, distance: entered, stepped: step + 1 };
		if (t >= maxDistance) return null;

		let best = Infinity;
		let kind = -1;
		let hx = 0;
		let hy = 0;
		let hup = false;
		let leaving = 0;

		// the three hexagon families, two planes each
		const k: [number, number, number] = [ka, kb, kc];
		for (let pair = 0; pair < 3; pair++) {
			const x = pair;
			const y = (pair + 1) % 3;
			const d0 = w0[x]! - w0[y]!;
			const dv = wd[x]! - wd[y]!;
			const g = k[x]! - k[y]!;
			for (const target of [g + 1, g - 1]) {
				const den = n * dv - target * sd;
				if (den === 0) continue;
				const at = (target * s0 - n * d0) / den;
				if (at > t + eps && at < best) {
					best = at;
					kind = 0;
					hx = x;
					hy = y;
					hup = target > g;
				}
			}
		}

		// the face's own three edges: a weight going from positive to negative.
		// The sign it holds now is part of the test -- the weight left behind by
		// a crossing sits at zero and climbs, and a root read off it alone lands
		// back on the edge just left.
		for (let x = 0; x < 3; x++) {
			if (wd[x]! >= 0) continue;
			if (w0[x]! + t * wd[x]! <= eps) continue;
			const at = -w0[x]! / wd[x]!;
			if (at > t + eps && at < best) {
				best = at;
				kind = 1;
				leaving = x;
			}
		}

		// the radial family: the layer boundary above and the one below
		for (const r of [
			world.radiusOfLayer(layer),
			world.radiusOfLayer(layer + 1),
		]) {
			const disc = pd * pd - dd * (pp - r * r);
			if (disc < 0) continue;
			const root = Math.sqrt(disc);
			for (const at of [(-pd - root) / dd, (-pd + root) / dd])
				if (at > t + eps && at < best) {
					best = at;
					kind = 2;
				}
		}

		if (!isFinite(best) || best > maxDistance) return null;
		previous = cell;
		entered = best;
		t = best;

		if (kind === 0) {
			const move = [0, 0, 0];
			move[hx] = hup ? 1 : -1;
			move[hy] = hup ? -1 : 1;
			ka += move[0]!;
			kb += move[1]!;
			kc += move[2]!;
		} else if (kind === 1) {
			// A face edge is not a cell boundary. Cells straddle it, so nothing
			// is entered and nothing is left -- the same cell is written under
			// the other face's name. The NAME comes from the reflection, which
			// is integer arithmetic and lands on the same cell every time. The
			// FRAME is solved for again from the ray, because that reflection
			// unfolds the two faces flat rather than turning one frame into the
			// other, and moves a direction it is handed by over two degrees.
			const named = acrossEdge(face, [ka, kb, kc], leaving);
			face = named.face;
			ka = n - named.i - named.j;
			kb = named.i;
			kc = named.j;
			w0 = faceWeights(face, origin);
			wd = faceWeights(face, direction);
			s0 = w0[0] + w0[1] + w0[2];
			sd = wd[0] + wd[1] + wd[2];
		} else {
			layer = world.layerOfRadius(
				origin.add(direction.scale(t + eps)).length(),
			);
		}
	}
	return null;
}
