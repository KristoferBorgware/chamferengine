import { describe, expect, it } from "vitest";
import type { PlantLayer } from "chamfer/generation";
import {
	BlockType,
	COARSE_MAP_DEFAULTS,
	ChunkAddress,
	PLANT_SPECIES,
	PlantTemplateStore,
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
import {
	canonicalCell,
	directionToCell,
	joinPath,
	splitPath,
} from "chamfer/addressing";
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

/**
 * The same forest, drawn a level coarse.
 *
 * A root is a cell of the world's finest lattice whatever level a chunk is
 * drawn at, and a coarse chunk offers the part of that lattice which is its
 * own -- one point in four. So the trees it grows are a **subset** of the ones
 * the finest level grows, standing in the same places: a tree appears as a
 * player walks in and never moves or vanishes.
 */
describe("a chunk drawn a level coarse", () => {
	// Thinner than the tests above, so a block of four roots rarely holds two
	// and the count is about the rule rather than about saturation.
	const LAYERS = [layerOf(1, "Pine", 10)];

	/**
	 * Every cell a trunk stands on, named at the world's finest lattice, and
	 * the columns that were looked at.
	 *
	 * **Two cells in from the triangle's own edge.** A chunk grows every plant
	 * within reach of its rim and writes only its own cells, so a tree rooted
	 * in the ring belongs to the neighbour and is not in this chunk's slots at
	 * all. The rim is a third of a sixteen-cell triangle, and comparing two
	 * levels across it compares two different rings.
	 */
	function feet(
		lod: number,
		key: number,
		margin: number,
	): {
		trunks: Set<number>;
		columns: Set<number>;
	} {
		const { shape, terrain, address } = world();
		void address;
		const level = shape.atLod(lod);
		const coarse = new TerrainGenerator(
			SEED,
			level,
			terrain.map,
			TERRAIN_DEFAULTS,
		);
		const cut = CHUNK_LEVEL - lod;
		const chunk = generateChunk(
			coarse,
			ChunkAddress.fromKey(key, cut),
			cut,
			level.crustDepth,
		);
		// The surface each column tops at, before a canopy widens its band.
		const surface = Int32Array.from(chunk.band);
		// **The templates the engine itself uses**, because the bug this
		// catches is in the stamp and not in the walk.
		plantChunk(
			chunk,
			coarse,
			level,
			LAYERS,
			SEED,
			DEPTH,
			new PlantTemplateStore(
				SEED,
				level.subdivisionDepth,
				level.blockSize,
				level.seaLevelRadius,
			),
		);
		const trunks = new Set<number>();
		const columns = new Set<number>();
		const m = chunk.m;
		const layers = chunk.layerCount;
		for (let q = margin; q <= m - margin; q++)
			for (let r = margin; q + r <= m - margin; r++) {
				const slot = rankOf(q, r, m);
				const [i, j] = joinPath(
					ChunkAddress.fromKey(key, cut).path,
					q,
					r,
					DEPTH - lod,
				);
				const name = (i << lod) * 262144 + (j << lod);
				columns.add(name);
				const top = surface[slot * 2]!;
				const foot = chunk.blocks[slot * layers + top - 1] ?? 0;
				if (isPlantWood(foot)) trunks.add(name);
			}
		return { trunks, columns };
	}

	/** `rank(q, r, m)` -- a slot's index inside a triangle of side `m`. */
	function rankOf(q: number, r: number, m: number): number {
		return q + (r * (2 * m + 3 - r)) / 2;
	}

	it("grows plants and writes their cells", () => {
		const { address } = world();
		const key = Math.floor(address.key / 4);
		expect(feet(1, key, 2).trunks.size).toBeGreaterThan(0);
	});

	// **The bug this catches drew nothing and reported success.** A template's
	// offsets are cells of the lattice the chunk is drawn on and a root is
	// named on the world's finest one; stepping the template from the root's
	// name put every cell of every plant outside the patch, so a coarse chunk
	// counted its plants and wrote not one block of them.
	//
	/**
	 * **Under half a block a plant is the colour of the ground, not a block.**
	 * A 30.8 m pine at a 64 m block has nothing to be made of, and what can be
	 * seen of a forest from the distance that block is drawn at is that the
	 * ground under it is green. So the plant pass hands the mesher the columns
	 * it could not build on and writes no block at all -- which is what keeps
	 * a canopy at a distance from moving anything a player stands on, breaks
	 * or collides with.
	 */
	it("hands over a canopy colour where it cannot build a plant", () => {
		const { shape, terrain, address } = world();
		// Four levels out is a 64 m block against a 30.8 m tallest pine.
		const level = shape.atLod(4);
		const coarse = new TerrainGenerator(
			SEED,
			level,
			terrain.map,
			TERRAIN_DEFAULTS,
		);
		const chunk = generateChunk(
			coarse,
			new ChunkAddress(address.face, []),
			CHUNK_LEVEL - 4,
			level.crustDepth,
		);
		const before = Uint16Array.from(chunk.blocks);
		const grown = plantChunk(
			chunk,
			coarse,
			level,
			LAYERS,
			SEED,
			DEPTH,
			new PlantTemplateStore(
				SEED,
				level.subdivisionDepth,
				level.blockSize,
				level.seaLevelRadius,
			),
		);
		expect(grown).not.toBeNull();
		expect(grown!.cover.size).toBeGreaterThan(0);
		// Not one block, anywhere: the canopy is a colour and nothing else.
		expect(grown!.where.length).toBe(0);
		expect(chunk.blocks).toEqual(before);
	});

	// **A column has a trunk exactly when a root in its own block has one.** A
	// drawn cell a level out covers four of the world's own cells, and the
	// column asks all four and grows the first that wants a plant -- so the
	// two directions below are the whole rule, and the blocks nest, which is
	// what makes a forest only ever get denser as it is walked toward.
	it("has a trunk exactly where the finest level has one in its block", () => {
		const { address } = world();
		const parent = Math.floor(address.key / 4);
		// Two cells in on the coarse chunk, whose rim is nobody's; the four
		// fine chunks whole, because they tile that triangle exactly and each
		// one's rim is another one's ground.
		const coarse = feet(1, parent, 2);
		const fine = new Set<number>();
		for (let child = 0; child < 4; child++)
			for (const one of feet(0, parent * 4 + child, 0).trunks)
				fine.add(one);

		// The coarse column a fine cell belongs to, in the same names: its
		// block is the pair of coordinates with the low bit dropped.
		const block = (one: number) =>
			(Math.floor(one / 262144) & ~1) * 262144 + ((one % 262144) & ~1);
		// Only where both levels were looked at: a fine chunk's own rim is
		// inside the coarse triangle, but the coarse chunk's rim is not
		// inside any of them.
		const here = [...fine].filter((one) => coarse.columns.has(block(one)));
		// Nothing vanishes as it is approached: every tree the finest level
		// grows has one at the coarse column covering its own root.
		const gone = here.filter((one) => !coarse.trunks.has(block(one)));
		// Nothing is invented either: a coarse trunk has a fine one under it.
		const under = new Set(here.map(block));
		const spare = [...coarse.trunks].filter((one) => !under.has(one));
		expect(
			`${gone.length} gone, ${spare.length} invented, ` +
				`of ${here.length} fine and ${coarse.trunks.size} coarse`,
		).toBe(
			`0 gone, 0 invented, ` +
				`of ${here.length} fine and ${coarse.trunks.size} coarse`,
		);

		// And the count holds up rather than falling with the level: four
		// roots a column, one trunk a column, so the only loss is a block
		// holding more than one tree.
		// **And the count holds up rather than falling with the level.** Four
		// roots to a column and one trunk to a column, so the only loss is a
		// block that held more than one tree: `22` against `28` here, where
		// offering the column's own root alone gives `9`.
		expect(coarse.trunks.size).toBeGreaterThan(here.length * 0.6);
	});
});
