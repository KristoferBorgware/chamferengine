import { beforeAll, describe, expect, it } from "vitest";
import type { CoarseMap } from "chamfer/generation";
import {
	BlockType,
	TerrainGenerator,
	buildCoarseMap,
	seedFromString,
} from "chamfer/generation";
import { DeltaStore, STORE_VERSION, packBlockState } from "chamfer/edit";
import { WorldShape, maxCrustDepth } from "chamfer/world";
import { positionToCell } from "chamfer/addressing";
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

/** A direction with ground under it, and the layer its surface sits on. */
function somewhereOnLand(): { at: Vec3; layer: number; face: number } {
	for (const seed of [0.31, 0.58, 0.12, 0.77, 0.44]) {
		const at = new Vec3(seed, 0.58, 0.75).normalize();
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
		const world = worldBlocks(terrain, shape, () => edits);

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

	it("keeps the floor of the world under everything a record can say", () => {
		const { at } = somewhereOnLand();
		const edits = new DeltaStore(header());
		const world = worldBlocks(terrain, shape, () => edits);
		const floor = shape.crustDepth - 1;
		const cell = { ...positionToCell(at, shape.n), layer: floor };
		edits.write(cell, packBlockState(BlockType.AIR));
		expect(world.blockAt(cell)).toBe(BlockType.BEDROCK);
		// And there is nothing under it to fall into.
		expect(world.blockAt({ ...cell, layer: floor + 1 })).toBe(
			BlockType.AIR,
		);
	});
});
