import type { PlantLayer } from "./PlantLayer.js";
import type { PlantRoots } from "./plantRoots.js";
import type { PlantTemplate } from "./PlantTemplate.js";
import type { StandPatch } from "./growStand.js";
import { BlockType } from "../terrain/BlockType.js";
import { STAND_SUNK, growStand } from "./growStand.js";
import { canonicalCell } from "../../addressing/neighbours/canonicalCell.js";
import { latticePosition } from "../../addressing/lattice/latticePosition.js";
import { neighbour } from "../../addressing/neighbours/neighbour.js";

/** Seed offset between one variant of a species and the next. */
const VARIANT_STRIDE = 6421;

/**
 * One plant grown once, on flat ground, and kept as offsets from its root.
 *
 * **Grown by the same code that grows every other plant.** The stand is handed
 * a patch of its own with one root on it and one layer that always plants, so
 * what comes back is exactly what the rod and cluster stamps would have written
 * in the world -- there is no second implementation of a tree to drift from the
 * first, and the bench previews what the world builds because both read this.
 *
 * **Flat ground is the right reference, not a simplification.** A plant is
 * placed by absolute height: the rod stamp converts a slot into each column's
 * own ground as it crosses, so a canopy hanging over a cliff lands at the same
 * radius either way. Giving every column of the reference patch the same ground
 * makes those conversions the identity and changes nothing else.
 *
 * `variant` moves the seed, and the seed is what the plant's own size and its
 * whole skeleton come off -- so a set of variants is the same distribution of
 * sizes and shapes a stand used to draw one at a time.
 */
export function buildPlantTemplate(
	layer: PlantLayer,
	variant: number,
	level: number,
	blockMetres: number,
	radius: number,
	seed: number,
): PlantTemplate {
	const n = 2 ** level;
	const shape = layer.shape;
	// How far the reference patch has to reach: the tallest this species grows
	// plus a canopy, which bounds the sideways reach as well because no limb
	// leaves the trunk and travels further than the trunk is long.
	const far = shape.height * (1 + shape.sizeSpread) + shape.leafRadius * 1.6;
	const hops = Math.max(2, Math.ceil(far / blockMetres) + 2);

	// **The face's own middle**, which is one lattice point away from every
	// edge that a patch this size could reach, and where the gnomonic stretch
	// across a face is at its smallest.
	const i0 = Math.max(1, Math.floor(n / 3));
	const j0 = Math.max(1, Math.floor(n / 3));

	const keyOf = (f: number, i: number, j: number): number =>
		(f * (n + 1) + i) * (n + 1) + j;
	const seen = new Map<number, number>();
	const face: number[] = [];
	const iOf: number[] = [];
	const jOf: number[] = [];
	const add = (one: { face: number; i: number; j: number }): number => {
		const cell = canonicalCell(one.face, n, one.i, one.j);
		const key = keyOf(cell.face, cell.i, cell.j);
		const held = seen.get(key);
		if (held !== undefined) return held;
		const at = face.length;
		seen.set(key, at);
		face.push(cell.face);
		iOf.push(cell.i);
		jOf.push(cell.j);
		return at;
	};
	add({ face: 0, i: i0, j: j0 });
	let frontier = [0];
	for (let hop = 0; hop < hops && frontier.length > 0; hop++) {
		const next: number[] = [];
		for (const c of frontier)
			for (let d = 0; d < 6; d++) {
				const nb = neighbour(face[c]!, n, iOf[c]!, jOf[c]!, d);
				if (!nb) continue;
				const before = face.length;
				const at = add(nb);
				if (at >= before) next.push(at);
			}
		frontier = next;
	}

	const count = face.length;
	const directions = new Float64Array(count * 3);
	const ring = new Int32Array(count * 6).fill(-1);
	for (let c = 0; c < count; c++) {
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
	}

	const patch: StandPatch = {
		count,
		level,
		face: Int32Array.from(face),
		i: Int32Array.from(iOf),
		j: Int32Array.from(jOf),
		directions,
		ring,
	};
	const roots: PlantRoots = {
		count: 1,
		level,
		face: Int32Array.from([0]),
		i: Int32Array.from([i0]),
		j: Int32Array.from([j0]),
		directions: Float64Array.from([
			directions[0]!,
			directions[1]!,
			directions[2]!,
		]),
	};
	// **A layer that always plants**, so the one root on the patch takes it:
	// the curve is flat at one and the density is the whole of what the curve
	// can ask for, which makes the chance exactly one and the hash irrelevant.
	const always: PlantLayer = {
		...layer,
		density: 100,
		curve: [
			[-1, 1],
			[1, 1],
		],
	};
	const stand = growStand(
		patch,
		{
			top: new Float64Array(count),
			groundLayer: new Int32Array(count),
		},
		roots,
		Float64Array.from([1]),
		[always],
		{
			seed: (seed + variant * VARIANT_STRIDE) | 0,
			radius,
			blockMetres,
			rootLevel: level,
			chunkCells: n,
			owned: new Uint8Array(count).fill(1),
			chunkReach: 0,
			seaLevel: 0,
			// The rod and cluster stamps, which is what this is here to record.
			templates: null,
		},
	);

	const di: number[] = [];
	const dj: number[] = [];
	const dLayer: number[] = [];
	const block: number[] = [];
	for (let c = 0; c < count; c++) {
		// Every cell of the reference patch is on face 0, so a step is a plain
		// subtraction; a patch that ever left the face would need the crossing
		// rule and is what the middle of the face is chosen to avoid.
		const stepI = iOf[c]! - i0;
		const stepJ = jOf[c]! - j0;
		for (let s = 0; s < stand.layers; s++) {
			const what = stand.blocks[c * stand.layers + s]!;
			if (what === BlockType.AIR) continue;
			di.push(stepI);
			dj.push(stepJ);
			// A stand counts slots upward from the ground and a layer counts
			// downward from the crust top, so the block resting on the ground
			// is layer `-1` relative to the surface.
			dLayer.push(-1 - (s - STAND_SUNK));
			block.push(what);
		}
	}

	return {
		count: di.length,
		di: Int16Array.from(di),
		dj: Int16Array.from(dj),
		dLayer: Int16Array.from(dLayer),
		block: Uint8Array.from(block),
		height: stand.tallest,
		reach: stand.widest,
	};
}
