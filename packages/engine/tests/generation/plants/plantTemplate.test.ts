import { beforeAll, describe, expect, it } from "vitest";
import type { CoarseMap } from "chamfer/generation";
import {
	BlockType,
	PLANT_SPECIES,
	PLANT_VARIANTS,
	PlantTemplateStore,
	TerrainGenerator,
	buildCoarseMap,
	buildPlantTemplate,
	plantReferencePatch,
	isPlantLeaf,
	isPlantWood,
	maxElevationFor,
	seedFromString,
} from "chamfer/generation";
import { ChunkAddress, generateChunk, plantChunk } from "chamfer/generation";
import { WorldShape, maxCrustDepth } from "chamfer/world";
import { splitPath } from "chamfer/addressing";

const DEPTH = 8;
const CHUNK_LEVEL = 4;
const RADIUS = 1700;
const OPTIONS = { level: 6, cellMetres: 100, relief: 100 };

let map: CoarseMap;
let shape: WorldShape;
let terrain: TerrainGenerator;

/**
 * A world with metre blocks, for the two tests about a plant's own shape.
 *
 * The rest run at depth 8, where a block is `8 m` and a 22 m pine is three
 * blocks tall -- fine for asking whether two chunks agree, useless for asking
 * what a tree looks like.
 */
const FINE_DEPTH = 11;
let fine: WorldShape;

const layer = {
	id: 1,
	species: "Pine",
	on: true,
	density: 30,
	feature: 300,
	featureScale: 4,
	octaves: 3,
	persistence: 0.5,
	lacunarity: 2,
	fold: 0,
	curve: [
		[-1, 1],
		[1, 1],
	] as [number, number][],
	shape: PLANT_SPECIES.Pine!,
};

beforeAll(() => {
	map = buildCoarseMap(seedFromString("chamfer"), OPTIONS);
	shape = new WorldShape(
		RADIUS,
		DEPTH,
		maxElevationFor(OPTIONS),
		maxCrustDepth(DEPTH),
	);
	terrain = new TerrainGenerator(map.seed, shape, map);
	fine = new WorldShape(
		RADIUS,
		FINE_DEPTH,
		maxElevationFor(OPTIONS),
		maxCrustDepth(FINE_DEPTH),
	);
});

/** The flat ground the two shape tests grow their reference plant on. */
const reference = () => {
	const far =
		layer.shape.height * (1 + layer.shape.sizeSpread) +
		layer.shape.leafRadius * 1.6;
	return plantReferencePatch(
		FINE_DEPTH,
		Math.max(2, Math.ceil(far / fine.blockSize) + 2),
	);
};

const store = (): PlantTemplateStore =>
	new PlantTemplateStore(map.seed, DEPTH, shape.blockSize, RADIUS);

describe("buildPlantTemplate", () => {
	it("grows a plant made of that species' own two blocks", () => {
		const one = buildPlantTemplate(
			reference(),
			layer,
			0,
			fine.blockSize,
			RADIUS,
			map.seed,
		);
		expect(one.count).toBeGreaterThan(100);
		expect(one.height).toBeGreaterThan(1);
		let wood = 0;
		let leaf = 0;
		for (let k = 0; k < one.count; k++) {
			const what = one.block[k]!;
			expect(what).not.toBe(BlockType.AIR);
			if (isPlantWood(what)) wood++;
			else if (isPlantLeaf(what)) leaf++;
		}
		expect(wood).toBeGreaterThan(0);
		expect(leaf).toBeGreaterThan(0);
		expect(wood + leaf).toBe(one.count);
	});

	// **A plant reaches up as far as it is tall, and hangs a little below.** A
	// layer counts downward from the crust top, so the block resting on the
	// root's own surface is `-1` and the canopy runs to about the height in
	// blocks. A handful of cells at or under `0` are the ones a canopy puts
	// over a drop, which land in rock at the root's own column and in air where
	// the ground beside it is lower -- the stand keeps `STAND_SUNK` slots below
	// the ground for exactly that.
	it("reaches its own height above the ground it stands on", () => {
		const one = buildPlantTemplate(
			reference(),
			layer,
			0,
			fine.blockSize,
			RADIUS,
			map.seed,
		);
		let highest = 0;
		let sunk = 0;
		for (let k = 0; k < one.count; k++) {
			highest = Math.min(highest, one.dLayer[k]!);
			if (one.dLayer[k]! >= 0) sunk++;
			// Never deeper than the headroom the stand keeps under a column.
			expect(one.dLayer[k]!).toBeLessThan(8);
		}
		expect(-highest * fine.blockSize).toBeGreaterThan(one.height * 0.5);
		expect(sunk).toBeLessThan(one.count / 10);
	});

	/**
	 * **Under one block a plant is one block, and under half a block it is
	 * nothing.** A skeleton has nothing to rasterise into once the grid is
	 * wider than the tree, so a plant that is not floored simply is not there
	 * and the forest ends at whatever level that first happens on. What is
	 * left of a tree seen that far off is one green thing standing on the
	 * ground. The floor stops at half a block because that is the smallest
	 * thing the grid can say: a shrub drawn as a whole coarse block would be
	 * bigger far away than it is underfoot.
	 */
	describe("a plant the block grid is wider than", () => {
		const tallest =
			layer.shape.height * (1 + layer.shape.sizeSpread) * 0.999;

		/** The same species, grown on a grid of a given block size. */
		const at = (block: number) => {
			const far =
				layer.shape.height * (1 + layer.shape.sizeSpread) +
				layer.shape.leafRadius * 1.6;
			const patch = plantReferencePatch(
				FINE_DEPTH,
				Math.max(2, Math.ceil(far / block) + 2),
			);
			let cells = 0;
			let leaves = 0;
			for (let variant = 0; variant < PLANT_VARIANTS; variant++) {
				const one = buildPlantTemplate(
					patch,
					layer,
					variant,
					block,
					RADIUS,
					map.seed,
				);
				cells += one.count;
				for (let k = 0; k < one.count; k++)
					if (isPlantLeaf(one.block[k]!)) leaves++;
			}
			return { cells, leaves };
		};

		// **A species fades over a level rather than ending on one.** Its
		// variants are spread `sizeSpread` either side of its height -- wider
		// than a factor of two at the shipped `0.4` -- so at a block between
		// the smallest and twice it, some are floored to one cell and the
		// rest are under half a block and are not drawn. `27` of the `32`
		// clear it here, which is the share of the spread above `0.7`.
		it("is one leaf block where the block is wider than the plant", () => {
			const got = at(tallest);
			expect(`${got.cells} cells, ${got.leaves} of them leaf`).toBe(
				"27 cells, 27 of them leaf",
			);
			expect(got.cells).toBeLessThan(PLANT_VARIANTS);
		});

		it("is nothing where the block is more than twice the plant", () => {
			expect(at(tallest * 2 + 1).cells).toBe(0);
		});

		// The whole point: it does not go straight from a tree to nothing.
		it("still stands where a whole tree no longer fits", () => {
			expect(at(tallest).cells).toBeGreaterThan(0);
		});
	});

	// The variety the world draws is this many shapes by twelve turns, so the
	// shapes themselves have to differ.
	it("gives a species a set of different plants", () => {
		const made = store().forLayer(layer);
		expect(made.length).toBe(PLANT_VARIANTS);
		const seen = new Set(made.map((one) => `${one.count}:${one.height}`));
		expect(seen.size).toBeGreaterThan(PLANT_VARIANTS / 2);
	});

	// **A biome restriction says where a layer may stand, never what its own
	// reference plant looks like.** The template is built on a private,
	// synthetic patch with no biome reading of its own, so a species
	// restricted to named biomes has to come back exactly as full as the
	// same species with no restriction -- not silently empty because
	// `growStand`'s own "no biome data, no match" rule leaked into a place
	// that never had biome data to begin with.
	it("grows the same plant whether or not the layer names biomes", () => {
		const restricted = { ...layer, biomes: ["Taiga"] };
		const plain = buildPlantTemplate(
			reference(),
			layer,
			0,
			fine.blockSize,
			RADIUS,
			map.seed,
		);
		const withBiomes = buildPlantTemplate(
			reference(),
			restricted,
			0,
			fine.blockSize,
			RADIUS,
			map.seed,
		);
		expect(withBiomes.count).toBe(plain.count);
		expect(withBiomes.height).toBe(plain.height);
		expect(withBiomes.count).toBeGreaterThan(0);
	});

	it("builds the same set from the same world, every time", () => {
		const first = store().forLayer(layer)[3]!;
		const again = store().forLayer(layer)[3]!;
		expect(again.count).toBe(first.count);
		expect([...again.di]).toEqual([...first.di]);
		expect([...again.dj]).toEqual([...first.dj]);
		expect([...again.dLayer]).toEqual([...first.dLayer]);
		expect([...again.block]).toEqual([...first.block]);
	});
});

/** Every plant cell of a chunk, as an absolute cell name and a block. */
function grownCells(
	address: ChunkAddress,
	templates: PlantTemplateStore | null,
): Map<string, number> {
	const chunk = generateChunk(
		terrain,
		address,
		CHUNK_LEVEL,
		shape.crustDepth,
	);
	const got = plantChunk(
		chunk,
		terrain,
		shape,
		[layer],
		map.seed,
		DEPTH,
		templates,
	);
	const out = new Map<string, number>();
	if (!got) return out;
	const m = chunk.m;
	for (let at = 0; at < got.where.length; at++) {
		const slot = Math.floor(got.where[at]! / chunk.layerCount);
		const inLayer = got.where[at]! - slot * chunk.layerCount;
		out.set(`${address.key}:${slot}:${inLayer}`, got.what[at]!);
	}
	void m;
	return out;
}

describe("stamping a template into a chunk", () => {
	// **A chunk grows every plant within reach of its rim and writes only what
	// it owns**, and the whole scheme rests on two chunks agreeing about a tree
	// that straddles them. A template makes that an integer table rather than
	// two runs of the same floating-point stamp, so this has to hold exactly.
	it("puts the same plant in a chunk however often it is built", () => {
		const templates = store();
		let found = 0;
		for (let face = 0; face < 20 && found < 4; face++) {
			const address = new ChunkAddress(
				face,
				splitPath(
					1 << (DEPTH - 2),
					1 << (DEPTH - 2),
					DEPTH,
					CHUNK_LEVEL,
				).path,
			);
			const once = grownCells(address, templates);
			if (once.size === 0) continue;
			found++;
			// A second store, built from nothing but the world's own
			// definition, the way a second worker would.
			const twice = grownCells(address, store());
			expect(twice.size).toBe(once.size);
			for (const [where, what] of once)
				expect(twice.get(where)).toBe(what);
		}
		expect(found).toBeGreaterThan(0);
	});

	it("writes nothing over the ground it stands on", () => {
		const templates = store();
		let checked = 0;
		for (let face = 0; face < 20 && checked < 3; face++) {
			const address = new ChunkAddress(
				face,
				splitPath(
					1 << (DEPTH - 2),
					1 << (DEPTH - 2),
					DEPTH,
					CHUNK_LEVEL,
				).path,
			);
			const chunk = generateChunk(
				terrain,
				address,
				CHUNK_LEVEL,
				shape.crustDepth,
			);
			const before = Uint16Array.from(chunk.blocks);
			const got = plantChunk(
				chunk,
				terrain,
				shape,
				[layer],
				map.seed,
				DEPTH,
				templates,
			);
			if (!got || got.where.length === 0) continue;
			checked++;
			for (let at = 0; at < got.where.length; at++)
				expect(before[got.where[at]!]).toBe(BlockType.AIR);
		}
		expect(checked).toBeGreaterThan(0);
	});
});
