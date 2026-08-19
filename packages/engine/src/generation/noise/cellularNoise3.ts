import type { CellFeature } from "./CellFeature.js";
import { hash3 } from "./hash3.js";

/** How many distinct values the permutation polynomial can return. */
const PERIOD = 289;

/**
 * How a permutation index is unpacked into a feature point inside its cell.
 *
 * The index runs to `289`, which is `7 x 7 x 6` with one to spare, so one
 * integer carries a position on a 7 by 7 by 6 grid inside the cell. `K` is a
 * seventh, `KZ` a sixth, and the two offsets move the grid so the middle of it
 * sits at the middle of the cell.
 */
const K = 1 / 7;
const K2 = 1 / 49;
const KZ = 1 / 6;
const K_OFFSET = 0.5 - K / 2;
const KZ_OFFSET = 0.5 - KZ / 2;

/**
 * What the two distances are mapped through to reach `[-1, 1]`.
 *
 * A distance is a positive number with no middle of its own, so each needs one
 * given to it. Both pairs follow one rule, measured over 2,000,000 samples at
 * jitter 1: the middle is the median, and the spread is how far the 99.9th
 * percentile sits from it. So a thousandth of the field reaches each end and
 * anything past that is held there.
 *
 * The two distributions are not the same shape. The nearest distance is nearly
 * symmetric -- median `0.524`, with the thousandth at `0.062` and `0.990` --
 * and fills both ends. The gap between the nearest two is bunched against
 * zero, median `0.158` against a thousandth at `0.816`, so it uses the top of
 * the range and only a fifth of the bottom: a flat web of seams with domes
 * between them, which is what that measure draws.
 */
const F1_MIDDLE = 0.5238;
const F1_SPREAD = 0.466;
const F2F1_MIDDLE = 0.1584;
const F2F1_SPREAD = 0.657;

/** Wrap into `[0, 289)`, for a coordinate of any size and either sign. */
function wrap(x: number): number {
	return x - Math.floor(x / PERIOD) * PERIOD;
}

/** The permutation polynomial, an integer in `[0, 289)` from an integer. */
function permute(x: number): number {
	const m = wrap(x);
	return wrap((m * 34 + 10) * m);
}

/**
 * Cellular noise at a point in space, in `[-1, 1]`.
 *
 * Space is cut into unit cells, one feature point is scattered inside each,
 * and the field is the distance from the sample to the nearest of them. The
 * twenty-seven cells around the sample are enough: a point further out than
 * that cannot be the nearest one, whatever the jitter does.
 *
 * `jitter` is how far a feature point may sit from the middle of its own cell.
 * At `0` every point is at a cell centre and the field is a regular lattice of
 * identical bumps; at `1` a point may be anywhere in its cell and the plates
 * come out at every size and shape.
 *
 * `feature` chooses which distance is reported. The nearest distance draws
 * rounded plates with a low point in each. The gap between the nearest two is
 * near zero wherever the sample sits equally far from two points, so it draws
 * the boundaries between plates as a network of lines instead.
 *
 * This is not smooth. Every other basis here is differentiable everywhere, and
 * this one has a crease along every plate boundary because the nearest point
 * changes there. That crease is the reason to reach for it and the reason not
 * to: ground built from it has edges the octave stack cannot round off.
 */
export function cellularNoise3(
	px: number,
	py: number,
	pz: number,
	seed: number,
	jitter: number,
	feature: CellFeature,
): number {
	const bx = Math.floor(px);
	const by = Math.floor(py);
	const bz = Math.floor(pz);
	const fx = px - bx;
	const fy = py - by;
	const fz = pz - bz;

	// The seed shifts where the permutation is read from, which lays a
	// different scattering of points over the same cells.
	const sx = Math.floor(hash3(0, 0, 0, seed) * PERIOD);
	const sy = Math.floor(hash3(1, 0, 0, seed) * PERIOD);
	const sz = Math.floor(hash3(2, 0, 0, seed) * PERIOD);

	let near = Infinity;
	let next = Infinity;
	for (let ox = -1; ox <= 1; ox++) {
		const hx = permute(bx + ox + sx);
		for (let oy = -1; oy <= 1; oy++) {
			const hy = permute(hx + by + oy + sy);
			for (let oz = -1; oz <= 1; oz++) {
				const h = permute(hy + bz + oz + sz);

				// Where the feature point sits inside its own cell, as a
				// position on a 7 by 7 by 6 grid.
				const jx = (h * K - Math.floor(h * K) - K_OFFSET) * jitter;
				const jy = (wrap7(Math.floor(h * K)) * K - K_OFFSET) * jitter;
				const jz = (Math.floor(h * K2) * KZ - KZ_OFFSET) * jitter;

				const dx = ox + 0.5 + jx - fx;
				const dy = oy + 0.5 + jy - fy;
				const dz = oz + 0.5 + jz - fz;
				const d = dx * dx + dy * dy + dz * dz;
				if (d < near) {
					next = near;
					near = d;
				} else if (d < next) next = d;
			}
		}
	}

	const f1 = Math.sqrt(near);
	if (feature === "f1") return clamp((F1_MIDDLE - f1) / F1_SPREAD);
	return clamp((Math.sqrt(next) - f1 - F2F1_MIDDLE) / F2F1_SPREAD);
}

/** Wrap into `[0, 7)`, for the middle digit of a packed feature position. */
function wrap7(x: number): number {
	return x - Math.floor(x / 7) * 7;
}

/** Hold a value inside `[-1, 1]`, which the other bases never leave. */
function clamp(v: number): number {
	return v < -1 ? -1 : v > 1 ? 1 : v;
}
