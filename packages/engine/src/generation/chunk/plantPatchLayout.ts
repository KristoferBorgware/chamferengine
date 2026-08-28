import { DIRECTIONS } from "../../addressing/neighbours/DIRECTIONS.js";
import { rank } from "../../addressing/lattice/rank.js";

/**
 * The shape of a chunk's planting patch, in steps from its own triangle.
 *
 * **Every chunk of a level walks the same shape.** A patch is the chunk's
 * triangle plus every cell within the plants' reach of its rim, and
 * `joinPath` maps a triangle's own `(q, r)` onto its face by `i = A + s * q`,
 * `j = B + s * r` -- a translation and a sign, because the middle child's half
 * turn negates both axes and two of them cancel. So the whole patch is one
 * table of steps, computed once and added to whichever chunk is being built.
 *
 * **Each sign gets its own table, and the steps are in the world's own terms.**
 * The turned halo is the upright one negated, so the *cells* would come free --
 * but negating a step also turns every direction into its opposite
 * (`DIRECTIONS` says it: negating an offset is `k -> k + 3`), which permutes
 * the six neighbours and changes the order a walk discovers them in. Building
 * both the same way keeps the fast path's answer identical to the walk's index
 * for index rather than merely equivalent to it, which is what makes the two
 * comparable in a test.
 *
 * What that replaces is a breadth-first walk with a map in it, which for the
 * shipped world visits `6,933` columns and is the single largest thing a chunk
 * pays before it grows a plant.
 */
export interface PlantPatchLayout {
	readonly count: number;

	/** Per column, its step from the triangle's own origin. */
	readonly di: Int32Array;
	readonly dj: Int32Array;

	/** Per column, its slot in the chunk, or `-1` for the ring past the rim. */
	readonly slot: Int32Array;

	/** Per column, the six neighbours as indices into this, `-1` off it. */
	readonly ring: Int32Array;

	/** The extremes of the steps above, for deciding whether one fits a face. */
	readonly lowDi: number;
	readonly highDi: number;
	readonly lowDj: number;
	readonly highDj: number;
	readonly lowSum: number;
	readonly highSum: number;
}

/** How many layouts are kept; a world uses two, one per orientation. */
const KEEP = 8;
const held = new Map<number, PlantPatchLayout>();

/**
 * The layout for a triangle of side `m`, a ring `hops` wide, one orientation.
 *
 * `sign` is `+1` for an upright triangle and `-1` for one the middle-child
 * descent has turned. The steps come back in the **world's** own terms, so a
 * chunk adds its origin and nothing else: `i = originI + di`.
 *
 * Built on first use and kept, because every chunk of a level and an
 * orientation asks for the same one. **The order is the walk's own order** --
 * the triangle in rank order, then one hop at a time -- so a patch built from
 * this and a patch built by walking the lattice are the same arrays, index for
 * index, and can be compared as such.
 */
export function plantPatchLayout(
	m: number,
	hops: number,
	sign: number,
): PlantPatchLayout {
	const key = (m * 4096 + hops) * 2 + (sign > 0 ? 0 : 1);
	const already = held.get(key);
	if (already) return already;

	// Room for the triangle either way round plus the ring on both sides of it.
	const span = 2 * (m + hops) + 3;
	const at = (di: number, dj: number): number =>
		(di + m + hops + 1) * span + (dj + m + hops + 1);
	const seat = new Map<number, number>();
	const di: number[] = [];
	const dj: number[] = [];
	const slot: number[] = [];
	const add = (i: number, j: number, own: number): number => {
		const key2 = at(i, j);
		const was = seat.get(key2);
		if (was !== undefined) return was;
		const index = di.length;
		seat.set(key2, index);
		di.push(i);
		dj.push(j);
		slot.push(own);
		return index;
	};

	let frontier: number[] = [];
	for (let q = 0; q <= m; q++)
		for (let r = 0; q + r <= m; r++)
			frontier.push(add(sign * q, sign * r, rank(q, r, m)));
	for (let hop = 0; hop < hops && frontier.length > 0; hop++) {
		const next: number[] = [];
		for (const c of frontier)
			for (let d = 0; d < 6; d++) {
				const step = DIRECTIONS[d]!;
				const before = di.length;
				const one = add(di[c]! + step[0]!, dj[c]! + step[1]!, -1);
				if (one >= before) next.push(one);
			}
		frontier = next;
	}

	const count = di.length;
	const ring = new Int32Array(count * 6).fill(-1);
	let lowDi = 0;
	let highDi = 0;
	let lowDj = 0;
	let highDj = 0;
	let lowSum = 0;
	let highSum = 0;
	for (let c = 0; c < count; c++) {
		for (let d = 0; d < 6; d++) {
			const step = DIRECTIONS[d]!;
			const to = seat.get(at(di[c]! + step[0]!, dj[c]! + step[1]!));
			if (to !== undefined) ring[c * 6 + d] = to;
		}
		if (di[c]! < lowDi) lowDi = di[c]!;
		if (di[c]! > highDi) highDi = di[c]!;
		if (dj[c]! < lowDj) lowDj = dj[c]!;
		if (dj[c]! > highDj) highDj = dj[c]!;
		const sum = di[c]! + dj[c]!;
		if (sum < lowSum) lowSum = sum;
		if (sum > highSum) highSum = sum;
	}

	const made: PlantPatchLayout = {
		count,
		di: Int32Array.from(di),
		dj: Int32Array.from(dj),
		slot: Int32Array.from(slot),
		ring,
		lowDi,
		highDi,
		lowDj,
		highDj,
		lowSum,
		highSum,
	};
	// A world uses one layout, or two while a knob is being dragged. The cap is
	// only here so a run that sweeps the reach cannot grow this without bound.
	if (held.size >= KEEP) held.clear();
	held.set(key, made);
	return made;
}

/**
 * Whether a layout laid at this origin stays inside one face.
 *
 * **Strictly inside, never touching an edge.** A cell on a face edge has more
 * than one name and its ring reaches onto another face, both of which the flat
 * table gets wrong -- so a patch that comes anywhere near an edge is walked
 * instead. At the shipped cut that is about `2.3%` of chunks: a face holds
 * `16,384` of them and `381` touch its boundary.
 */
export function layoutFits(
	layout: PlantPatchLayout,
	originI: number,
	originJ: number,
	n: number,
): boolean {
	return (
		originI + layout.lowDi >= 1 &&
		originJ + layout.lowDj >= 1 &&
		originI + originJ + layout.highSum <= n - 1
	);
}
