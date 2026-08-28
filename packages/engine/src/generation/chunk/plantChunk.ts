import type { Chunk } from "./Chunk.js";
import type { PlantLayer } from "../plants/PlantLayer.js";
import type { PlantTemplateStore } from "../plants/PlantTemplateStore.js";
import type { StandPatch } from "../plants/growStand.js";
import type { TerrainGenerator } from "../terrain/TerrainGenerator.js";
import type { WorldShape } from "../../world/WorldShape.js";
import { BlockType } from "../terrain/BlockType.js";
import { canonicalCell } from "../../addressing/neighbours/canonicalCell.js";
import { growStand } from "../plants/growStand.js";
import { joinPath } from "../../addressing/lattice/joinPath.js";
import { latticePosition } from "../../addressing/lattice/latticePosition.js";
import { neighbour } from "../../addressing/neighbours/neighbour.js";
import { rank } from "../../addressing/lattice/rank.js";
import { layoutFits, plantPatchLayout } from "./plantPatchLayout.js";

/**
 * How far past its own rim a chunk grows plants, in metres, when nothing knows.
 *
 * **A plant whose canopy crosses a boundary is grown twice, identically, by two
 * chunks that never speak.** That is what makes vegetation terrain rather than
 * something placed on it, and it holds only while the reach covers the widest
 * canopy any species draws. This figure was measured on a stand of the shipped
 * species -- the same ground cut into chunks and generated whole comes out 0
 * cells different -- and it is a guess about every other world.
 *
 * **The templates know better and are asked instead**
 * ({@link PlantTemplateStore.reachFor}): a pre-grown plant carries how far it
 * reaches, so the ring is the width of the forest that actually grows there.
 * The shipped pines and oaks reach `17.2 m`; a redwood reaches far past this.
 * This is what is left for a caller that hands over no templates.
 */
export const PLANT_REACH = 24;

/**
 * How many levels of detail grow plants at all.
 *
 * **A chunk covers four times the ground at each level and holds the same
 * slots**, so the terrain gets cheaper with distance and the planting does the
 * opposite: the roots are chosen at the world's own lattice whatever is drawn,
 * because a coarse chunk hashing its own cells would pick a different forest at
 * every level and a tree would come and go as the player walked. Measured on
 * the shipped world -- depth 13, 1 m blocks, 64 m chunks, two layers -- one
 * chunk grows 35 plants in 760 ms at the finest level, 89 in 448 ms one level
 * out, 379 in 935 ms at two, and 2,272 in 2,440 ms at three. At six, which the
 * selection reaches, it is sixty-four times that again and the browser runs out
 * of memory before it finishes.
 *
 * **Two levels, because the third has nothing to draw with.** A block is 1 m at
 * the finest level and 2 m at the next, so a 22 m pine is 22 and 11 blocks
 * tall; at 4 m it is five blocks and one wide, and at 8 m a forest comes out as
 * bare poles at exactly the distance it should read as green. What that costs
 * is a line at the edge of the second level where the trees stop.
 */
export const PLANT_LEVELS = 2;

/** How many plants a chunk grew, and every cell they left in it. */
export interface PlantedChunk {
	readonly plants: number;
	readonly wood: number;
	readonly leaf: number;

	/**
	 * Every cell the plants wrote, as `slot * layerCount + layer`, ascending.
	 *
	 * **A plant is a block like any other, and everything that asks what is
	 * somewhere has to get the same answer.** The blocks themselves never leave
	 * the worker -- a chunk is half a megabyte of them and the thread that
	 * draws has no use for the rest -- but collision, the ray walk and what a
	 * player is standing in all ask on that thread, and they cannot read what
	 * the seed says because the seed does not know about the trees. So the
	 * cells the plants wrote come back, which is a small fraction of a chunk
	 * and the only part of it that is not a function of the address alone.
	 *
	 * Ascending, because it is searched rather than iterated.
	 */
	readonly where: Uint32Array<ArrayBuffer>;

	/** What stands in each of those cells. */
	readonly what: Uint16Array<ArrayBuffer>;
}

/**
 * Grow every plant this chunk holds, into the blocks it already has.
 *
 * **Vegetation is terrain.** A plant is grown from the address and the seed
 * alone, into the same array the ground is in, at the same layer indices -- so
 * the mesher, the ray walk, the player's collision and the delta store all see
 * it as blocks without knowing anything about plants.
 *
 * The patch it grows over is the chunk's own triangle plus the ring a canopy
 * can reach in from. Every root on that patch is offered a plant; only the
 * cells inside the triangle are written, which is what leaves the neighbour's
 * share to the neighbour and makes the two agree without asking each other.
 *
 * Nothing happens where no layer is on, so a world with no plants pays one
 * comparison.
 */
export function plantChunk(
	chunk: Chunk,
	terrain: TerrainGenerator,
	shape: WorldShape,
	layers: readonly PlantLayer[],
	seed: number,
	rootDepth: number = shape.subdivisionDepth,
	templates: PlantTemplateStore | null = null,
): PlantedChunk | null {
	if (layers.every((layer) => !layer.on)) return null;
	const depth = shape.subdivisionDepth;
	const n = shape.n;
	const fine = 1 << rootDepth;
	const m = chunk.m;
	const block = shape.blockSize;
	// **Measured off the plants that grow here**, or the constant's guess when
	// there are none to ask. A ring is most of what a chunk walks -- 6,408
	// columns against the 2,145 it holds, at 24 hops -- so the difference
	// between a guess and a measurement is most of what deciding a chunk's
	// plants costs.
	const reach = templates ? templates.reachFor(layers) : PLANT_REACH;
	const hops = Math.max(1, Math.ceil(reach / block));

	// **Every chunk of a level walks the same shape**, so the shape is worked
	// out once and this adds the chunk's own origin to it. `joinPath` maps a
	// triangle's `(q, r)` onto its face as `i = A + s * q`, `j = B + s * r` --
	// a translation and a sign, the sign being the middle child's half turn --
	// and the six lattice directions come in opposite pairs, so one table
	// serves an upright triangle and a turned one alike.
	const [originI, originJ] = joinPath(chunk.address.path, 0, 0, depth);
	const [stepI] = joinPath(chunk.address.path, 1, 0, depth);
	const layout = plantPatchLayout(m, hops, stepI - originI);

	const keyOf = (face: number, i: number, j: number): number =>
		(face * (n + 1) + i) * (n + 1) + j;
	let face: Int32Array;
	let iOf: Int32Array;
	let jOf: Int32Array;
	let slotOf: Int32Array;
	let ring: Int32Array;

	if (layoutFits(layout, originI, originJ, n)) {
		// **Nothing here touches a face edge**, which is what the fit test
		// says: no cell has a second name, no neighbour reflects onto another
		// face, and the flat table is exact. The ring is shared rather than
		// copied, because nothing ever writes to it.
		const count = layout.count;
		face = new Int32Array(count).fill(chunk.address.face);
		iOf = new Int32Array(count);
		jOf = new Int32Array(count);
		for (let c = 0; c < count; c++) {
			iOf[c] = originI + layout.di[c]!;
			jOf[c] = originJ + layout.dj[c]!;
		}
		slotOf = layout.slot;
		ring = layout.ring;
	} else {
		// **A patch near a face edge is walked**, because a cell on one has
		// more than one name and its ring reaches onto another face. About one
		// chunk in forty is here.
		const walked = walkPatch();
		face = walked.face;
		iOf = walked.i;
		jOf = walked.j;
		slotOf = walked.slot;
		ring = walked.ring;
	}

	/**
	 * The patch found by stepping the lattice, which is the answer everywhere.
	 *
	 * **Canonicalised as it is keyed**, because a cell on a face edge has more
	 * than one name and a walk that did not would enter one column twice.
	 */
	function walkPatch(): {
		face: Int32Array;
		i: Int32Array;
		j: Int32Array;
		slot: Int32Array;
		ring: Int32Array;
	} {
		const here = new Map<number, number>();
		const f: number[] = [];
		const ii: number[] = [];
		const jj: number[] = [];
		const own: number[] = [];
		const add = (
			one: { face: number; i: number; j: number },
			slot: number,
		): number => {
			const cell = canonicalCell(one.face, n, one.i, one.j);
			const key = keyOf(cell.face, cell.i, cell.j);
			const was = here.get(key);
			if (was !== undefined) {
				if (slot >= 0) own[was] = slot;
				return was;
			}
			const at = f.length;
			here.set(key, at);
			f.push(cell.face);
			ii.push(cell.i);
			jj.push(cell.j);
			own.push(slot);
			return at;
		};
		let frontier: number[] = [];
		for (let q = 0; q <= m; q++)
			for (let r = 0; q + r <= m; r++) {
				const [i, j] = joinPath(chunk.address.path, q, r, depth);
				frontier.push(
					add({ face: chunk.address.face, i, j }, rank(q, r, m)),
				);
			}
		for (let hop = 0; hop < hops && frontier.length > 0; hop++) {
			const next: number[] = [];
			for (const c of frontier)
				for (let d = 0; d < 6; d++) {
					const nb = neighbour(f[c]!, n, ii[c]!, jj[c]!, d);
					if (!nb) continue;
					const before = f.length;
					const at = add(nb, -1);
					if (at >= before) next.push(at);
				}
			frontier = next;
		}
		const links = new Int32Array(f.length * 6).fill(-1);
		for (let c = 0; c < f.length; c++)
			for (let d = 0; d < 6; d++) {
				const nb = neighbour(f[c]!, n, ii[c]!, jj[c]!, d);
				if (!nb) continue;
				const one = canonicalCell(nb.face, n, nb.i, nb.j);
				const to = here.get(keyOf(one.face, one.i, one.j));
				if (to !== undefined) links[c * 6 + d] = to;
			}
		return {
			face: Int32Array.from(f),
			i: Int32Array.from(ii),
			j: Int32Array.from(jj),
			slot: Int32Array.from(own),
			ring: links,
		};
	}

	const count = face.length;
	const directions = new Float64Array(count * 3);
	const top = new Float64Array(count);
	const groundLayer = new Int32Array(count);
	const owned = new Uint8Array(count);
	const rootHeight = new Float64Array(count);
	for (let c = 0; c < count; c++) {
		owned[c] = slotOf[c]! >= 0 ? 1 : 0;
		const p = latticePosition(face[c]!, n, iOf[c]!, jOf[c]!);
		directions[c * 3] = p.x;
		directions[c * 3 + 1] = p.y;
		directions[c * 3 + 2] = p.z;
		// **The ground as this chunk drew it**, so a plant's foot stands on the
		// block under it rather than a rounding away from one. A layer counts
		// downward from the crust top, and a stand counts upward from the
		// ground, so the two meet at the radius of the surface layer's top.
		const column = terrain.columnAt(face[c]!, iOf[c]!, jOf[c]!);
		// **The ground as it really is, not as the height field drew it.** The
		// carve and the caves hollow the top of a column after the surface is
		// decided, so a foot placed at `layerOfSurface` can stand over nothing
		// -- a tree hanging off a cliff edge or over a cave mouth. Measured on
		// the shipped world, that is **47.4%** of land columns.
		//
		// **The chunk has already answered it for everything it holds.** A
		// column's band is the first and last layer its own build left open,
		// and the first of those is this exact number. The ring past the rim
		// is not held, and its walk is deferred to `correct` below: a ring
		// column's ground is read only if a plant is rooted in it.
		const mine = slotOf[c]!;
		const surface =
			mine >= 0
				? chunk.band[mine * 2]!
				: shape.layerOfSurface(column.groundRadius);
		// A chunk counts layers downward from the crust top and a stand counts
		// slots upward from the ground, so one is the other negated.
		groundLayer[c] = -surface;
		top[c] = shape.radiusOfLayer(surface) - shape.seaLevelRadius;
		// **The map's own height at the root**, which is what says whether a
		// plant may stand here at all -- the layer the surface rounded to is a
		// block either way of it.
		rootHeight[c] = column.groundRadius - shape.seaLevelRadius;
	}

	/**
	 * Every cell a plant may root in, at the world's own depth.
	 *
	 * The chunk's triangle at that depth, plus the same reach in its own
	 * cells -- so a coarse chunk considers exactly the plants a fine one there
	 * would, and grows the same forest.
	 */
	function fineRoots(): {
		count: number;
		level: number;
		face: Int32Array;
		i: Int32Array;
		j: Int32Array;
		directions: Float64Array;
	} {
		const side = m << (rootDepth - depth);
		// The reach is metres, so it is a different number of cells at each
		// level -- and these cells are the world's own, not the drawn ones.
		const fineBlock = block / (1 << (rootDepth - depth));
		const fineHops = Math.max(1, Math.ceil(reach / fineBlock));
		const key = (f: number, i: number, j: number): number =>
			(f * (fine + 1) + i) * (fine + 1) + j;
		const held = new Set<number>();
		const rf: number[] = [];
		const ri: number[] = [];
		const rj: number[] = [];
		const push = (one: { face: number; i: number; j: number }): number => {
			const cell = canonicalCell(one.face, fine, one.i, one.j);
			const at = key(cell.face, cell.i, cell.j);
			if (held.has(at)) return -1;
			held.add(at);
			rf.push(cell.face);
			ri.push(cell.i);
			rj.push(cell.j);
			return rf.length - 1;
		};
		let edge: number[] = [];
		for (let q = 0; q <= side; q++)
			for (let r = 0; q + r <= side; r++) {
				const [i, j] = joinPath(chunk.address.path, q, r, rootDepth);
				const at = push({ face: chunk.address.face, i, j });
				if (at >= 0) edge.push(at);
			}
		for (let hop = 0; hop < fineHops && edge.length > 0; hop++) {
			const next: number[] = [];
			for (const c of edge)
				for (let d = 0; d < 6; d++) {
					const nb = neighbour(rf[c]!, fine, ri[c]!, rj[c]!, d);
					if (!nb) continue;
					const at = push(nb);
					if (at >= 0) next.push(at);
				}
			edge = next;
		}
		const where = new Float64Array(rf.length * 3);
		for (let c = 0; c < rf.length; c++) {
			const p = latticePosition(rf[c]!, fine, ri[c]!, rj[c]!);
			where[c * 3] = p.x;
			where[c * 3 + 1] = p.y;
			where[c * 3 + 2] = p.z;
		}
		return {
			count: rf.length,
			level: rootDepth,
			face: Int32Array.from(rf),
			i: Int32Array.from(ri),
			j: Int32Array.from(rj),
			directions: where,
		};
	}

	const patch: StandPatch = {
		count,
		level: depth,
		face: Int32Array.from(face),
		i: Int32Array.from(iOf),
		j: Int32Array.from(jOf),
		directions,
		ring,
	};

	// **The planting lattice is the finest one at every level.** A root is a
	// cell, and a coarse chunk's cells are not a fine chunk's cells -- hashing
	// its own would choose a different forest at every level, so a tree would
	// come and go as the player walked. This walk is therefore the same size
	// however coarsely the chunk is drawn, which makes it the one part of a
	// chunk whose cost does not fall with distance.
	const roots =
		rootDepth === depth
			? {
					count,
					level: depth,
					face: patch.face,
					i: patch.i,
					j: patch.j,
					directions,
				}
			: fineRoots();

	// **The ground at a root's own point**, not at the column it is drawn on: a
	// coarse level resamples the surface, so a shore read off the drawn cell
	// moves a metre or two every level and plants at the waterline come and go
	// with it.
	const heights =
		roots.count === count && rootDepth === depth
			? rootHeight
			: rootHeightsOf(roots);

	// **Only a ring column a plant stands in has to be walked for.** Everything
	// the chunk holds was answered by its own build, and a ring column is only
	// ever read as the ground under a root -- so the walk runs a handful of
	// times a chunk rather than a couple of thousand.
	const walked = new Uint8Array(count);
	const correct = (c: number): number => {
		if (slotOf[c]! >= 0 || walked[c]) return groundLayer[c]!;
		walked[c] = 1;
		const column = terrain.columnAt(face[c]!, iOf[c]!, jOf[c]!);
		const solid = terrain.topSolidLayer(column);
		groundLayer[c] = -solid;
		top[c] = shape.radiusOfLayer(solid) - shape.seaLevelRadius;
		return groundLayer[c]!;
	};

	const stand = growStand(
		patch,
		{ top, groundLayer, correct },
		roots,
		heights,
		layers,
		{
			seed,
			radius: shape.seaLevelRadius,
			blockMetres: block,
			rootLevel: rootDepth,
			chunkCells: m,
			chunkReach: reach,
			seaLevel: 0,
			owned,
			templates,
		},
	);

	// The map at each root's own lattice point, when those are not the drawn
	// columns.
	function rootHeightsOf(of: {
		count: number;
		face: Int32Array;
		i: Int32Array;
		j: Int32Array;
	}): Float64Array {
		const out = new Float64Array(of.count);
		for (let c = 0; c < of.count; c++)
			out[c] = terrain.map.heightAt(
				of.face[c]!,
				of.i[c]!,
				of.j[c]!,
				rootDepth,
			);
		return out;
	}

	// **Written into the layers the chunk already has**, so a plant is a block
	// like the ground under it. A stand counts slots upward from a column's own
	// surface and a chunk counts layers downward from the crust top, so one
	// subtraction turns the first into the second.
	const layerCount = chunk.layerCount;
	const where: number[] = [];
	const what: number[] = [];
	for (let c = 0; c < count; c++) {
		const slot = slotOf[c]!;
		if (slot < 0) continue;
		const base = slot * layerCount;
		const surface = -groundLayer[c]!;
		for (let s = 0; s < stand.layers; s++) {
			const plant = stand.blocks[c * stand.layers + s]!;
			if (plant === BlockType.AIR) continue;
			// A stand's own zero is the block sitting on the ground, which is
			// the layer above the surface layer.
			const layer = surface - 1 - (s - stand.sunk);
			if (layer < 0 || layer >= layerCount) continue;
			if (chunk.blocks[base + layer] !== BlockType.AIR) continue;
			chunk.blocks[base + layer] = plant;
			where.push(base + layer);
			what.push(plant);
			// The band is what the mesher walks, and a canopy stands over
			// everything the ground pass found.
			if (layer < chunk.band[slot * 2]!) chunk.band[slot * 2] = layer;
		}
	}

	// **Sorted, because the reader searches rather than scans.** The columns
	// are walked in the order the patch was laid out, which is the order the
	// triangle was enumerated in and the ring grown in -- neither of which is
	// the order a slot's rank runs in.
	const order = where.map((_, at) => at);
	order.sort((a, b) => where[a]! - where[b]!);
	const at = new Uint32Array(order.length);
	const held = new Uint16Array(order.length);
	for (let n = 0; n < order.length; n++) {
		at[n] = where[order[n]!]!;
		held[n] = what[order[n]!]!;
	}
	return {
		plants: stand.plants,
		wood: stand.wood,
		leaf: stand.leaf,
		where: at,
		what: held,
	};
}
