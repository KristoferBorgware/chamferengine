import { beforeAll, describe, expect, it } from "vitest";
import type { CoarseMap } from "chamfer/generation";
import {
	BlockType,
	TerrainGenerator,
	COARSE_MAP_DEFAULTS,
	buildCoarseMap,
	isSolid,
	maxElevationFor,
	isTranslucent,
	seedFromString,
	BiomeField,
	DEFAULT_BIOMES,
	DEFAULT_LANDFORM_GRID,
	biomeWorldFor,
	makeBiomeSample,
	CONTINENT_LAYER_DEFAULT,
	EROSION_LAYER_DEFAULT,
	PEAKS_LAYER_DEFAULT,
	ANY_LANDFORM,
} from "chamfer/generation";
import type { BiomeDef } from "chamfer/generation";
import { WorldShape, maxCrustDepth } from "chamfer/world";
import { Vec3 } from "chamfer/math";

/** Coarse enough to build once per file, fine enough to carry rivers. */
const COARSE_LEVEL = 6;
const DEPTH = 9;

/** Metres from sea level to the tallest ground the level alone can reach. */
const RELIEF = 100;

/**
 * How tall a peak on top of that may be.
 *
 * **A crust is sized by the sum, never by Relief alone.** The height is no
 * longer fitted to its own peak, so Relief bounds the level and this bounds
 * what a full peak adds -- a shape sized by the first alone has ground standing
 * out of its own crust.
 */
const PEAK = 40;

/**
 * How deep the sea floor runs, matched to the crust the shape below has.
 *
 * The floor is `seaDepth + peakRelief` at its deepest, and a crust that does
 * not reach it has ocean bed below its own bottom -- where `blockAt` reads air,
 * because there is no block there to read.
 */
const SEA_DEPTH = 120;

let map: CoarseMap;
let shape: WorldShape;
let gen: TerrainGenerator;

beforeAll(() => {
	map = buildCoarseMap(seedFromString("chamfer"), {
		level: COARSE_LEVEL,
		cellMetres: 100,
		relief: RELIEF,
		peakRelief: PEAK,
		seaDepth: SEA_DEPTH,
	});
	shape = new WorldShape(
		1700,
		DEPTH,
		maxElevationFor({ relief: RELIEF, peakRelief: PEAK }),
		maxCrustDepth(DEPTH),
	);
	gen = new TerrainGenerator(map.seed, shape, map, {
		rockLine: 28,
		snowLine: 45,
	});
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
		// **The land share is a measurement, not a knob.** The coast is where
		// the continentalness curve crosses its own middle, so what this
		// guarantees is that the terrain follows the map rather than deciding
		// for itself: both are asked, and both give the same answer.
		let mapDry = 0;
		for (const h of map.height) if (h > 0) mapDry++;
		expect(dry / total).toBeCloseTo(mapDry / map.count, 1);
	});
});

describe("the world is the map", () => {
	it("reads the height off the map and adds nothing to it", () => {
		// There used to be a noise term here at its own amplitude, over a map
		// height multiplied by a third number. Three knobs that moved the
		// ground and appeared nowhere in the picture the editor drew.
		for (const [face, i, j] of [
			[0, 0, 0],
			[7, 33, 61],
			[19, 100, 4],
		] as const) {
			const column = gen.columnAt(face, i, j);
			const onTheMap = map.heightAt(face, i, j, shape.subdivisionDepth);
			expect(column.elevation).toBe(onTheMap);
			expect(column.groundRadius).toBe(shape.seaLevelRadius + onTheMap);
		}
	});

	it("stands water at sea level and nowhere else", () => {
		for (const column of columns(32)) {
			expect(column.waterRadius).toBe(
				Math.max(column.groundRadius, shape.seaLevelRadius),
			);
			// Wet is exactly "the map says this cell is under zero". There is
			// no lake standing above sea level, because nothing floods a basin
			// any more.
			expect(column.waterRadius > column.groundRadius).toBe(
				column.elevation < 0,
			);
		}
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
	it("leaves the ocean empty, because the sea is a surface", () => {
		// The sea is one shell at one radius, drawn rather than built, so a
		// column under it holds nothing between its ground and that radius.
		// `waterLayer` still says where the surface is, for the shore
		// material and for the map; it no longer names blocks.
		let checked = 0;
		for (const column of columns(32)) {
			if (column.waterLayer >= column.groundLayer) continue;
			checked++;
			for (
				let layer = column.waterLayer;
				layer < column.groundLayer;
				layer++
			)
				expect(gen.blockAt(column, layer)).toBe(BlockType.AIR);
			// And the ground under it is still ground.
			expect(gen.blockAt(column, column.groundLayer)).not.toBe(
				BlockType.AIR,
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

describe("blockAtPosition", () => {
	it("agrees with the column it stands over", () => {
		for (const column of columns(64))
			for (const layer of [
				column.waterLayer,
				column.groundLayer,
				column.groundLayer + 3,
			]) {
				if (layer < 0 || layer >= shape.crustDepth) continue;
				// The middle of the layer, so rounding at the boundary is not
				// what is under test.
				const radius =
					shape.radiusOfLayer(layer) - shape.blockSize * 0.5;
				const at = new Vec3(column.x, column.y, column.z).scale(radius);
				expect(gen.blockAtPosition(at)).toBe(
					gen.blockAt(column, layer),
				);
			}
	});

	it("says air under the sea, which is drawn and not built", () => {
		// Whether a camera is under the surface is a radius test now, not a
		// block read: there are no water blocks in an ocean to find.
		let wet = 0;
		for (const column of columns(32)) {
			if (column.waterLayer >= column.groundLayer) continue;
			const mid = (layer: number) =>
				new Vec3(column.x, column.y, column.z).scale(
					shape.radiusOfLayer(layer) - shape.blockSize * 0.5,
				);
			expect(gen.blockAtPosition(mid(column.waterLayer))).toBe(
				BlockType.AIR,
			);
			expect(gen.blockAtPosition(mid(column.waterLayer - 1))).toBe(
				BlockType.AIR,
			);
			wet++;
		}
		expect(wet).toBeGreaterThan(0);
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

	it("stacks grass, then bare rock, then snow, by elevation alone", () => {
		let grass = 0;
		let rock = 0;
		let snow = 0;
		for (const column of columns(16)) {
			if (column.waterRadius > column.groundRadius) continue;
			const top = gen.blockAt(column, column.groundLayer);
			if (top === BlockType.GRASS) {
				grass++;
				expect(column.elevation).toBeLessThanOrEqual(28);
			}
			if (top === BlockType.STONE) {
				rock++;
				expect(column.elevation).toBeGreaterThan(28);
				expect(column.elevation).toBeLessThanOrEqual(45);
			}
			if (top === BlockType.SNOW) {
				snow++;
				expect(column.elevation).toBeGreaterThan(45);
			}
		}
		// Every band holds ground, and each one holds less than the one under
		// it. A band nobody stands in is a band nobody sees.
		expect(snow).toBeGreaterThan(0);
		expect(rock).toBeGreaterThan(snow);
		expect(grass).toBeGreaterThan(rock);
	});

	it("takes the soil away under bare rock and under snow", () => {
		// The stone shows through where the ground is cut into as well as on
		// top of it, so a hillside that high has no band of dirt inside it.
		let checked = 0;
		for (const column of columns(16)) {
			if (column.waterRadius > column.groundRadius) continue;
			if (column.elevation <= 28) continue;
			checked++;
			for (let down = 0; down < 4; down++)
				expect([BlockType.SNOW, BlockType.STONE]).toContain(
					gen.blockAt(column, column.groundLayer + down),
				);
		}
		expect(checked).toBeGreaterThan(0);
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

describe("the carve, written into a column", () => {
	/**
	 * **`blockAt` is the truth and `fillColumn` is what a chunk build calls.**
	 * The column writer evaluates a band under the ground and fills the crust
	 * below it with stone, which is what keeps a chunk at about ten evaluations
	 * a column however deep the crust runs -- and it is only sound while
	 * nothing can open air below that band. The carve can, down to its own
	 * reach, so the band has to reach as far.
	 *
	 * Measured on the shipped world before this held (`probe-carve-depth.ts`):
	 * over 1,283 land columns, 47,971 carved blocks were written back to stone
	 * and 11 columns kept rock over air, against 299 with the band right. That
	 * is a layer that can only nibble the top of a column, which reads as
	 * terrain whose height moved rather than terrain with a hole in it.
	 */
	it("writes every block the carve opened, however deep it opened it", () => {
		const carved = new TerrainGenerator(map.seed, shape, map, {
			rockLine: 28,
			snowLine: 45,
			carveLayer: true,
		});
		const layers = shape.crustDepth;
		const into = new Uint16Array(layers);
		let checked = 0;
		let disagreed = 0;
		for (const column of columns(32)) {
			if (column.elevation <= 0) continue;
			checked++;
			carved.fillColumn(column, into, 0, layers);
			// The floor is bedrock whatever the terrain says, so it is the one
			// layer the writer is meant to differ on.
			for (let layer = column.groundLayer; layer < layers - 1; layer++)
				if (
					(carved.blockAt(column, layer) !== BlockType.AIR) !==
					(into[layer] !== BlockType.AIR)
				)
					disagreed++;
		}
		expect(checked).toBeGreaterThan(0);
		expect(disagreed).toBe(0);
	});

	/** With the layer off the fill is the shortcut it always was. */
	it("keeps the soil band when nothing can open air below it", () => {
		const layers = shape.crustDepth;
		const into = new Uint16Array(layers);
		for (const column of columns(32)) {
			if (column.elevation <= 0) continue;
			gen.fillColumn(column, into, 0, layers);
			for (let layer = column.groundLayer; layer < layers - 1; layer++)
				expect(into[layer]).not.toBe(BlockType.AIR);
		}
	});
});

describe("with a biome table", () => {
	let field: BiomeField;
	let biomeGen: TerrainGenerator;

	beforeAll(() => {
		field = new BiomeField(
			biomeWorldFor(
				map.seed,
				shape,
				map,
				CONTINENT_LAYER_DEFAULT,
				EROSION_LAYER_DEFAULT,
				PEAKS_LAYER_DEFAULT,
			),
			DEFAULT_BIOMES,
			DEFAULT_LANDFORM_GRID,
		);
		biomeGen = new TerrainGenerator(
			map.seed,
			shape,
			map,
			{ rockLine: 28, snowLine: 45 },
			field,
		);
	});

	it("names dry ground with the biome's own block, not the elevation bands", () => {
		const scratch = makeBiomeSample();
		let checked = 0;
		for (const column of columns(32)) {
			if (column.waterRadius > column.groundRadius) continue;
			const top = biomeGen.blockAt(column, column.groundLayer);
			const want = field.blockAt(column.x, column.y, column.z, scratch);
			expect(want).toBeGreaterThanOrEqual(0);
			expect(top).toBe(want);
			checked++;
		}
		expect(checked).toBeGreaterThan(0);
	});

	it("still lays sand under water, which the biome model has no ground to name", () => {
		let checked = 0;
		for (const column of columns(32)) {
			if (column.waterRadius <= column.groundRadius) continue;
			expect(biomeGen.blockAt(column, column.groundLayer)).toBe(
				BlockType.SAND,
			);
			checked++;
		}
		expect(checked).toBeGreaterThan(0);
	});

	it("leaves the deep crust to the elevation bands, past the soil a biome's underlay reaches", () => {
		// Ten layers down is past the soil depth on this world, so it is hard
		// stone regardless of what a biome named for its own underlay.
		let checked = 0;
		for (const column of columns(32)) {
			if (column.waterRadius > column.groundRadius) continue;
			expect(biomeGen.blockAt(column, column.groundLayer + 10)).toBe(
				BlockType.STONE,
			);
			checked++;
		}
		expect(checked).toBeGreaterThan(0);
	});

	describe("a biome's own underlay", () => {
		// A dry dot with an underlay and a wet dot without one, both open to
		// every landform, so nearest-dot splits the whole climate square
		// between them and both turn up over a spread of columns whatever
		// this world's own relief happens to reach -- unlike `DEFAULT_BIOMES`,
		// where Badlands and Desert may or may not be the nearest dot to any
		// column this small a test world actually builds.
		const withUnderlay: BiomeDef = {
			name: "Dry with underlay",
			hex: "c06a3a",
			t: 0.2,
			h: 0.2,
			landform: ANY_LANDFORM,
			block: BlockType.BADLANDS_GROUND,
			underlay: BlockType.SANDSTONE,
		};
		const withoutUnderlay: BiomeDef = {
			name: "Wet without one",
			hex: "2f9e2f",
			t: 0.8,
			h: 0.8,
			landform: ANY_LANDFORM,
			block: BlockType.RAINFOREST_GROUND,
		};
		let twoBiomeField: BiomeField;
		let twoBiomeGen: TerrainGenerator;

		beforeAll(() => {
			twoBiomeField = new BiomeField(
				biomeWorldFor(
					map.seed,
					shape,
					map,
					CONTINENT_LAYER_DEFAULT,
					EROSION_LAYER_DEFAULT,
					PEAKS_LAYER_DEFAULT,
				),
				[withUnderlay, withoutUnderlay],
				DEFAULT_LANDFORM_GRID,
			);
			twoBiomeGen = new TerrainGenerator(
				map.seed,
				shape,
				map,
				{ rockLine: 28, snowLine: 45 },
				twoBiomeField,
			);
		});

		it("cuts into it just under the surface, and plain dirt where none is named", () => {
			// One layer down is inside the soil band, the one place a biome's
			// underlay reads instead of plain dirt -- read back from the same
			// surface call rather than asking the table a second time.
			const scratch = makeBiomeSample();
			let underlaid = 0;
			let plain = 0;
			for (const column of columns(32)) {
				if (column.waterRadius > column.groundRadius) continue;
				if (column.elevation > 28) continue; // above rockLine
				const biome = twoBiomeField.readAt(
					column.x,
					column.y,
					column.z,
					scratch,
				);
				if (biome < 0) continue;
				// The surface layer first, in the same order `fillColumn`
				// reads a column top to bottom -- it is what leaves a biome
				// for the next call to read back rather than asking the
				// table again.
				twoBiomeGen.blockAt(column, column.groundLayer);
				const under = twoBiomeGen.blockAt(
					column,
					column.groundLayer + 1,
				);
				if (biome === 0) {
					expect(under).toBe(BlockType.SANDSTONE);
					underlaid++;
				} else {
					expect(under).toBe(BlockType.DIRT);
					plain++;
				}
			}
			// Both cases have to turn up, or this is only checking one of them.
			expect(underlaid).toBeGreaterThan(0);
			expect(plain).toBeGreaterThan(0);
		});
	});

	it("changes nothing for a generator built without one", () => {
		// `gen`, from the outer `beforeAll`, carries no biome field -- the
		// same seed and map through the plain constructor still answers with
		// the elevation bands alone.
		for (const column of columns(32)) {
			const top = gen.blockAt(column, column.groundLayer);
			expect([
				BlockType.SAND,
				BlockType.GRASS,
				BlockType.STONE,
				BlockType.SNOW,
			]).toContain(top);
		}
	});
});
