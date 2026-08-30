import type { PlantLayer } from "./PlantLayer.js";
import type { PlantRoots } from "./plantRoots.js";
import type { PlantTemplate } from "./PlantTemplate.js";
import type { PlantReference } from "./plantReferencePatch.js";
import { BlockType } from "../terrain/BlockType.js";
import { STAND_SUNK, growStand } from "./growStand.js";

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
 * **The patch it is grown on is handed in**, because every variant of a species
 * shares one -- rebuilding it each time is `29%` of what a template costs.
 *
 * `variant` moves the seed, and the seed is what the plant's own size and its
 * whole skeleton come off -- so a set of variants is the same distribution of
 * sizes and shapes a stand used to draw one at a time.
 */
export function buildPlantTemplate(
	reference: PlantReference,
	layer: PlantLayer,
	variant: number,
	blockMetres: number,
	radius: number,
	seed: number,
): PlantTemplate {
	const { patch } = reference;
	const level = patch.level;
	const count = patch.count;
	const i0 = reference.i;
	const j0 = reference.j;
	const directions = patch.directions;

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
	//
	// **And it names no biomes**, for the same reason it names no curve. A
	// layer restricted to biomes grows nowhere when nothing resolves a mask
	// for it, which is right for a chunk and wrong here: this patch is not a
	// place in the world, and what is being asked of it is what the species
	// looks like rather than whether it grows. Left in, every variant of every
	// restricted species comes back empty and the world draws no tree at all.
	const always: PlantLayer = {
		...layer,
		density: 100,
		curve: [
			[-1, 1],
			[1, 1],
		],
		biomes: undefined,
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
			chunkCells: 2 ** level,
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
		const stepI = patch.i[c]! - i0;
		const stepJ = patch.j[c]! - j0;
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
