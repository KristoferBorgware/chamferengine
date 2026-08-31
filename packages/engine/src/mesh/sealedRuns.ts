import type { Chunk } from "../generation/chunk/Chunk.js";
import type { ColumnSampler } from "../generation/chunk/ColumnSampler.js";
import { joinPath } from "../addressing/lattice/joinPath.js";
import { neighbour } from "../addressing/neighbours/neighbour.js";
import { opacityOf } from "./opacityOf.js";

/** One cell's stretches of open space, and whether each reaches the outside. */
interface AirNode {
	/** The representation the cell was found under, for stepping its ring. */
	readonly face: number;
	readonly i: number;
	readonly j: number;

	/** Flat `[from, to]` layer pairs, one per stretch, top down. */
	readonly runs: number[];

	/** Per stretch, whether the flood has reached it. */
	readonly open: boolean[];

	/** Whether the cell is in this chunk's triangle at all. */
	readonly inside: boolean;
}

/**
 * The air in this chunk that nothing outside it can ever see.
 *
 * **A face is only worth drawing if somebody can be on the other side of it.**
 * The mesher emits a face wherever a solid cell meets a less solid one, and
 * for a sealed pocket -- air with no way through to the sky or to the chunk's
 * edge -- that surrounds the whole pocket with walls, floors and roofs that
 * are invisible from everywhere until a player digs in. Digging in rebuilds
 * the chunk, so the walls appear with the hole.
 *
 * **What this is worth depends on how the world's caves are shaped, and at
 * the shipped knobs it is small** (`tools/trial-cave-lod.ts`): the cave rule
 * is one folded sheet, deliberately connected -- the largest system holds
 * `99%` of the void -- so nearly every stretch of cave air reaches the chunk's
 * rim somewhere and the rim has to count as open. Measured with caves to
 * 200 m, the cull removes about `1%` of a caved chunk's triangles: exactly
 * the small isolated systems that fit inside one chunk. Squeeze the band
 * until the sheet shatters and it removes much more; and a room a player
 * walls off is culled to the byte, whatever the knobs. The flood itself costs
 * about a tenth of a chunk's mesh time, which is why the worker only runs it
 * where below-ground air can exist at all.
 *
 * **What can be seen is what connected air can reach.** Sight crosses a cell
 * only where it is not solid, so the visible air is the flood of the open sky
 * through everything air, water or leaf -- leaves whether or not the cutout
 * switch is on, because a leaf with holes in its picture is a leaf a viewer
 * sees past, and treating one as solid would seal the ground under a dense
 * canopy. Two stretches of air connect where they share a cell boundary: side
 * by side on an overlapping layer, or stacked in one column -- which a stretch
 * already is, being maximal. A corner-only touch connects nothing, the same
 * rule the grid itself keeps (invariant 11).
 *
 * **The chunk's edge counts as outside.** A pocket whose only mouth is in the
 * next chunk over still has to be drawn, and this chunk cannot know -- so
 * every stretch of air in the ring just past the triangle is taken as open,
 * and anything connected to the boundary is kept. That over-draws exactly one
 * case, a pocket that touches the rim and opens nowhere at all, and it is what
 * makes the cull safe with no knowledge of the neighbours.
 *
 * Returns the **sealed** stretches, keyed by the caller's own cell naming, and
 * `null` when there are none -- which is every chunk of a caveless world, so
 * the mesher's fast path stays exactly as it was.
 */
export function sealedRuns(
	chunk: Chunk,
	sampler: ColumnSampler,
	name: (face: number, i: number, j: number) => number,
): Map<number, number[]> | null {
	const depth = chunk.depth;
	const face = chunk.address.face;
	const layers = chunk.layerCount;
	const m = chunk.m;

	const nodes = new Map<number, AirNode>();
	/** Seeds: `[name, runIndex]` pairs, flat. */
	const queue: number[] = [];

	const add = (f: number, i: number, j: number, inside: boolean): void => {
		const key = name(f, i, j);
		if (nodes.has(key)) return;
		const column = sampler.columnAt(f, i, j);
		const blocks = column.blocks;
		const runs: number[] = [];
		const open: boolean[] = [];
		// Above `first` every layer is air by the band's own contract, so the
		// sky is one stretch written down without scanning it.
		const first = Math.min(column.first, layers);
		if (first > 0) {
			runs.push(0, first - 1);
			open.push(false);
		}
		// Below `last` every layer is solid, so the scan stops there.
		const last = Math.min(column.last, layers - 1);
		let from = -1;
		for (let layer = first; layer <= last; layer++) {
			// Leaves pass whatever the cutout switch says: a viewer sees
			// through the picture's holes, so air behind a canopy is open.
			const passes = opacityOf(blocks[layer]!, true) !== 2;
			if (passes && from < 0) from = layer;
			if (!passes && from >= 0) {
				runs.push(from, layer - 1);
				open.push(false);
				from = -1;
			}
		}
		if (from >= 0) {
			runs.push(from, last);
			open.push(false);
		}
		nodes.set(key, { face: f, i, j, runs, open, inside });
		for (let at = 0; at < open.length; at++) {
			// Open from the start: a stretch touching the crust top is under
			// the sky, and any stretch of a cell past the rim is the outside.
			if ((at === 0 && runs[0] === 0) || !inside) {
				open[at] = true;
				queue.push(key, at);
			}
			if (inside) break;
		}
	};

	const n = 1 << depth;
	for (let q = 0; q <= m; q++)
		for (let r = 0; q + r <= m; r++) {
			const [i, j] = joinPath(chunk.address.path, q, r, depth);
			add(face, i, j, true);
		}
	// The ring one step past the triangle, reached from its edge rows. The
	// mesher generates these very columns for its rim and its apron, through
	// the same sampler, so nothing here is paid for twice.
	for (let q = 0; q <= m; q++)
		for (let r = 0; q + r <= m; r++) {
			if (q !== 0 && r !== 0 && q + r !== m) continue;
			const [i, j] = joinPath(chunk.address.path, q, r, depth);
			for (let k = 0; k < 6; k++) {
				const nb = neighbour(face, n, i, j, k);
				if (nb) add(nb.face, nb.i, nb.j, false);
			}
		}

	while (queue.length > 0) {
		const run = queue.pop()!;
		const key = queue.pop()!;
		const node = nodes.get(key)!;
		const from = node.runs[run * 2]!;
		const to = node.runs[run * 2 + 1]!;
		for (let k = 0; k < 6; k++) {
			const nb = neighbour(node.face, n, node.i, node.j, k);
			if (!nb) continue;
			const other = nodes.get(name(nb.face, nb.i, nb.j));
			if (!other) continue;
			for (let at = 0; at < other.open.length; at++) {
				if (other.open[at]) continue;
				if (other.runs[at * 2]! > to || other.runs[at * 2 + 1]! < from)
					continue;
				other.open[at] = true;
				queue.push(name(nb.face, nb.i, nb.j), at);
			}
		}
	}

	let sealed: Map<number, number[]> | null = null;
	for (const [key, node] of nodes) {
		if (!node.inside) continue;
		let kept: number[] | null = null;
		for (let at = 0; at < node.open.length; at++)
			if (!node.open[at]) {
				kept ??= [];
				kept.push(node.runs[at * 2]!, node.runs[at * 2 + 1]!);
			}
		if (kept) {
			sealed ??= new Map();
			sealed.set(key, kept);
		}
	}
	return sealed;
}
