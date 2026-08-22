import type { CoarseGrid } from "./CoarseGrid.js";
import type { ErosionOptions } from "./ErosionOptions.js";
import { DROPLET } from "./DROPLET.js";
import { acrossEdge } from "../../addressing/neighbours/acrossEdge.js";
import { barycentricOf } from "../../addressing/lookup/barycentricOf.js";
import { faceOf } from "../../addressing/lookup/faceOf.js";
import { hash3 } from "../noise/hash3.js";
import { Vec3 } from "../../math/Vec3.js";

/** How far out each axis the gradient of the blend is read, in cells. */
const PROBE = 0.5;

/** What one step ended as, after however many face edges it crossed. */
interface Landing {
	face: number;
	i: number;
	j: number;
	vi: number;
	vj: number;
}

/**
 * Cut valleys with a droplet that stands between cells rather than on one.
 *
 * The cell-to-cell walk picks the steepest of six, which is a choice between
 * six fixed directions: on ground whose gradient is gentle and smooth the same
 * direction keeps winning, and the walk marches along one axis of the lattice.
 * Measured on the shipped map, 18.3% of its steps are part of a run of eight or
 * more in one unchanged direction, against 1.4% here.
 *
 * This one carries a **position and a direction**. The position is a fractional
 * `(i, j)` on a face; the ground under it is the blend of the three lattice
 * points around it, which is the same blend the terrain generator reads the map
 * with. The direction is downhill on that blend, mixed with the direction the
 * droplet already had, so it cannot turn instantly and it is never one of six.
 *
 * **The two lattice axes are the same length and sixty degrees apart**, so the
 * steepest way down is not where the raw pair of partial derivatives points.
 * The metric between the axes is `[[1, 0.5], [0.5, 1]]`, and downhill is its
 * inverse applied to those partials, which is where the thirds below come from.
 * Reading the pair straight tilts every droplet toward one axis, which is the
 * fault this walk exists to remove.
 *
 * **The cut is spread over the same three points by the same weights.** A
 * droplet standing on exactly one cell can only cut a spike into it, and a pass
 * built out of spikes adds high-frequency roughness: the cell-to-cell walk
 * takes the median hillslope from 0.469 to 0.658 at full strength, where this
 * takes it to 0.527.
 *
 * **A step that leaves the face is cut at the edge and finished on the other
 * side**, so the twenty faces are one surface to a droplet and the thirty seams
 * take the same water as everywhere else. What stops early is a droplet that
 * reaches one of the twelve pentagons, where one reflection is not enough:
 * 0.0% of them at the shipped level and 0.1% at level 6.
 *
 * Every draw is hashed from the seed and the droplet's number, and droplets run
 * one after another, so the result does not depend on anything but the seed.
 * Returns how many droplets the strength implies.
 */
export function erodeFreeDroplets(
	grid: CoarseGrid,
	height: Float64Array,
	seed: number,
	strength: number,
	cellMetres: number,
	options: ErosionOptions = {},
): number {
	const maxCut = options.maxCut ?? DROPLET.maxCut;
	const inertia = options.inertia ?? DROPLET.inertia;
	const droplets = Math.round(strength * DROPLET.perCell * grid.count);
	if (droplets <= 0) return 0;
	const from = options.from ?? 0;
	const until = Math.min(droplets, from + (options.take ?? droplets));
	const n = grid.n;

	// The three lattice points under a fractional position, the weights to mix
	// them with, and the two weight triples a step is tested against. Held out
	// here because this runs a few tens of millions of times and one object
	// apiece is the layout that measures 15x slower.
	const cells = [0, 0, 0];
	const weights = [0, 0, 0];
	const cornerI = [0, 0, 0];
	const cornerJ = [0, 0, 0];
	const standing: [number, number, number] = [0, 0, 0];
	const going: [number, number, number] = [0, 0, 0];
	const landed: Landing = { face: 0, i: 0, j: 0, vi: 0, vj: 0 };

	/** Fill `cells` and `weights`, or report that the point has no ground. */
	function corners(face: number, fi: number, fj: number): boolean {
		const i0 = Math.floor(fi);
		const j0 = Math.floor(fj);
		const a = fi - i0;
		const b = fj - j0;
		// The remainders land in one of the two triangles the square of steps is
		// cut into, and which one decides the three corners.
		if (a + b <= 1) {
			cornerI[0] = i0;
			cornerJ[0] = j0;
			cornerI[1] = i0 + 1;
			cornerJ[1] = j0;
			cornerI[2] = i0;
			cornerJ[2] = j0 + 1;
			weights[0] = 1 - a - b;
			weights[1] = a;
			weights[2] = b;
		} else {
			cornerI[0] = i0 + 1;
			cornerJ[0] = j0;
			cornerI[1] = i0;
			cornerJ[1] = j0 + 1;
			cornerI[2] = i0 + 1;
			cornerJ[2] = j0 + 1;
			weights[0] = 1 - b;
			weights[1] = 1 - a;
			weights[2] = a + b - 1;
		}
		for (let t = 0; t < 3; t++) {
			const cell = grid.indexNear(face, cornerI[t]!, cornerJ[t]!);
			if (cell < 0) return false;
			cells[t] = cell;
		}
		return true;
	}

	/** The ground under a fractional position, or `NaN` where there is none. */
	function groundAt(face: number, fi: number, fj: number): number {
		if (!corners(face, fi, fj)) return NaN;
		return (
			weights[0]! * height[cells[0]!]! +
			weights[1]! * height[cells[1]!]! +
			weights[2]! * height[cells[2]!]!
		);
	}

	/** Add `amount` to the three points the droplet is standing over. */
	function spread(
		face: number,
		fi: number,
		fj: number,
		amount: number,
	): void {
		if (!corners(face, fi, fj)) return;
		for (let t = 0; t < 3; t++)
			height[cells[t]!] = height[cells[t]!]! + weights[t]! * amount;
	}

	/**
	 * Take one step, cut at each face edge it reaches and carried onto the next
	 * face.
	 *
	 * Three passes, because a step of one cell can cross two edges where faces
	 * meet at an icosahedron vertex, and the third is what leaves the loop.
	 */
	function step(
		face: number,
		fi: number,
		fj: number,
		di: number,
		dj: number,
		vi: number,
		vj: number,
	): Landing {
		let left = 1;
		for (let crossing = 0; crossing < 3 && left > 1e-9; crossing++) {
			standing[0] = n - fi - fj;
			standing[1] = fi;
			standing[2] = fj;
			going[0] = -di - dj;
			going[1] = di;
			going[2] = dj;
			// The first edge this step runs into, and how much of the step gets
			// there.
			let reached = left;
			let leaving = -1;
			for (let t = 0; t < 3; t++) {
				if (going[t]! >= 0) continue;
				const share = standing[t]! / -going[t]!;
				if (share < reached) {
					reached = share;
					leaving = t;
				}
			}
			fi += di * reached;
			fj += dj * reached;
			left -= reached;
			if (leaving < 0) break;
			// Standing on the edge. The position does not move; the step and the
			// direction carried into it are rewritten under the neighbouring
			// face's name.
			standing[0] = n - fi - fj;
			standing[1] = fi;
			standing[2] = fj;
			const at = acrossEdge(face, standing, leaving);
			const walk = acrossEdge(face, going, leaving);
			going[0] = -vi - vj;
			going[1] = vi;
			going[2] = vj;
			const carried = acrossEdge(face, going, leaving);
			face = at.face;
			fi = at.i;
			fj = at.j;
			di = walk.i;
			dj = walk.j;
			vi = carried.i;
			vj = carried.j;
		}
		landed.face = face;
		landed.i = fi;
		landed.j = fj;
		landed.vi = vi;
		landed.vj = vj;
		return landed;
	}

	for (let drop = from; drop < until; drop++) {
		const start = Math.min(
			grid.count - 1,
			Math.floor(hash3(drop & 0xffff, drop >>> 16, 0, seed) * grid.count),
		);
		// A cell's own face and offset, recovered from the direction the grid
		// stored for it. A droplet starts anywhere in the cell rather than on
		// its centre, or every droplet in a cell walks the same line.
		const where = new Vec3(
			grid.directions[start * 3]!,
			grid.directions[start * 3 + 1]!,
			grid.directions[start * 3 + 2]!,
		);
		let face = faceOf(where);
		const w = barycentricOf(face, where);
		let fi = w[1] * n + hash3(drop, 5, 0, seed) - 0.5;
		let fj = w[2] * n + hash3(drop, 9, 0, seed) - 0.5;
		// The scatter can push a start past its own face. Standing exactly on
		// the cell is where it came from and is always inside.
		if (fi < 0 || fj < 0 || fi + fj > n) {
			fi = w[1] * n;
			fj = w[2] * n;
		}
		let sediment = 0;
		let speed = 1;
		let water = 1;
		let vi = 0;
		let vj = 0;

		for (let taken = 0; taken < DROPLET.maxSteps; taken++) {
			const here = groundAt(face, fi, fj);
			if (!Number.isFinite(here)) break;
			// The gradient of the blend, read half a step out on each axis. Half
			// rather than one, because a whole step reaches past the three
			// points the height came from.
			const alongI = groundAt(face, fi + PROBE, fj);
			const alongJ = groundAt(face, fi, fj + PROBE);
			if (!Number.isFinite(alongI) || !Number.isFinite(alongJ)) {
				spread(face, fi, fj, sediment);
				break;
			}
			const gi = (alongI - here) / PROBE;
			const gj = (alongJ - here) / PROBE;
			// Downhill, through the inverse of the metric the two axes span.
			const pi = -(4 * gi - 2 * gj) / 3;
			const pj = -(4 * gj - 2 * gi) / 3;
			vi = vi * inertia + pi * (1 - inertia);
			vj = vj * inertia + pj * (1 - inertia);
			// The length of a step on axes sixty degrees apart is not the length
			// of the pair that names it.
			const length = Math.sqrt(vi * vi + vi * vj + vj * vj);
			if (length < 1e-12) {
				spread(face, fi, fj, sediment);
				break;
			}
			const moved = step(face, fi, fj, vi / length, vj / length, vi, vj);
			const there = groundAt(moved.face, moved.i, moved.j);
			if (!Number.isFinite(there)) {
				spread(face, fi, fj, sediment);
				break;
			}
			const fall = here - there;
			// Momentum can carry a droplet uphill. It has run into a wall, and
			// what it holds settles where it stands.
			if (fall <= 0) {
				spread(face, fi, fj, sediment);
				break;
			}

			const gradient = Math.max(fall / cellMetres, DROPLET.minGradient);
			const capacity = gradient * speed * water * DROPLET.capacity;
			if (sediment > capacity) {
				const put = (sediment - capacity) * DROPLET.depositRate;
				sediment -= put;
				spread(face, fi, fj, put);
			} else {
				const cut = Math.min(
					(capacity - sediment) * DROPLET.erosionRate,
					fall * maxCut,
				);
				sediment += cut;
				spread(face, fi, fj, -cut);
			}

			speed = Math.sqrt(
				Math.max(0, speed * speed + fall * DROPLET.gravity),
			);
			water *= 1 - DROPLET.evaporation;
			face = moved.face;
			fi = moved.i;
			fj = moved.j;
			vi = moved.vi;
			vj = moved.vj;
		}
	}
	return droplets;
}
