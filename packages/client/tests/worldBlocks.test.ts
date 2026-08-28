import { beforeAll, describe, expect, it } from "vitest";
import type { CoarseMap } from "chamfer/generation";
import {
	BlockType,
	TerrainGenerator,
	buildCoarseMap,
	seedFromString,
} from "chamfer/generation";
import {
	ChunkAddress,
	generateChunk,
	isPlantWood,
	maxElevationFor,
	plantChunk,
} from "chamfer/generation";
import { DeltaStore, STORE_VERSION, packBlockState } from "chamfer/edit";
import { PlantCellStore } from "../src/PlantCellStore.js";
import { splitPath } from "chamfer/addressing";
import { PLANT_SPECIES } from "chamfer/generation";
import { WorldShape, maxCrustDepth } from "chamfer/world";
import { joinPath, positionToCell, rank } from "chamfer/addressing";
import { Vec3 } from "chamfer/math";
import { worldBlocks } from "../src/worldBlocks.js";

const DEPTH = 8;
const RADIUS = 1700;

let map: CoarseMap;
let shape: WorldShape;
let terrain: TerrainGenerator;

beforeAll(() => {
	map = buildCoarseMap(seedFromString("chamfer"), {
		level: 6,
		cellMetres: 100,
		relief: 100,
	});
	shape = new WorldShape(RADIUS, DEPTH, 150, maxCrustDepth(DEPTH));
	terrain = new TerrainGenerator(map.seed, shape, map);
});

const header = () => ({
	version: STORE_VERSION,
	subdivisionDepth: DEPTH,
	chunkLevel: 4,
	registry: ["chamfer:air", "chamfer:stone"],
});

/**
 * A direction with ground under it, and the layer its surface sits on.
 *
 * **Spread over the whole sphere rather than jittered around one point.** The
 * coast is where the continentalness curve crosses its own middle, so a little
 * over a third of any world is land -- five directions a few degrees apart can
 * all be ocean, and were.
 */
function somewhereOnLand(): { at: Vec3; layer: number; face: number } {
	const golden = Math.PI * (3 - Math.sqrt(5));
	for (let n = 0; n < 200; n++) {
		const y = 1 - (2 * n + 1) / 200;
		const ring = Math.sqrt(Math.max(0, 1 - y * y));
		const at = new Vec3(
			Math.cos(n * golden) * ring,
			y,
			Math.sin(n * golden) * ring,
		).normalize();
		const cell = positionToCell(at, shape.n);
		const column = terrain.columnAt(cell.face, cell.i, cell.j);
		if (column.groundRadius > RADIUS)
			return {
				at,
				layer: shape.layerOfSurface(column.groundRadius),
				face: cell.face,
			};
	}
	throw new Error("no land in the sample");
}

describe("worldBlocks", () => {
	// The wire that had the player standing on ground they had just mined out.
	// Collision, floating and the underwater test are one question -- a block
	// at a point -- and asking the generator answers for the world as it was
	// before anybody touched it.
	it("answers a point in space from the changes, not the seed", () => {
		const { at, layer } = somewhereOnLand();
		let edits = new DeltaStore(header());
		const world = worldBlocks(
			() => terrain,
			() => shape,
			() => edits,
			() => null,
		);

		const surface = at.scale(shape.radiusOfLayer(layer) - 0.5);
		expect(world.probe.blockAtPosition(surface)).not.toBe(BlockType.AIR);

		const cell = { ...positionToCell(at, shape.n), layer };
		edits.write(cell, packBlockState(BlockType.AIR));
		expect(world.probe.blockAtPosition(surface)).toBe(BlockType.AIR);

		// And the other way: a block put where there was nothing stops a
		// player who would otherwise walk through it.
		const above = { ...cell, layer: layer - 2 };
		const inAir = at.scale(shape.radiusOfLayer(above.layer) - 0.5);
		expect(world.probe.blockAtPosition(inAir)).toBe(BlockType.AIR);
		edits.write(above, packBlockState(BlockType.STONE));
		expect(world.probe.blockAtPosition(inAir)).toBe(BlockType.STONE);

		// A saved world replaces the store after the probe is built, and a
		// probe holding the empty one would answer from the seed forever.
		edits = new DeltaStore(header());
		expect(world.probe.blockAtPosition(surface)).not.toBe(BlockType.AIR);
	});

	// A terrain knob rebuilds the map, the generator and the shape, and the
	// pool with them. Anything holding one of those by value goes on answering
	// for the planet that was there before the knob moved -- so the player
	// collides with old ground and a click reads an old block.
	it("follows the world when a knob rebuilds it", () => {
		const { at, layer } = somewhereOnLand();
		let live = terrain;
		let liveShape = shape;
		const edits = new DeltaStore(header());
		const world = worldBlocks(
			() => live,
			() => liveShape,
			() => edits,
			() => null,
		);

		const surface = at.scale(liveShape.radiusOfLayer(layer) - 0.5);
		const before = world.probe.blockAtPosition(surface);
		expect(before).not.toBe(BlockType.AIR);

		// A different seed is a different planet. What is at this point is now
		// whatever the new one puts there, not what the old one did.
		const other = buildCoarseMap(seedFromString("elsewhere"), {
			level: 6,
			cellMetres: 100,
			relief: 400,
		});
		liveShape = new WorldShape(RADIUS, DEPTH, 400, maxCrustDepth(DEPTH));
		live = new TerrainGenerator(other.seed, liveShape, other);

		// The probe has to be reading the new generator. Asking the new one
		// directly is the ground truth, and the probe must agree with it.
		const direct = live.blockAt(
			live.columnAt(
				positionToCell(at, liveShape.n).face,
				positionToCell(at, liveShape.n).i,
				positionToCell(at, liveShape.n).j,
			),
			liveShape.layerOfRadius(surface.length()),
		);
		expect(world.probe.blockAtPosition(surface)).toBe(direct);
	});

	it("keeps the floor of the world under everything a record can say", () => {
		const { at } = somewhereOnLand();
		const edits = new DeltaStore(header());
		const world = worldBlocks(
			() => terrain,
			() => shape,
			() => edits,
			() => null,
		);
		const floor = shape.crustDepth - 1;
		const cell = { ...positionToCell(at, shape.n), layer: floor };
		edits.write(cell, packBlockState(BlockType.AIR));
		expect(world.blockAt(cell)).toBe(BlockType.BEDROCK);
		// And there is nothing under it to fall into.
		expect(world.blockAt({ ...cell, layer: floor + 1 })).toBe(
			BlockType.AIR,
		);
	});

	// **A plant is a block like any other, and the seed does not know about
	// it.** A tree comes out of a walk over every root within reach of a
	// chunk's rim rather than out of the column being asked about, so the
	// generator says air where one stands -- which is a player walking through
	// a trunk, a click passing through a canopy, and a branch that cannot be
	// broken.
	it("answers for a plant the seed cannot see", () => {
		const options = { level: 6, cellMetres: 100, relief: 100 };
		const chunkLevel = 4;
		const grownShape = new WorldShape(
			RADIUS,
			DEPTH,
			maxElevationFor(options),
			maxCrustDepth(DEPTH),
		);
		const grownTerrain = new TerrainGenerator(map.seed, grownShape, map);
		const layer = {
			id: 1,
			species: "Pine",
			on: true,
			density: 40,
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

		// A chunk with land on it, grown, and one cell a plant wrote.
		let found: {
			cell: { face: number; i: number; j: number; layer: number };
			block: number;
		} | null = null;
		for (let n = 0; n < 200 && !found; n++) {
			const golden = Math.PI * (3 - Math.sqrt(5));
			const y = 1 - (2 * n + 1) / 200;
			const ring = Math.sqrt(Math.max(0, 1 - y * y));
			const at = new Vec3(
				Math.cos(n * golden) * ring,
				y,
				Math.sin(n * golden) * ring,
			).normalize();
			const cell = positionToCell(at, grownShape.n);
			const split = splitPath(cell.i, cell.j, DEPTH, chunkLevel);
			const address = new ChunkAddress(cell.face, split.path);
			const chunk = generateChunk(
				grownTerrain,
				address,
				chunkLevel,
				grownShape.crustDepth,
			);
			const cells = plantChunk(
				chunk,
				grownTerrain,
				grownShape,
				[layer],
				map.seed,
			);
			if (!cells || cells.where.length === 0) continue;
			const store = new PlantCellStore(
				DEPTH,
				chunkLevel,
				grownShape.crustDepth,
			);
			store.put(address.key, cells);
			const edits = new DeltaStore({ ...header(), chunkLevel });
			const world = worldBlocks(
				() => grownTerrain,
				() => grownShape,
				() => edits,
				() => store,
			);
			// **A cell strictly inside the triangle.** Every chunk fills the
			// slots on its own rim as well, and the descent awards those to a
			// neighbour -- so a rim cell is answered by the chunk next door,
			// which grew the same plant and is not in this store.
			for (let at2 = 0; at2 < cells.where.length; at2++) {
				if (!isPlantWood(cells.what[at2]!)) continue;
				const slot = Math.floor(
					cells.where[at2]! / grownShape.crustDepth,
				);
				const inLayer =
					cells.where[at2]! - slot * grownShape.crustDepth;
				// Find the lattice point that slot belongs to by walking the
				// triangle: the chunk holds them in rank order.
				let q = 0;
				let r = 0;
				const m = 1 << (DEPTH - chunkLevel);
				outer: for (let a = 0; a <= m; a++)
					for (let b = 0; a + b <= m; b++)
						if (rank(a, b, m) === slot) {
							q = a;
							r = b;
							break outer;
						}
				const m2 = 1 << (DEPTH - chunkLevel);
				if (q === 0 || r === 0 || q + r === m2) continue;
				const [i, j] = joinPath(address.path, q, r, DEPTH);
				const one = {
					face: address.face,
					i,
					j,
					layer: inLayer,
				};
				expect(world.blockAt(one)).toBe(cells.what[at2]!);
				// And the generator alone still says air there, which is the
				// whole reason this wire exists.
				expect(
					grownTerrain.blockAt(
						grownTerrain.columnAt(one.face, one.i, one.j),
						one.layer,
					),
				).toBe(BlockType.AIR);
				// **Broken stays broken**: a record is read before the plant.
				edits.write(one, packBlockState(BlockType.AIR));
				expect(world.blockAt(one)).toBe(BlockType.AIR);
				found = { cell: one, block: cells.what[at2]! };
				break;
			}
		}
		expect(found).not.toBeNull();
	});
});
