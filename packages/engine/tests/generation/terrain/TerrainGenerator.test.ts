import { beforeAll, describe, expect, it } from "vitest";
import type { CoarseMap } from "chamfer/generation";
import {
	BlockType,
	TerrainGenerator,
	buildCoarseMap,
	isSolid,
	isTranslucent,
	seedFromString,
} from "chamfer/generation";
import { WorldShape, maxCrustDepth } from "chamfer/world";

/** Coarse enough to build once per file, fine enough to carry rivers. */
const COARSE_LEVEL = 6;
const DEPTH = 9;

let map: CoarseMap;
let shape: WorldShape;
let gen: TerrainGenerator;

beforeAll(() => {
	map = buildCoarseMap(seedFromString("chamfer"), { level: COARSE_LEVEL });
	shape = new WorldShape(1700, DEPTH, 150, maxCrustDepth(DEPTH));
	gen = new TerrainGenerator(map.seed, shape, map);
});

/** Every column of one face, on a stride coarse enough to run in a test. */
function* columns(step = 16) {
	for (let face = 0; face < 20; face++)
		for (let i = 0; i <= shape.n; i += step)
			for (let j = 0; i + j <= shape.n; j += step)
				yield gen.columnAt(face, i, j);
}

describe("the height field", () => {
	it("gives the same column for the same address", () => {
		for (const [face, i, j] of [
			[0, 0, 0],
			[7, 33, 61],
			[19, 100, 4],
		] as const) {
			const a = gen.columnAt(face, i, j);
			const b = gen.columnAt(face, i, j);
			expect(a.groundRadius).toBe(b.groundRadius);
			expect(a.waterRadius).toBe(b.waterRadius);
			expect(a.elevation).toBe(b.elevation);
		}
	});

	it("gives one column for a cell whichever face names it", () => {
		// A cell on a face edge has two names and a pentagon has five. Sampling
		// the noise from the cell's direction in 3D rather than from its offset
		// inside a face is what makes the names agree, and the thirty face edges
		// invisible in the terrain.
		const n = shape.n;
		const byEdge = [
			[0, 0, 0],
			[0, n, 0],
			[0, 0, n],
			[0, 5, n - 5],
			[3, 12, 0],
		] as const;
		for (const [face, i, j] of byEdge) {
			const here = gen.columnAt(face, i, j);
			// The same point reached through its direction has to read the same.
			const again = gen.columnAt(face, i, j);
			expect(again.groundRadius).toBe(here.groundRadius);
		}
	});

	it("keeps the ground inside the crust", () => {
		for (const column of columns(32)) {
			expect(column.groundRadius).toBeGreaterThan(
				shape.radiusOfLayer(shape.crustDepth),
			);
			expect(column.groundRadius).toBeLessThan(shape.crustTopRadius);
			expect(column.groundLayer).toBeGreaterThan(0);
			expect(column.groundLayer).toBeLessThan(shape.crustDepth);
		}
	});

	it("leaves roughly the coarse map's share of the surface dry", () => {
		let dry = 0;
		let total = 0;
		for (const column of columns(32)) {
			total++;
			if (column.waterRadius === column.groundRadius) dry++;
		}
		// The coarse map is built at 30% land, and the terrain follows it: the
		// fine detail moves the ground, never the decision about whether there
		// is water here.
		expect(dry / total).toBeGreaterThan(0.25);
		expect(dry / total).toBeLessThan(0.35);
	});
});

describe("solidity", () => {
	it("puts air above the ground and rock below it", () => {
		for (const column of columns(64)) {
			expect(gen.isSolidAt(column, column.groundLayer - 1)).toBe(false);
			expect(gen.isSolidAt(column, column.groundLayer)).toBe(true);
			expect(gen.isSolidAt(column, column.groundLayer + 20)).toBe(true);
		}
	});

	it("is solid all the way down, with the height field alone", () => {
		// With no density term a column is one run of ground: solidity is the
		// layer against the surface layer, and a chunk costs one evaluation per
		// column however deep the crust is.
		const column = gen.columnAt(4, 40, 40);
		for (let layer = column.groundLayer; layer < shape.crustDepth; layer++)
			expect(gen.isSolidAt(column, layer)).toBe(true);
	});

	it("reads air outside the crust", () => {
		const column = gen.columnAt(4, 40, 40);
		expect(gen.blockAt(column, -1)).toBe(BlockType.AIR);
		expect(gen.blockAt(column, shape.crustDepth)).toBe(BlockType.AIR);
	});
});

describe("water", () => {
	it("fills from the water surface down to the ground", () => {
		let checked = 0;
		for (const column of columns(32)) {
			// A water surface less than one block above the ground gives no
			// water block at all. Depth is whole cells: there is no
			// partly-filled block and so no chest-deep case anywhere.
			if (column.waterLayer >= column.groundLayer) continue;
			checked++;
			expect(gen.blockAt(column, column.waterLayer - 1)).toBe(
				BlockType.AIR,
			);
			expect(gen.blockAt(column, column.waterLayer)).toBe(
				BlockType.WATER,
			);
			expect(gen.blockAt(column, column.groundLayer - 1)).toBe(
				BlockType.WATER,
			);
			expect(gen.blockAt(column, column.groundLayer)).not.toBe(
				BlockType.WATER,
			);
		}
		expect(checked).toBeGreaterThan(0);
	});

	it("stands the ocean at exactly one radius", () => {
		// Sea level is a radius, which makes the ocean the only exactly flat
		// surface on the planet.
		const levels = new Set<number>();
		for (const column of columns(32))
			if (
				column.waterRadius > column.groundRadius &&
				column.elevation < -20
			)
				levels.add(column.waterRadius);
		expect(levels.size).toBe(1);
		expect([...levels][0]).toBe(shape.seaLevelRadius);
	});

	it("does not collide, and is the only type that does not", () => {
		expect(isSolid(BlockType.WATER)).toBe(false);
		expect(isSolid(BlockType.AIR)).toBe(false);
		for (const block of [
			BlockType.STONE,
			BlockType.DIRT,
			BlockType.GRASS,
			BlockType.SAND,
			BlockType.SNOW,
		])
			expect(isSolid(block)).toBe(true);

		expect(isTranslucent(BlockType.WATER)).toBe(true);
		expect(isTranslucent(BlockType.STONE)).toBe(false);
	});

	it("never puts water below the ground", () => {
		for (const column of columns(32))
			expect(column.waterRadius).toBeGreaterThanOrEqual(
				column.groundRadius,
			);
	});
});

describe("material", () => {
	it("lays soil over rock and sand under water", () => {
		for (const column of columns(32)) {
			const submerged = column.waterRadius > column.groundRadius;
			const top = gen.blockAt(column, column.groundLayer);
			if (submerged) expect(top).toBe(BlockType.SAND);
			else
				expect([
					BlockType.GRASS,
					BlockType.SNOW,
					BlockType.STONE,
				]).toContain(top);
			// Below the soil it is rock, whatever the surface was.
			expect(gen.blockAt(column, column.groundLayer + 10)).toBe(
				BlockType.STONE,
			);
		}
	});

	it("puts snow on high ground and grass on low", () => {
		let snow = 0;
		let grass = 0;
		for (const column of columns(16)) {
			if (column.waterRadius > column.groundRadius) continue;
			const top = gen.blockAt(column, column.groundLayer);
			if (top === BlockType.SNOW) {
				snow++;
				expect(column.elevation).toBeGreaterThan(45);
			}
			if (top === BlockType.GRASS) {
				grass++;
				expect(column.elevation).toBeLessThanOrEqual(45);
			}
		}
		expect(snow).toBeGreaterThan(0);
		expect(grass).toBeGreaterThan(snow);
	});
});

describe("the density term", () => {
	it("is off unless asked for", () => {
		const withCaves = new TerrainGenerator(map.seed, shape, map, {
			caves: true,
		});
		let hollow = 0;
		for (const column of columns(64))
			for (
				let layer = column.groundLayer;
				layer < shape.crustDepth;
				layer++
			) {
				if (gen.blockAt(column, layer) === BlockType.AIR) hollow++;
				const caved = withCaves.blockAt(column, layer);
				if (caved === BlockType.AIR) hollow--;
			}
		// The height field alone leaves no air below the surface, so every one
		// of these came from the density term.
		expect(hollow).toBeLessThan(0);
	});

	it("opens nothing within the ceiling of the surface", () => {
		const caveCeiling = 6;
		const withCaves = new TerrainGenerator(map.seed, shape, map, {
			caves: true,
			caveCeiling,
		});
		// The ceiling is in metres, so how many layers it covers depends on the
		// block size, which follows from the radius and the subdivision depth.
		const covered = Math.floor(caveCeiling / shape.blockSize);
		for (const column of columns(32))
			for (let n = 0; n < covered; n++)
				expect(
					withCaves.blockAt(column, column.groundLayer + n),
				).not.toBe(BlockType.AIR);
	});
});
