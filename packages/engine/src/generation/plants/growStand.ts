import type { PlantLayer } from "./PlantLayer.js";
import type { PlantTemplateStore } from "./PlantTemplateStore.js";
import type { PlantRoots } from "./plantRoots.js";
import type { NoiseSettings } from "../noise/NoiseSettings.js";
import { Vec3 } from "../../math/Vec3.js";
import { directionToCell } from "../../addressing/lookup/directionToCell.js";
import { emptySkeleton } from "./PlantSkeleton.js";
import { canonicalCell } from "../../addressing/neighbours/canonicalCell.js";
import { growPlant } from "./growPlant.js";
import { hash3 } from "../noise/hash3.js";
import { hexRound } from "../../addressing/lattice/hexRound.js";
import { octaveOffsets } from "../noise/octaveOffsets.js";
import { plantDensityAt } from "./plantDensityAt.js";
import { plantFrame } from "./PlantFrame.js";
import { plantLayerNoise } from "./plantLayerNoise.js";
import { plantSalt } from "./plantSalt.js";
import { cellOffset } from "../../addressing/lattice/cellOffset.js";
import { orientTemplate } from "./orientTemplate.js";
import { valueNoise3 } from "../noise/valueNoise3.js";
import { BLOCK_NAMES, BlockType } from "../terrain/BlockType.js";
import { plantBlocksOf } from "./PLANT_BLOCKS.js";

/**
 * Slots of headroom under a column's own ground.
 *
 * A canopy hanging out over a drop reaches below the ground the trunk stands
 * on, and a slot index is counted from that ground -- so the column needs room
 * under it as well as over it.
 */
export const STAND_SUNK = 8;

/** The most slots a column ever holds, however tall the tallest species is. */
const MAX_STAND_LAYERS = 320;

/** How many failing cells a stamp's flood may step past. */
const SLACK = 1;

/** Seed offset for the noise that cuts a leaf cluster into a canopy. */
const LEAF_SEED_OFFSET = 71;

/** Seed offsets for a plant's own size and its own bend. */
const SIZE_SEED_OFFSET = 77;
const ROLL_SEED_OFFSET = 55;

/** Seed offsets for which pre-grown plant stands here, and which way round. */
const VARIANT_SEED_OFFSET = 91;
const TURN_SEED_OFFSET = 113;

/** How many ways round a template may be laid: six turns, each mirrored. */
const TURNS = 12;

/**
 * The drawn lattice a stand is written into.
 *
 * A {@link ColumnPatch} satisfies this: the fields are the ones a stamp reads,
 * and nothing here is a mesh.
 */
export interface StandPatch {
	readonly count: number;

	/** The lattice this is cut at: `n = 2^level`. */
	readonly level: number;

	readonly face: Int32Array;
	readonly i: Int32Array;
	readonly j: Int32Array;

	/** Per column, its unit direction. */
	readonly directions: Float64Array;

	/** Per column, the six neighbours as indices into the patch, `-1` off it. */
	readonly ring: Int32Array;
}

/** Where the ground stands under each column of the patch. */
export interface StandGround {
	/**
	 * The true ground under one column, worked out only when it is needed.
	 *
	 * **What a column's ground costs and where it is needed are wildly
	 * different.** Every column of the patch has one, and a chunk knows its own
	 * for nothing because its build already recorded them -- but the ring past
	 * its rim does not, and finding one there means walking down through
	 * whatever the carve and the caves took off the top. That walk is only ever
	 * needed for a ring column a plant is actually rooted in, which is a
	 * handful against a couple of thousand, so it is asked for rather than
	 * filled in. Returns the layer, and may correct the arrays below in place.
	 */
	readonly correct?: (column: number) => number;

	/**
	 * Per column, the top of its topmost rock, in metres above sea level.
	 *
	 * Already on the block grid, so a plant's foot is the surface the mesh
	 * drew rather than a number near it.
	 */
	readonly top: Float64Array;

	/** Per column, which layer that top is, counted from sea level. */
	readonly groundLayer: Int32Array;
}

/** Everything a stand is grown against beyond the ground itself. */
export interface StandOptions {
	readonly seed: number;
	readonly radius: number;

	/** How wide one drawn cell is, and how tall one slot is, in metres. */
	readonly blockMetres: number;

	/** The lattice the roots are chosen on, which is the finest one. */
	readonly rootLevel: number;

	/** How many cells across the patch is cut into chunks. */
	readonly chunkCells: number;

	/**
	 * Per column, whether this build may write it, or nothing for all of them.
	 *
	 * **A chunk in the world is already one chunk**, so it is handed the cells
	 * it owns rather than a cut to make: the patch it is given is its own
	 * triangle plus the ring a plant can reach in from, every root on it is
	 * grown, and what falls outside is the neighbour's to grow for itself. The
	 * bench cuts a patch up instead, which is the same rule run several times
	 * over so the answers can be compared.
	 */
	readonly owned?: Uint8Array | null;

	/** How far past its own rim a chunk grows plants, in metres. */
	readonly chunkReach: number;

	/** Ground at or under this is water, and nothing is planted in it. */
	readonly seaLevel: number;

	/**
	 * The pre-grown plants to stamp, or nothing to grow each one where it
	 * stands.
	 *
	 * **Rasterising a plant is nine tenths of what one costs**, so a stand
	 * stamps a cell list it has already paid for rather than flooding the
	 * lattice around every rod and every leaf ball again. Passing nothing
	 * takes the slow path, which is what {@link buildPlantTemplate} is: the
	 * templates have to come from somewhere, and they come from this.
	 */
	readonly templates?: PlantTemplateStore | null;
}

/** A stand of plants, as slots over the patch, and what grew. */
export interface Stand {
	/** Slots per column, and where a column's own ground sits among them. */
	readonly layers: number;
	readonly sunk: number;

	/**
	 * Per column and slot, the block standing there, or air.
	 *
	 * **The registry's own numbers**, so a stand is the same kind of thing a
	 * chunk of terrain is: the colour, the name and whether it stops a player
	 * are properties of the type rather than of anything a bench holds beside
	 * it.
	 */
	readonly blocks: Uint8Array;

	/** Per live layer, how many plants it grew in territory it owned. */
	readonly grown: Int32Array;

	readonly plants: number;

	/** Roots refused because they fell on one of the twelve pentagons. */
	readonly refused: number;

	readonly wood: number;
	readonly leaf: number;

	/** The tallest and the shortest plant grown, in metres. */
	readonly tallest: number;
	readonly shortest: number;

	/**
	 * How far the widest plant reached sideways from its own trunk.
	 *
	 * Measured rather than assumed, because it is what a chunk's reach past its
	 * own rim has to cover: anything wider and a neighbour never sees the root,
	 * so it writes nothing where the canopy falls and the plant comes apart at
	 * the boundary.
	 */
	readonly widest: number;

	readonly chunks: number;
	readonly rootsTested: number;
	readonly rootsOwned: number;
}

/**
 * Every plant standing on a patch, grown chunk by chunk.
 *
 * **A chunk gets an address and the seed and nothing else.** It grows every
 * plant within reach of its own rim, which means a plant whose canopy crosses a
 * boundary is grown twice, identically, by two chunks that never speak -- and
 * writes only the cells it owns, which is what proves the neighbour got the
 * rest. Three things make that hold: a plant is grown in world coordinates
 * rather than in any frame belonging to the patch, slots are counted from sea
 * level rather than from the lowest ground in view, and the bend and the leaf
 * cut are read at each cell's own place in the world.
 */
export function growStand(
	patch: StandPatch,
	ground: StandGround,
	roots: PlantRoots,
	rootHeight: Float64Array,
	layers: readonly PlantLayer[],
	options: StandOptions,
): Stand {
	const {
		seed,
		radius,
		blockMetres: block,
		rootLevel,
		chunkCells,
		chunkReach,
		seaLevel,
	} = options;
	const templates = options.templates ?? null;
	const { count, ring, directions } = patch;
	const { top, groundLayer } = ground;
	const groundOf = ground.correct ?? ((c: number): number => groundLayer[c]!);
	const n = 2 ** patch.level;
	const rootN = 2 ** rootLevel;

	// **A layer that is off is not in the list at all**, so turning one off
	// costs nothing and the tie-break order is over the ones left.
	const live = layers.filter((layer) => layer.on);
	const noise: NoiseSettings[] = live.map((layer) =>
		plantLayerNoise(layer, radius),
	);
	const grown = new Int32Array(live.length);

	// Where each column of the patch is, by its canonical address, so a point
	// in space can be turned back into a column of this patch.
	const keyOf = (face: number, i: number, j: number): number =>
		(face * (n + 1) + i) * (n + 1) + j;
	const seat = new Map<number, number>();
	for (let c = 0; c < count; c++)
		seat.set(keyOf(patch.face[c]!, patch.i[c]!, patch.j[c]!), c);

	// How tall the tallest thing that could stand here is, over every layer,
	// because any of them may put a plant on any cell.
	let reachUp = 0;
	let widestTrunk = 0;
	for (const layer of live) {
		const s = layer.shape;
		reachUp = Math.max(
			reachUp,
			s.height * (1 + s.sizeSpread) + s.leafRadius * 1.6,
		);
		widestTrunk = Math.max(widestTrunk, s.trunk * (1 + s.sizeSpread));
	}
	const slots = Math.min(
		MAX_STAND_LAYERS,
		STAND_SUNK + Math.ceil(reachUp / block) + 3,
	);
	const blocks = new Uint8Array(count * slots);
	// The two blocks each live layer writes, taken once from its species.
	const wood = live.map((layer) => plantBlocksOf(layer.species).wood);
	const leafOf = live.map((layer) => plantBlocksOf(layer.species).leaf);

	/** Which column of this patch a point in space falls in, `-1` off it. */
	const columnOf = (px: number, py: number, pz: number): number => {
		const len = Math.sqrt(px * px + py * py + pz * pz) || 1;
		const found = directionToCell(
			new Vec3(px / len, py / len, pz / len),
			n,
		);
		const cell = canonicalCell(found.face, n, found.i, found.j);
		return seat.get(keyOf(cell.face, cell.i, cell.j)) ?? -1;
	};
	const metresOf = (px: number, py: number, pz: number): number =>
		Math.sqrt(px * px + py * py + pz * pz) - radius;
	/** Which slot of a column a height in metres lands in. */
	const slotAt = (c: number, metres: number): number =>
		STAND_SUNK + Math.floor((metres - top[c]!) / block);

	// **A cell takes what most fills it, and past a certain cell size that is
	// the canopy.** A twig is centimetres thick and a cluster is metres across,
	// so wood beating leaf is right at the block scale and exactly wrong once a
	// block is wider than a trunk -- at an 8 m block a forest drew 2,938 wood
	// cells against 62 leaf, because every cluster landed on the same cell as
	// the twig it hung from and was refused there.
	//
	// **A rank, not a permission.** Letting a leaf overwrite wood where it
	// happens to arrive second makes the answer depend on the order plants are
	// grown in, and a chunk grows them in a different order from its neighbour.
	const canopyWins = block > widestTrunk;
	const WOOD_RANK = canopyWins ? 1 : 2;
	const LEAF_RANK = canopyWins ? 2 : 1;
	// A rank per block type, so the slot walk asks one array rather than
	// working out which species and which half a number belongs to.
	const RANK = new Uint8Array(BLOCK_NAMES.length);
	for (let n = 0; n < live.length; n++) {
		RANK[wood[n]!] = WOOD_RANK;
		RANK[leafOf[n]!] = LEAF_RANK;
	}

	// **Where a write goes, and which writes a chunk is allowed to make.** A
	// chunk may only write the cells it owns; what a plant rooted outside puts
	// down beyond that is the neighbour's business, and dropping it here is
	// what proves the neighbour grew it too.
	let holds: Int32Array | null = null;
	let holder = 0;
	/** The two blocks the plant being grown writes. */
	let woodBlock = 0;
	let leafBlock = 0;
	const write = (c: number, slot: number, what: number): void => {
		if (slot < 0 || slot >= slots) return;
		if (holds !== null && holds[c] !== holder) return;
		const at = c * slots + slot;
		if (RANK[what]! <= RANK[blocks[at]!]!) return;
		blocks[at] = what;
	};

	// **A stamp's candidates are grown through its own test, never gathered
	// around it.** A hexagon disc has no way to name only the cells a shape
	// reaches, because its ring count is chosen before a single distance is
	// worked out. A flood starts where the shape is known to sit and hands the
	// question on from every cell that passes to that cell's own six
	// neighbours, so it covers the shape and stops where the shape does.
	// Stepping past a failing cell `SLACK` times costs a ring and buys the one
	// thing the argument rests on: that the cells within reach of a rod or a
	// ball are connected through cells that are also within reach.
	const seen = new Int32Array(count);
	const queue = new Int32Array(count);
	const slack = new Int8Array(count);
	let era = 0;

	/** One tapered rod of wood, between two points in world space. */
	const rod = (
		ax: number,
		ay: number,
		az: number,
		bx: number,
		by: number,
		bz: number,
		ra: number,
		rb: number,
	): void => {
		// **A rod thinner than a cell rasterises to a dotted line, and a dotted
		// branch is connected to nothing.** At a radius of 0.45 of a cell one
		// tree comes out as 66 separate pieces with 74.7% of its wood rooted,
		// and at 0.87 it is one piece and 100%.
		const thin = block * 0.5;
		const wide = Math.max(Math.max(ra, thin), Math.max(rb, thin));
		ra = Math.max(ra, thin);
		rb = Math.max(rb, thin);
		const ux = bx - ax;
		const uy = by - ay;
		const uz = bz - az;
		const run = Math.sqrt(ux * ux + uy * uy + uz * uz);
		const steps = Math.max(1, Math.ceil(run / (block * 0.4)));
		era++;
		let listed = 0;
		let wasCell = -1;
		let wasSlot = 0;
		let runSeat = -1;
		for (let s = 0; s <= steps; s++) {
			const t = s / steps;
			const px = ax + ux * t;
			const py = ay + uy * t;
			const pz = az + uz * t;
			const c = columnOf(px, py, pz);
			if (c < 0) continue;
			// **The axis cell is always written, whatever the radius**, so the
			// rod is a walk rather than a string of discs -- and where a step
			// moves sideways and up at once the corner between the two is
			// written too. The ring is six neighbours and the column is two; a
			// diagonal is neither, and one missed corner is a branch in two
			// pieces.
			const here = slotAt(c, metresOf(px, py, pz));
			if (here >= 0 && here < slots) {
				write(c, here, woodBlock);
				if (wasCell >= 0 && wasCell !== c) {
					// A slot is counted from the column's own ground, so
					// carrying one across to another column converts it rather
					// than reusing the number.
					const bridge =
						wasSlot + groundLayer[wasCell]! - groundLayer[c]!;
					if (bridge !== here) write(c, bridge, woodBlock);
				}
				wasCell = c;
				wasSlot = here;
			}
			// **Noted, not tested.** The test below is against the whole
			// segment, so its answer does not depend on which step reached the
			// cell.
			if (c !== runSeat) {
				runSeat = c;
				if (seen[c] !== era) {
					seen[c] = era;
					slack[c] = SLACK;
					queue[listed++] = c;
				}
			}
		}

		// **How close a column ever comes to the rod, over the rod's own length
		// rather than the infinite line through it.** A trunk points straight
		// up, so the line through it passes through the planet's centre --
		// which every column's line also does, and two lines through one point
		// are never apart. A line test therefore measures nought for every
		// column of every trunk and refuses nothing: it let 76% of a rod's
		// candidates through to be walked slot by slot for 6% of the slots
		// written. Clamped to the rod's own ends it refuses 96% of them.
		//
		// The squared distance from a column's line to the point `s` along the
		// rod is a quadratic in `s`, so its smallest value over `[0, 1]` is one
		// clamped division and one evaluation. **And projecting is never
		// lengthening**, so how far the rod reaches along the column is bounded
		// by where its two ends project, widened by the thickness.
		const wide2 = wide * wide;
		const woodRank = WOOD_RANK;
		const homeA = ax * ax + ay * ay + az * az;
		const alongA = ax * ux + ay * uy + az * uz;
		const run2 = run * run;
		const overRun = run > 0 ? 1 / run2 : 0;
		for (let q = 0; q < listed; q++) {
			const c = queue[q]!;
			const dx0 = directions[c * 3]!;
			const dy0 = directions[c * 3 + 1]!;
			const dz0 = directions[c * 3 + 2]!;
			const endA = ax * dx0 + ay * dy0 + az * dz0;
			const lean = ux * dx0 + uy * dy0 + uz * dz0;
			const bend = run2 - lean * lean;
			const tilt = alongA - endA * lean;
			let near = bend > 0 ? -tilt / bend : 0;
			near = Math.max(0, Math.min(1, near));
			const gap =
				homeA - endA * endA + 2 * near * tilt + near * near * bend;
			const held = slack[c]!;
			if (gap > wide2) {
				if (held > 1)
					for (let d = 0; d < 6; d++) {
						const nb = ring[c * 6 + d]!;
						if (nb < 0 || seen[nb] === era) continue;
						seen[nb] = era;
						slack[nb] = held - 1;
						queue[listed++] = nb;
					}
				continue;
			}
			for (let d = 0; d < 6; d++) {
				const nb = ring[c * 6 + d]!;
				if (nb < 0 || seen[nb] === era) continue;
				seen[nb] = era;
				slack[nb] = SLACK;
				queue[listed++] = nb;
			}
			const endB = endA + lean;
			const base = radius + top[c]!;
			const lo = Math.max(
				0,
				STAND_SUNK +
					Math.floor((Math.min(endA, endB) - wide - base) / block),
			);
			const hi = Math.min(
				slots - 1,
				STAND_SUNK +
					Math.floor((Math.max(endA, endB) + wide - base) / block),
			);
			const seat0 = c * slots;
			for (let slot = lo; slot <= hi; slot++) {
				if (RANK[blocks[seat0 + slot]!]! >= woodRank) continue;
				// The same two additions in the same order as every other
				// stamp: a radius carries the planet's whole magnitude, so
				// folding it into the band's own base moves the last bit and
				// with it the odd block on a boundary.
				const my = top[c]! + (slot - STAND_SUNK + 0.5) * block;
				const reach = radius + my;
				const cx = dx0 * reach;
				const cy = dy0 * reach;
				const cz = dz0 * reach;
				const dx = cx - ax;
				const dy = cy - ay;
				const dz = cz - az;
				let along = (dx * ux + dy * uy + dz * uz) * overRun;
				along = Math.max(0, Math.min(1, along));
				const ex = dx - ux * along;
				const ey = dy - uy * along;
				const ez = dz - uz * along;
				const r = ra + (rb - ra) * along;
				if (ex * ex + ey * ey + ez * ez <= r * r)
					write(c, slot, woodBlock);
			}
		}
	};

	// **One octave with no fold is the basis at that octave's own offset.**
	// `octaveNoise` at one octave scales by an amplitude of 1 and divides by a
	// summed amplitude of 1, both exact, so the cut calls the basis directly
	// with the offset taken once rather than running a loop and a divide at
	// every candidate cell of every cluster.
	const cutSeed = (seed + LEAF_SEED_OFFSET) | 0;
	const cutOffsets = octaveOffsets(cutSeed, 1);

	/**
	 * One cluster of leaves: a ball, cut by noise.
	 *
	 * The cut is what makes a rim ragged and lets light through, and it is read
	 * at the cell's own place in the world -- so two clusters that overlap
	 * agree about the air between them, and so do two chunks that both draw one
	 * cluster.
	 */
	const cluster = (
		x: number,
		y: number,
		z: number,
		r: number,
		fill: number,
		rough: number,
		width: number,
	): void => {
		if (r <= 0) return;
		// **Most of a canopy is decided before the noise is read.** The cut is
		// `1 - away + rough * 0.6 * n` against `1 - fill`, and `n` is one
		// octave of value noise, bounded by `[-1, 1]` by construction. So the
		// reading can only move the answer over a shell `rough * 0.6` wide
		// either side of the fill line: inside it every reading writes and
		// outside it none does. Both sides are proved by the bound, so every
		// cell gets the answer it would have got.
		const sway = rough > 0 ? rough * 0.6 : 0;
		const sure = fill - sway;
		const never = fill + sway;
		const leafRank = LEAF_RANK;
		const home = columnOf(x, y, z);
		if (home < 0) return;
		// **A cluster narrower than a cell still has to land somewhere.** A rod
		// has a floor on its radius, so at a coarse level every twig is drawn
		// as a whole block while a canopy smaller than one cell passes no
		// distance test at all and disappears.
		if (r < block * 0.6) {
			write(home, slotAt(home, metresOf(x, y, z)), leafBlock);
			return;
		}
		// **A column either meets the ball or it does not, and that is three
		// multiplies.** A cell's blocks all stand on one ray out from the
		// planet's centre, so how close that ray comes to the ball's centre
		// settles the whole column at once, and what is left is a band along
		// the ray either side of the nearest point.
		const far2 = x * x + y * y + z * z;
		era++;
		seen[home] = era;
		slack[home] = SLACK;
		queue[0] = home;
		let listed = 1;
		for (let q = 0; q < listed; q++) {
			const c = queue[q]!;
			const dx0 = directions[c * 3]!;
			const dy0 = directions[c * 3 + 1]!;
			const dz0 = directions[c * 3 + 2]!;
			const along = dx0 * x + dy0 * y + dz0 * z;
			const room = r * r - (far2 - along * along);
			const held = slack[c]!;
			if (room <= 0) {
				if (held > 1)
					for (let d = 0; d < 6; d++) {
						const nb = ring[c * 6 + d]!;
						if (nb < 0 || seen[nb] === era) continue;
						seen[nb] = era;
						slack[nb] = held - 1;
						queue[listed++] = nb;
					}
				continue;
			}
			for (let d = 0; d < 6; d++) {
				const nb = ring[c * 6 + d]!;
				if (nb < 0 || seen[nb] === era) continue;
				seen[nb] = era;
				slack[nb] = SLACK;
				queue[listed++] = nb;
			}
			// Where the ball crosses this column, exactly: the two roots of
			// `|u d - P| = r`. Rounding a metre to a slot already keeps a block
			// of slack at each end.
			const hit = Math.sqrt(room);
			const lo = Math.max(
				0,
				STAND_SUNK +
					Math.floor((along - hit - radius - top[c]!) / block),
			);
			const hi = Math.min(
				slots - 1,
				STAND_SUNK +
					Math.floor((along + hit - radius - top[c]!) / block),
			);
			const seat0 = c * slots;
			for (let slot = lo; slot <= hi; slot++) {
				if (RANK[blocks[seat0 + slot]!]! >= leafRank) continue;
				const my = top[c]! + (slot - STAND_SUNK + 0.5) * block;
				const reach = radius + my;
				const cx = dx0 * reach;
				const cy = dy0 * reach;
				const cz = dz0 * reach;
				const dx = cx - x;
				const dy = cy - y;
				const dz = cz - z;
				const off2 = dx * dx + dy * dy + dz * dz;
				if (off2 > r * r) continue;
				const away = Math.sqrt(off2) / r;
				if (away >= never) continue;
				if (away >= sure) {
					const cut =
						1 -
						away +
						sway *
							valueNoise3(
								cx * width + cutOffsets[0]!,
								cy * width + cutOffsets[1]!,
								cz * width + cutOffsets[2]!,
								cutSeed,
							);
					if (!(cut > 1 - fill)) continue;
				}
				write(c, slot, leafBlock);
			}
		}
	};

	/**
	 * Which layer plants one root, if any.
	 *
	 * **Every answer here is a hash of the cell's own address and the seed**,
	 * which is the whole requirement: two chunks that both consider this root
	 * get the same plant, because neither of them is consulted.
	 *
	 * Returns the index into {@link live}, `-1` for nothing and `-2` for a cell
	 * nothing may ever be planted on.
	 */
	const plantAt = (r: number): number => {
		if (rootHeight[r]! <= seaLevel) return -1;
		const face = roots.face[r]!;
		const i = roots.i[r]!;
		const j = roots.j[r]!;
		// **The twelve pentagons are protected columns**, so nothing is planted
		// on one and no branch has to ask for a fifth direction. A lattice
		// point is one of the twelve exactly when it is a corner of its own
		// face triangle, which is three integer comparisons.
		if (
			(i === 0 && j === 0) ||
			(i === rootN && j === 0) ||
			(i === 0 && j === rootN)
		)
			return -2;
		const x = roots.directions[r * 3]!;
		const y = roots.directions[r * 3 + 1]!;
		const z = roots.directions[r * 3 + 2]!;
		// **Every layer is offered the cell in turn and the first that wants it
		// takes it**, which makes a layer's density its share of what is left
		// rather than of the ground. Any other rule needs the layers to know
		// about each other, and a layer that reads its neighbour is not a
		// layer.
		for (let l = 0; l < live.length; l++) {
			const layer = live[l]!;
			// **The roll is asked first, because it can refuse on its own.** A
			// layer's chance is its density scaled by a curve reading in
			// `[0, 1]`, so it can never exceed the density -- and a roll over
			// that is refused whatever the noise would have said. It is the
			// same value tested against the same bound, so nothing about which
			// cells are planted changes; what changes is that an octave stack
			// and a spline are not read for a cell that was never going to
			// take one. At the shipped densities that is **98.0%** of asks,
			// and deciding a chunk's plants falls from `11.3 ms` to `1.7 ms`
			// (`tools/trial-root-walk.ts`).
			const roll = hash3(i, j, face, (seed + plantSalt(layer.id)) | 0);
			if (!(roll < layer.density / 100)) continue;
			const share = plantDensityAt(layer, x, y, z, seed, noise[l]!);
			if (roll < (share * layer.density) / 100) return l;
		}
		return -1;
	};

	// Which column of the patch each root stands on. **Scale the barycentric
	// weights and repair them, never shift `(i, j)`:** a cell is a Voronoi
	// region and a shift is a floor, which names the wrong cell for 43.9% of
	// cells one level out.
	const rootSeat = new Int32Array(roots.count).fill(-1);
	for (let r = 0; r < roots.count; r++) {
		const face = roots.face[r]!;
		const i = roots.i[r]!;
		const j = roots.j[r]!;
		let ci = i;
		let cj = j;
		if (rootN !== n) {
			const s = rootN / n;
			const [, ri, rj] = hexRound((rootN - i - j) / s, i / s, j / s, n);
			ci = ri;
			cj = rj;
		}
		const cell = canonicalCell(face, n, ci, cj);
		const at = seat.get(keyOf(cell.face, cell.i, cell.j));
		if (at !== undefined) rootSeat[r] = at;
	}

	let plants = 0;
	let refused = 0;
	let tallest = 0;
	let shortest = Infinity;
	let widest = 0;
	let rootsTested = 0;
	let rootsOwned = 0;

	const skeleton = emptySkeleton();

	/**
	 * Lay one pre-grown plant down at a root, in one of its twelve turns.
	 *
	 * **All of the work is already done**, so this is an integer add and a rank
	 * compare per cell: no flood, no distance test, no noise and no address
	 * lookup beyond the one {@link cellOffset} does to carry a step across a
	 * face edge. Which plant and which way round are hashes of the root's own
	 * cell, so two chunks that both hold it lay down the same one.
	 *
	 * **A layer offset is absolute**, because layers count downward from the
	 * crust top and that is one radius for the whole planet. The column a cell
	 * lands in counts its own slots from its own ground, so the conversion is
	 * the difference between the two grounds -- and nothing else here has to
	 * know what the terrain is doing.
	 */
	const stamp = (
		r: number,
		layerAt: number,
		store: PlantTemplateStore,
	): number => {
		const c = rootSeat[r]!;
		const face = roots.face[r]!;
		const i = roots.i[r]!;
		const j = roots.j[r]!;
		const kept = store.forLayer(live[layerAt]!);
		if (kept.length === 0) return 0;
		const pick = Math.min(
			kept.length - 1,
			Math.floor(
				hash3(face, i, j, (seed + VARIANT_SEED_OFFSET) | 0) *
					kept.length,
			),
		);
		const template = kept[pick]!;
		const turn = Math.min(
			TURNS - 1,
			Math.floor(
				hash3(j, i, face, (seed + TURN_SEED_OFFSET) | 0) * TURNS,
			),
		);
		woodBlock = wood[layerAt]!;
		leafBlock = leafOf[layerAt]!;
		// A cell's slot is counted from its own column's ground, and a
		// template's is counted from the root's, so the two differ by the step
		// between those grounds -- which `groundLayer` already holds, negated.
		const rootGround = groundOf(c);
		// **The template is stepped from the DRAWN cell, not the root.** Its
		// offsets are cells of the lattice the chunk is drawn on, and a root is
		// named on the world's finest one -- the same point under two names,
		// and at a coarse level two different numbers. Stepping from the root's
		// name landed every cell of every plant outside the patch, so a coarse
		// chunk counted its plants and wrote not one block of them. Which
		// plant and which way round stay hashes of the root, because those must
		// not change with the level.
		const atFace = patch.face[c]!;
		const atI = patch.i[c]!;
		const atJ = patch.j[c]!;
		const step: [number, number] = [0, 0];
		for (let k = 0; k < template.count; k++) {
			orientTemplate(template.di[k]!, template.dj[k]!, turn, step);
			const cell = cellOffset(atFace, n, atI, atJ, step[0], step[1]);
			const named = canonicalCell(cell.face, n, cell.i, cell.j);
			const at = seat.get(keyOf(named.face, named.i, named.j));
			if (at === undefined) continue;
			// `s = SUNK - 1 - dLayer` on the root's own column, moved by
			// however much lower or higher this column's ground stands.
			const slot =
				STAND_SUNK -
				1 -
				template.dLayer[k]! +
				rootGround -
				groundLayer[at]!;
			write(at, slot, template.block[k]!);
		}
		if (template.reach > widest) widest = template.reach;
		if (template.height > tallest) tallest = template.height;
		if (template.height < shortest) shortest = template.height;
		return template.height;
	};

	/** Grow whatever stands on one root, into whichever chunk is being held. */
	const raise = (r: number, layer: number): number => {
		if (templates) return stamp(r, layer, templates);
		const c = rootSeat[r]!;
		const face = roots.face[r]!;
		const i = roots.i[r]!;
		const j = roots.j[r]!;
		const shape = live[layer]!.shape;
		woodBlock = wood[layer]!;
		leafBlock = leafOf[layer]!;
		const scale =
			1 +
			shape.sizeSpread *
				(2 * hash3(face, i, j, (seed + SIZE_SEED_OFFSET) | 0) - 1);
		// **A plant shorter than one block is not grown at all.** Left in, its
		// rod's own minimum radius draws it as a whole block -- bigger at a
		// coarse level than it is at a fine one, standing where nothing should
		// be. Skipping it takes its whole skeleton off the bill as well.
		if (shape.height * scale < block) return 0;
		const roll = hash3(j, face, i, (seed + ROLL_SEED_OFFSET) | 0);
		// **The plant's own frame, taken at its own root.** Up is
		// `normalize(position)` and there is no global north, so every plant
		// stands in a frame of its own -- the second half of what makes it a
		// pure function of its address. It stands on the ground as it is drawn,
		// so its foot moves to the layer a coarse chunk put the surface on,
		// while its direction is its own fine lattice point and never moves.
		const ux = roots.directions[r * 3]!;
		const uy = roots.directions[r * 3 + 1]!;
		const uz = roots.directions[r * 3 + 2]!;
		groundOf(c);
		const foot = radius + top[c]!;
		const base: [number, number, number] = [
			ux * foot,
			uy * foot,
			uz * foot,
		];
		const stance = plantFrame(ux, uy, uz);
		skeleton.rods.length = 0;
		skeleton.clusters.length = 0;
		growPlant(
			base,
			stance,
			shape,
			scale,
			(seed + Math.floor(roll * 100000)) | 0,
			block,
			skeleton,
		);
		// **Sideways, not away.** Which chunks a plant reaches into is a
		// question about the ground it stands over, and a straight distance
		// from the foot is mostly the trunk's own height -- an 85 m redwood
		// reads 81 m by that measure and covers twenty. The radial part comes
		// out along the root's own up.
		const far = (x: number, y: number, z: number, pad: number): void => {
			const dx = x - base[0];
			const dy = y - base[1];
			const dz = z - base[2];
			const along = dx * ux + dy * uy + dz * uz;
			const ex = dx - ux * along;
			const ey = dy - uy * along;
			const ez = dz - uz * along;
			const away = Math.sqrt(ex * ex + ey * ey + ez * ez) + pad;
			if (away > widest) widest = away;
		};
		const rods = skeleton.rods;
		for (let at = 0; at < rods.length; at += 8) {
			rod(
				rods[at]!,
				rods[at + 1]!,
				rods[at + 2]!,
				rods[at + 3]!,
				rods[at + 4]!,
				rods[at + 5]!,
				rods[at + 6]!,
				rods[at + 7]!,
			);
			far(
				rods[at + 3]!,
				rods[at + 4]!,
				rods[at + 5]!,
				Math.max(rods[at + 6]!, rods[at + 7]!),
			);
		}
		const width = 1 / Math.max(0.4, shape.leafRadius * 0.55);
		const balls = skeleton.clusters;
		for (let at = 0; at < balls.length; at += 4) {
			cluster(
				balls[at]!,
				balls[at + 1]!,
				balls[at + 2]!,
				balls[at + 3]!,
				shape.leafFill,
				shape.leafRough,
				width,
			);
			far(balls[at]!, balls[at + 1]!, balls[at + 2]!, balls[at + 3]!);
		}
		const tall = shape.height * scale;
		if (tall > tallest) tallest = tall;
		if (tall < shortest) shortest = tall;
		return tall;
	};

	// Which roots stand on each drawn column. At the finest level that is one
	// apiece; four levels out it is 256, and the list is the same length.
	const under: number[][] = new Array(count);
	for (let r = 0; r < roots.count; r++) {
		const c = rootSeat[r]!;
		if (c < 0) continue;
		(under[c] ??= []).push(r);
	}

	/** What was grown, counted off the blocks once the writing has stopped. */
	const report = (chunks = 1): Stand => {
		let woodCells = 0;
		let leafCells = 0;
		for (let at = 0; at < blocks.length; at++) {
			const what = blocks[at]!;
			if (what === BlockType.AIR) continue;
			if (RANK[what] === WOOD_RANK) woodCells++;
			else leafCells++;
		}
		return {
			layers: slots,
			sunk: STAND_SUNK,
			blocks,
			grown,
			plants,
			refused,
			wood: woodCells,
			leaf: leafCells,
			tallest,
			shortest: shortest === Infinity ? 0 : shortest,
			widest,
			chunks,
			rootsTested,
			rootsOwned,
		};
	};

	/** Grow every root standing on one run of columns, into whatever it owns. */
	const raiseOver = (over: Int32Array, used: number, round: number): void => {
		holder = round;
		for (let q = 0; q < used; q++) {
			const c = over[q]!;
			const here = under[c];
			if (here === undefined) continue;
			const owned = holds === null || holds[c] === round;
			if (owned) rootsOwned += here.length;
			rootsTested += here.length;
			for (const r of here) {
				const answer = plantAt(r);
				if (answer === -1) continue;
				if (answer === -2) {
					if (owned) refused++;
					continue;
				}
				raise(r, answer);
				if (owned) {
					grown[answer]!++;
					plants++;
				}
			}
		}
	};

	// **A chunk that knows what it owns is grown in one pass.** Everything it
	// was handed is offered a plant and only its own cells are written, which
	// is the whole rule -- the cut below is that rule applied several times to
	// one patch so the answers can be compared.
	if (options.owned) {
		const mine = new Int32Array(count);
		for (let c = 0; c < count; c++) mine[c] = options.owned[c] ? 1 : 0;
		holds = mine;
		const every = new Int32Array(count);
		for (let c = 0; c < count; c++) every[c] = c;
		raiseOver(every, count, 1);
		holds = null;
		return report();
	}

	// **Cut into chunks, and every chunk generates alone.** A chunk is the
	// triangle a cell's scaled barycentric weights floor into -- one level of
	// the same hierarchy the coarse lookup descends -- so this is the engine's
	// own cut rather than a grid laid over it.
	const cn =
		2 ** Math.max(0, Math.round(Math.log2(n / Math.max(1, chunkCells))));
	const scale = n / cn;
	const held = new Map<number, number[]>();
	for (let c = 0; c < count; c++) {
		const i = patch.i[c]!;
		const j = patch.j[c]!;
		const u = Math.floor((n - i - j) / scale);
		const v = Math.floor(i / scale);
		const w = Math.floor(j / scale);
		const over = cn - (u + v + w);
		const key =
			((patch.face[c]! * (cn + 1) + v) * (cn + 1) + w) * 2 +
			(over >= 2 ? 1 : 0);
		let own = held.get(key);
		if (own === undefined) {
			own = [];
			held.set(key, own);
		}
		own.push(c);
	}

	// **How far past its own rim a chunk looks**, in hops. Too few and a plant
	// rooted just outside is grown by its owner and not by the neighbour whose
	// cells its canopy reaches, so the plant comes apart at the boundary.
	const hops = Math.max(0, Math.ceil(chunkReach / block));
	const mine = new Int32Array(count).fill(-1);
	const near = new Int32Array(count).fill(-1);
	const reach = new Int32Array(count);
	let round = 0;
	for (const own of held.values()) {
		round++;
		let used = 0;
		for (const c of own) {
			mine[c] = round;
			near[c] = round;
			reach[used++] = c;
		}
		let read = 0;
		for (let h = 0; h < hops; h++) {
			const stop = used;
			for (let q = read; q < stop; q++) {
				const c = reach[q]!;
				for (let d = 0; d < 6; d++) {
					const nb = ring[c * 6 + d]!;
					if (nb < 0 || near[nb] === round) continue;
					near[nb] = round;
					reach[used++] = nb;
				}
			}
			read = stop;
		}
		holds = mine;
		raiseOver(reach, used, round);
	}
	holds = null;

	return report(held.size);
}
