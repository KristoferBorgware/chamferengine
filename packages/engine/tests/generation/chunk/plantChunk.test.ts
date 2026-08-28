import { describe, expect, it } from "vitest";
import type { PlantLayer } from "chamfer/generation";
import {
	BlockType,
	COARSE_MAP_DEFAULTS,
	ChunkAddress,
	PLANT_SPECIES,
	TERRAIN_DEFAULTS,
	TerrainGenerator,
	buildCoarseMap,
	generateChunk,
	isPlantLeaf,
	maxElevationFor,
	isPlantWood,
	plantChunk,
	seedFromString,
} from "chamfer/generation";
import { WorldShape } from "chamfer/world";
import { canonicalCell, directionToCell, splitPath } from "chamfer/addressing";
import { positionOf } from "chamfer/coordinates";

const SEED = seedFromString("chamfer");
const DEPTH = 8;
const CHUNK_LEVEL = 4;
const BLOCK = 4;

/** One layer that grows thickly, so a small chunk holds something. */
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
	};
}

/**
 * A world small enough to build in a test, and a chunk with land on it.
 *
 * The place is found rather than typed: a latitude and a longitude on one seed
 * is a coin toss between sea and land, and a chunk under water grows nothing.
 */
function world() {
	const options = { ...COARSE_MAP_DEFAULTS, level: 5 };
	const map = buildCoarseMap(SEED, options);
	const radius =
		(BLOCK * 2 ** DEPTH) / Math.sqrt((8 * Math.PI) / (10 * Math.sqrt(3)));
	// **The crust top has to clear the tallest ground**, or a plant has no
	// layer to stand in: the world counts layers downward from it, and ground
	// above it is ground the address cannot name.
	const shape = new WorldShape(radius, DEPTH, maxElevationFor(options), 256);
	const terrain = new TerrainGenerator(SEED, shape, map, TERRAIN_DEFAULTS);
	const n = 2 ** DEPTH;
	for (let latitude = -60; latitude <= 60; latitude += 5)
		for (let longitude = -180; longitude < 180; longitude += 5) {
			const dir = positionOf({ latitude, longitude, altitude: 0 }, 1);
			const found = directionToCell(dir, n);
			const cell = canonicalCell(found.face, n, found.i, found.j);
			if (terrain.columnAt(cell.face, cell.i, cell.j).elevation < 30)
				continue;
			const split = splitPath(cell.i, cell.j, DEPTH, CHUNK_LEVEL);
			return {
				shape,
				terrain,
				address: new ChunkAddress(cell.face, split.path),
			};
		}
	throw new Error("no land on this world");
}

describe("plantChunk", () => {
	it("writes plant blocks into the chunk's own array", () => {
		const { shape, terrain, address } = world();
		const chunk = generateChunk(
			terrain,
			address,
			CHUNK_LEVEL,
			shape.crustDepth,
		);
		const before = [...chunk.blocks];
		const grown = plantChunk(
			chunk,
			terrain,
			shape,
			[layerOf(1, "Pine", 40)],
			SEED,
		);
		expect(grown).not.toBeNull();
		let wood = 0;
		let leaf = 0;
		let over = 0;
		for (let at = 0; at < chunk.blocks.length; at++) {
			const what = chunk.blocks[at]!;
			if (what === before[at]) continue;
			// **Nothing the ground put there is overwritten.** A plant stands
			// in the air over a column, so every cell it changes was air.
			expect(before[at]).toBe(BlockType.AIR);
			if (isPlantWood(what)) wood++;
			else if (isPlantLeaf(what)) leaf++;
			else over++;
		}
		expect(over).toBe(0);
		expect(wood).toBeGreaterThan(0);
		expect(leaf).toBeGreaterThan(0);
	});

	// **A chunk gets an address and the seed and nothing else**, so asking for
	// the same one twice gives the same forest.
	it("gives the same chunk the same plants every time", () => {
		const layers = [layerOf(1, "Oak", 40)];
		const made = (): Uint16Array => {
			const { shape, terrain, address } = world();
			const chunk = generateChunk(
				terrain,
				address,
				CHUNK_LEVEL,
				shape.crustDepth,
			);
			plantChunk(chunk, terrain, shape, layers, SEED);
			return chunk.blocks;
		};
		expect(made()).toEqual(made());
	});

	it("grows nothing when every layer is off", () => {
		const { shape, terrain, address } = world();
		const chunk = generateChunk(
			terrain,
			address,
			CHUNK_LEVEL,
			shape.crustDepth,
		);
		const before = [...chunk.blocks];
		expect(
			plantChunk(
				chunk,
				terrain,
				shape,
				[{ ...layerOf(1, "Pine", 40), on: false }],
				SEED,
			),
		).toBeNull();
		expect([...chunk.blocks]).toEqual(before);
	});
});
