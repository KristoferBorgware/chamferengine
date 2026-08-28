import { describe, expect, it } from "vitest";
import type { PlantLayer } from "chamfer/generation";
import {
	PLANT_SPECIES,
	PLANT_WOOD,
	growStand,
	plantRoots,
	standPieces,
	standWalkable,
} from "chamfer/generation";
import { columnPatchLayout } from "chamfer/mesh";
import { NORTH } from "chamfer/addressing";
import { Vec3 } from "chamfer/math";

/** A patch of flat ground at sea level, at a level small enough to be quick. */
const LEVEL = 7;
const RINGS = 24;

/**
 * How far out the roots are chosen, which is well inside the patch's own rim.
 *
 * A plant reaches about twenty metres sideways and a cell here is a metre, so a
 * margin of ten rings is what keeps every plant grown wholly inside the ground
 * being looked at -- a canopy hanging off the rim is a piece with no trunk in
 * the patch, which the audits below would read as debris.
 */
const ROOT_RINGS = 14;
const BLOCK = 1;
const RADIUS = 1700;

function patchOf(): ReturnType<typeof columnPatchLayout> {
	return columnPatchLayout({
		at: new Vec3(0.31, 0.6, 0.74).normalize(),
		level: LEVEL,
		rings: RINGS,
	});
}

/** One layer that grows everywhere, so the walk is not a study of one tree. */
function layerOf(id: number, species: string, density: number): PlantLayer {
	return {
		id,
		species,
		on: true,
		density,
		feature: 300,
		featureScale: 4,
		octaves: 3,
		persistence: 0.5,
		lacunarity: 2,
		fold: 0,
		curve: [
			[-1, 1],
			[1, 1],
		],
		shape: PLANT_SPECIES[species]!,
		wood: PLANT_SPECIES[species]!.wood,
		leaf: PLANT_SPECIES[species]!.leaf,
	};
}

/** Everything a stand is grown against, with the chunk cut left open. */
function stand(
	patch: ReturnType<typeof columnPatchLayout>,
	layers: readonly PlantLayer[],
	chunkCells: number,
): ReturnType<typeof growStand> {
	const top = new Float64Array(patch.count);
	const groundLayer = new Int32Array(patch.count).fill(-1);
	const roots = plantRoots(patch.centre, LEVEL, ROOT_RINGS);
	const rootHeight = new Float64Array(roots.count).fill(5);
	return growStand(patch, { top, groundLayer }, roots, rootHeight, layers, {
		seed: 4711,
		radius: RADIUS,
		blockMetres: BLOCK,
		rootLevel: LEVEL,
		chunkCells,
		chunkReach: 24,
		seaLevel: 0,
	});
}

describe("growStand", () => {
	const patch = patchOf();
	const layers = [layerOf(1, "Pine", 6), layerOf(2, "Oak", 4)];

	it("grows plants of both layers", () => {
		const grown = stand(patch, layers, 4096);
		expect(grown.plants).toBeGreaterThan(10);
		expect(grown.wood).toBeGreaterThan(0);
		expect(grown.leaf).toBeGreaterThan(0);
		expect(grown.grown[0]).toBeGreaterThan(0);
		expect(grown.grown[1]).toBeGreaterThan(0);
	});

	// **The property a lab is most likely to fake, and the one the engine needs.**
	// A chunk gets an address and the seed and nothing else, so a plant whose
	// canopy crosses a boundary has to be grown twice, identically, by two
	// chunks that never speak. Cutting the same ground into chunks and
	// comparing it cell for cell against the same ground generated in one piece
	// is what says that holds -- anything a plant reads from a list position, a
	// neighbour's answer or the patch's own frame shows up here as a cell that
	// differs.
	it("cuts into chunks without changing a single cell", () => {
		const whole = stand(patch, layers, 4096);
		const cut = stand(patch, layers, 16);
		let differ = 0;
		for (let at = 0; at < whole.blocks.length; at++)
			if (whole.blocks[at] !== cut.blocks[at]) differ++;
		expect(differ).toBe(0);
		expect(cut.chunks).toBeGreaterThan(whole.chunks);
		expect(cut.wood).toBe(whole.wood);
		expect(cut.leaf).toBe(whole.leaf);
	});

	// **A layer's salt is its id, so deleting one must not re-sow the others.**
	it("leaves a layer's own forest alone when another is dropped", () => {
		const both = stand(patch, layers, 16);
		const oakAlone = stand(patch, [layers[1]!], 16);
		// Oak takes what Pine left, so dropping Pine can only add oaks; every
		// cell the pair's oaks wrote has to still be an oak's. `owner` is a
		// position in the list of layers that grew rather than an id, because
		// it is what a palette is indexed by -- so oak is the second of two and
		// the first of one, and the salt that chose its forest is the id
		// underneath. The two stands hold a different number of slots per
		// column, because the tallest species in each is different, so a cell
		// is found by its column and its slot rather than by one index.
		let lost = 0;
		const slots = Math.min(both.layers, oakAlone.layers);
		for (let c = 0; c < patch.count; c++)
			for (let slot = 0; slot < slots; slot++)
				if (
					both.owner[c * both.layers + slot] === 2 &&
					oakAlone.owner[c * oakAlone.layers + slot] !== 1
				)
					lost++;
		expect(lost).toBe(0);
	});

	// **A skeleton is one piece standing on the ground because it was grown
	// that way.** Growing wood wherever a noise field crosses a threshold gives
	// a cloud of fragments rooted nowhere, and the repair for that is a flood
	// fill -- a global query, which nothing that has to be terrain can run.
	it("leaves the wood connected to the ground", () => {
		// **One plant, well inside the rim.** A patch has an edge, and a canopy
		// hanging over it is written on cells nobody drew -- which reads as
		// debris here and is only the patch stopping. The measurement is about
		// the skeleton, so it is made where the patch is not in the way.
		const top = new Float64Array(patch.count);
		const groundLayer = new Int32Array(patch.count).fill(-1);
		const roots = plantRoots(patch.centre, LEVEL, 0);
		const rootHeight = new Float64Array(roots.count).fill(5);
		const grown = growStand(
			patch,
			{ top, groundLayer },
			roots,
			rootHeight,
			[layerOf(1, "Oak", 100)],
			{
				seed: 4711,
				radius: RADIUS,
				blockMetres: BLOCK,
				rootLevel: LEVEL,
				chunkCells: 4096,
				chunkReach: 24,
				seaLevel: 0,
			},
		);
		expect(grown.plants).toBe(1);
		const pieces = standPieces(patch, groundLayer, grown);
		expect(pieces.pieces).toBe(1);
		expect(pieces.rooted).toBe(1);
	});

	it("counts what a player would walk into", () => {
		const grown = stand(patch, layers, 16);
		const height = new Float64Array(patch.count).fill(5);
		const solid = standWalkable(grown, height, BLOCK, 0, true);
		const airy = standWalkable(grown, height, BLOCK, 0, false);
		expect(solid).toBeGreaterThan(0);
		expect(solid).toBeLessThanOrEqual(airy);
	});

	// **Nothing is planted on one of the twelve.** A pentagon column is
	// protected, so directional machinery never has to sit on a five.
	it("plants nothing on a pentagon", () => {
		const pole = columnPatchLayout({ at: NORTH, level: LEVEL, rings: 3 });
		const top = new Float64Array(pole.count);
		const groundLayer = new Int32Array(pole.count).fill(-1);
		const roots = plantRoots(NORTH, LEVEL, 3);
		const rootHeight = new Float64Array(roots.count).fill(5);
		const grown = growStand(
			pole,
			{ top, groundLayer },
			roots,
			rootHeight,
			[layerOf(1, "Pine", 100)],
			{
				seed: 9,
				radius: RADIUS,
				blockMetres: BLOCK,
				rootLevel: LEVEL,
				chunkCells: 4096,
				chunkReach: 24,
				seaLevel: 0,
			},
		);
		expect(grown.refused).toBeGreaterThan(0);
	});

	// **Nothing grows in the sea**, and the test is the map's own height at the
	// root rather than the column it is drawn on.
	it("plants nothing under water", () => {
		const top = new Float64Array(patch.count);
		const groundLayer = new Int32Array(patch.count).fill(-1);
		const roots = plantRoots(patch.centre, LEVEL, ROOT_RINGS);
		const drowned = new Float64Array(roots.count).fill(-3);
		const grown = growStand(
			patch,
			{ top, groundLayer },
			roots,
			drowned,
			layers,
			{
				seed: 4711,
				radius: RADIUS,
				blockMetres: BLOCK,
				rootLevel: LEVEL,
				chunkCells: 16,
				chunkReach: 24,
				seaLevel: 0,
			},
		);
		expect(grown.plants).toBe(0);
		expect(grown.blocks.some((cell) => cell === PLANT_WOOD)).toBe(false);
	});
});
