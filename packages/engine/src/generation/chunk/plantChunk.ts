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

/**
 * How far past its own rim a chunk grows plants, in metres.
 *
 * **A plant whose canopy crosses a boundary is grown twice, identically, by two
 * chunks that never speak.** That is what makes vegetation terrain rather than
 * something placed on it, and it holds only while this covers the widest canopy
 * any species reaches: measured on a stand of the shipped species, the widest
 * plant reaches about 20 m sideways from its own trunk, and at 24 m the same
 * ground cut into chunks and generated whole comes out 0 cells different.
 */
export const PLANT_REACH = 24;

/**
 * How many layers under the height field a plant will look for its footing.
 *
 * The carve and the caves both hollow the top of a column after the surface is
 * decided, so the block a plant stands on is at or a little under where the
 * height field put the ground. Deeper than this and the column has been cut
 * away rather than lowered -- a cave mouth or the foot of a sheer face -- and
 * nothing is planted at all, because a tree at the bottom of a shaft is worse
 * than no tree.
 */
export const PLANT_DROP = 3;

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
	const hops = Math.max(1, Math.ceil(PLANT_REACH / block));

	// The chunk's own lattice points, then everything within reach of them.
	// **Canonicalised as they are keyed**, because a cell on a face edge has
	// more than one name and a walk that did not would enter one column twice.
	const keyOf = (face: number, i: number, j: number): number =>
		(face * (n + 1) + i) * (n + 1) + j;
	const seen = new Map<number, number>();
	const face: number[] = [];
	const iOf: number[] = [];
	const jOf: number[] = [];
	// Where an owned column lives in the chunk's own array, `-1` for the ring
	// past its rim -- which is grown from and never written to.
	const slotOf: number[] = [];
	const add = (
		one: { face: number; i: number; j: number },
		slot: number,
	): number => {
		const cell = canonicalCell(one.face, n, one.i, one.j);
		const key = keyOf(cell.face, cell.i, cell.j);
		const held = seen.get(key);
		if (held !== undefined) {
			if (slot >= 0) slotOf[held] = slot;
			return held;
		}
		const at = face.length;
		seen.set(key, at);
		face.push(cell.face);
		iOf.push(cell.i);
		jOf.push(cell.j);
		slotOf.push(slot);
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
				const nb = neighbour(face[c]!, n, iOf[c]!, jOf[c]!, d);
				if (!nb) continue;
				const before = face.length;
				const at = add(nb, -1);
				if (at >= before) next.push(at);
			}
		frontier = next;
	}

	/**
	 * The topmost layer of a column that actually holds a block, or `-1`.
	 *
	 * **The height field is where the ground would be, not where it is.** The
	 * carve cuts cliffs and overhangs into the top of a column and the caves
	 * hollow it, both after the surface is decided -- so a plant whose foot is
	 * placed at `layerOfSurface` can stand on nothing at all, which is a tree
	 * floating over a cliff edge or over a cave mouth. Walking down from there
	 * finds the block it should stand on, at `blockAt` a step and almost always
	 * none: the surface layer itself is solid over the whole of an uncarved
	 * world.
	 *
	 * **Bounded, because a hole is not a lower ground.** Past
	 * {@link PLANT_DROP} layers the column has been cut away rather than
	 * lowered -- a cave mouth, a sheer face, an overhang with air under it --
	 * and the answer is that nothing grows there rather than something growing
	 * at the bottom of it.
	 */
	function solidTop(
		column: ReturnType<TerrainGenerator["columnAt"]>,
	): number {
		const from = shape.layerOfSurface(column.groundRadius);
		for (let step = 0; step <= PLANT_DROP; step++) {
			const layer = from + step;
			if (layer >= shape.crustDepth) return -1;
			if (terrain.blockAt(column, layer) !== BlockType.AIR) return layer;
		}
		return -1;
	}

	const count = face.length;
	const directions = new Float64Array(count * 3);
	const ring = new Int32Array(count * 6).fill(-1);
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
		for (let d = 0; d < 6; d++) {
			const nb = neighbour(face[c]!, n, iOf[c]!, jOf[c]!, d);
			if (!nb) continue;
			const one = canonicalCell(nb.face, n, nb.i, nb.j);
			const to = seen.get(keyOf(one.face, one.i, one.j));
			if (to !== undefined) ring[c * 6 + d] = to;
		}
		// **The ground as this chunk drew it**, so a plant's foot stands on the
		// block under it rather than a rounding away from one. A layer counts
		// downward from the crust top, and a stand counts upward from the
		// ground, so the two meet at the radius of the surface layer's top.
		const column = terrain.columnAt(face[c]!, iOf[c]!, jOf[c]!);
		const solid = solidTop(column);
		// **A column with nothing at its top still needs a ground to measure
		// from**, because a neighbour's canopy is written into it and every
		// slot is counted from this column's own surface. It is the height
		// field's answer, and `rootHeight` below is what refuses the plant.
		const surface =
			solid >= 0 ? solid : shape.layerOfSurface(column.groundRadius);
		// A chunk counts layers downward from the crust top and a stand counts
		// slots upward from the ground, so one is the other negated.
		groundLayer[c] = -surface;
		top[c] = shape.radiusOfLayer(surface) - shape.seaLevelRadius;
		// **The map's own height at the root**, which is what says whether a
		// plant may stand here at all -- the layer the surface rounded to is a
		// block either way of it. A column the carve or a cave hollowed out
		// from under its own surface reads `-1` and is never planted.
		rootHeight[c] =
			solid < 0 ? -1 : column.groundRadius - shape.seaLevelRadius;
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
		const fineHops = Math.max(1, Math.ceil(PLANT_REACH / fineBlock));
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

	const stand = growStand(
		patch,
		{ top, groundLayer },
		roots,
		heights,
		layers,
		{
			seed,
			radius: shape.seaLevelRadius,
			blockMetres: block,
			rootLevel: rootDepth,
			chunkCells: m,
			chunkReach: PLANT_REACH,
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
