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
});
