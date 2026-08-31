import type { Chunk } from "./Chunk.js";
import type { BiomeField } from "../biomes/BiomeField.js";
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
import { makeBiomeSample } from "../biomes/BiomeField.js";
import { neighbour } from "../../addressing/neighbours/neighbour.js";
import { plantBiomeMasks } from "../plants/plantBiomeMasks.js";
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

	/**
	 * The columns a plant too small to draw has left its colour on.
	 *
	 * **Under half a block a plant stops being a shape and becomes the colour
	 * of the ground it stands on.** A pine at a 64 m block has nothing to be
	 * made of, and what can be seen of a forest from the distance that block
	 * is drawn at is that the ground is green -- a fact about the surface's
	 * material rather than about geometry. So this maps a cell to the leaf
	 * block whose colour its ground cap takes, and the blocks themselves are
	 * untouched: nothing a player stands on, breaks or collides with moves,
	 * and nothing is stored.
	 *
	 * **The ring past the rim is in it too**, because the neighbouring chunk
	 * draws those cells as its own apron and has to paint them the same.
	 */
	readonly cover: ReadonlyMap<number, number>;
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
	biomes: BiomeField | null = null,
): PlantedChunk | null {
	if (layers.every((layer) => !layer.on)) return null;
	const depth = shape.subdivisionDepth;
	const n = shape.n;
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
	// **Read once a column here, the same place `top` and `groundLayer`
	// are**, rather than once a candidate root inside `growStand`: a biome
	// is a fact about the ground a column stands on, and a column's whole
	// block of roots asks about the one column they belong to.
	const biomeAt = biomes ? new Int32Array(count).fill(-1) : null;
	const biomeSample = biomes ? makeBiomeSample() : null;
	for (let c = 0; c < count; c++) {
		owned[c] = slotOf[c]! >= 0 ? 1 : 0;
		const p = latticePosition(face[c]!, n, iOf[c]!, jOf[c]!);
		directions[c * 3] = p.x;
		directions[c * 3 + 1] = p.y;
		directions[c * 3 + 2] = p.z;
		if (biomes && biomeAt)
			biomeAt[c] = biomes.readAt(p.x, p.y, p.z, biomeSample!);
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

	const patch: StandPatch = {
		count,
		level: depth,
		face: Int32Array.from(face),
		i: Int32Array.from(iOf),
		j: Int32Array.from(jOf),
		directions,
		ring,
	};

	// **The planting lattice is the finest one at every level, and a coarse
	// chunk considers the part of it that is its own.** A root is a cell, and a
	// coarse chunk's cells are not a fine chunk's cells -- hashing its own
	// would choose a different forest at every level, so a tree would come and
	// go as the player walked. But **a coarse chunk's lattice point IS a fine
	// one**: `(i, j)` at this depth is `(i << lift, j << lift)` at the world's,
	// the same direction to the bit. So the roots this chunk offers are the
	// fine roots whose coordinates are both multiples of `2^lift` -- a subset
	// chosen by the root alone, which every level agrees on, and which needs no
	// walk of its own because the chunk has already walked it.
	//
	// **What that costs is density, and what it buys is that the forest thins
	// rather than stopping.** One root in `4^lift` is offered, so a level out
	// draws a quarter of the trees and two levels a sixteenth, in exactly the
	// places the finest level puts them -- a tree appears as the player walks
	// in and never moves or vanishes. Enumerating all of them instead is what
	// `PLANT_LEVELS` used to cap: `8,392,705` lattice points in a set and three
	// arrays at six levels out, which the browser did not survive.
	const lift = rootDepth - depth;
	const roots = {
		count,
		level: rootDepth,
		face: patch.face,
		i: lift === 0 ? patch.i : patch.i.map((v) => v << lift),
		j: lift === 0 ? patch.j : patch.j.map((v) => v << lift),
		directions,
	};

	// **The map's own height at the root.** The root is the drawn column's own
	// lattice point at a finer name for it, and a point's height does not
	// depend on who asks, so this is the height the finest level reads there.
	const heights = rootHeight;

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
			// **One drawn column stands for the block of root cells it
			// covers.** A cell at this level is `2^lift` of the world's own
			// across, so the column asks all `4^lift` of them and grows the
			// first that wants a plant -- which is what keeps the forest as
			// dense as the finest level's, rather than a quarter of it a level
			// out and a sixteenth two.
			rootSpread: 1 << lift,
			biomeAt,
			biomeMasks: plantBiomeMasks(layers, biomes?.biomes ?? null),
		},
	);

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
	// The canopy that is a colour rather than a block, over the whole patch:
	// this chunk's own cells and the ring beyond them, keyed the way the
	// mesher names a cell.
	const cover = new Map<number, number>();
	for (let c = 0; c < count; c++) {
		const what = stand.cover[c]!;
		if (what === BlockType.AIR) continue;
		cover.set((face[c]! * 262144 + iOf[c]!) * 262144 + jOf[c]!, what);
	}

	return {
		plants: stand.plants,
		wood: stand.wood,
		leaf: stand.leaf,
		where: at,
		what: held,
		cover,
	};
}
