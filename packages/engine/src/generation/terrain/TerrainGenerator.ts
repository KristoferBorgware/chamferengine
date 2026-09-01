import type { CoarseMap } from "../coarse/CoarseMap.js";
import type { ColumnBand } from "./ColumnBand.js";
import type { TerrainColumn } from "./TerrainColumn.js";
import type { TerrainOptions } from "./TerrainOptions.js";
import type { NoiseSettings } from "../noise/NoiseSettings.js";
import type { Vec3 } from "../../math/Vec3.js";
import type { WorldShape } from "../../world/WorldShape.js";
import type { BiomeField, BiomeSample } from "../biomes/BiomeField.js";
import { makeBiomeSample } from "../biomes/BiomeField.js";
import { NoiseCorners } from "../noise/NoiseCorners.js";
import { BlockType } from "./BlockType.js";
import { TERRAIN_DEFAULTS } from "./TerrainOptions.js";
import {
	carveDepth,
	carveIsRock,
	carveMargin,
	carveSeed,
	carveStep,
} from "./carveDensity.js";
import { caveCeilingAt } from "./caveCeilingAt.js";
import { CAVE_OCTAVES } from "./caveField.js";
import { caveDensity } from "./caveDensity.js";
import { layerNoiseSettings } from "../coarse/layeredHeight.js";
import { fbm } from "../noise/fbm.js";
import { latticePosition } from "../../addressing/lattice/latticePosition.js";
import { positionToCell } from "../../addressing/lookup/positionToCell.js";

/** Offset from the world seed, so the detail differs from the coarse tiers. */
const DETAIL_SEED_OFFSET = 4;

/**
 * What block sits at a cell, as a pure function of the seed and the address.
 *
 * Nothing is stored and nothing is cached. A column is evaluated once and read
 * layer by layer, which is what keeps a chunk at one height-field evaluation
 * per column however deep the crust runs.
 *
 * The coarse map supplies the continents, the rivers and the lakes, because
 * those depend on the whole planet. Noise supplies everything below the coarse
 * map's own resolution, sampled from the cell's direction in 3D world space.
 * Sampling from a cell's offset inside its face instead would draw a seam along
 * all thirty face edges.
 */
export class TerrainGenerator {
	readonly seed: number;
	readonly shape: WorldShape;
	readonly map: CoarseMap;

	private readonly settings: Required<TerrainOptions>;

	/**
	 * The carve's octave stack, built once for the generator's whole life.
	 *
	 * It is a function of the layer's rows and the planet's radius, neither of
	 * which moves while a generator exists, and it is read at every block of
	 * every column -- rebuilding it per block was the whole of the layer's cost
	 * before it was hoisted.
	 */
	private readonly carveNoise: NoiseSettings;

	/**
	 * The cliffs layer's last lattice cell, one slot per octave.
	 *
	 * **A column is a line through the field**, and the layer reads it once a
	 * block: over its reach the sample point crosses `4` cells of its widest
	 * octave while taking `120` readings. Held here because `fillColumn` walks
	 * a column in order, so the readings arrive in exactly the order that makes
	 * a cache of one cell worth having. It changes no answer -- the cell and
	 * the seed are both checked -- so a caller reading blocks in any other
	 * order simply misses.
	 */
	private readonly carveCorners: NoiseCorners;

	/**
	 * The cave field's last lattice cells, one slot per octave.
	 *
	 * The same walk-down-a-ray fact the carve's memo rests on, at a feature
	 * five times finer: at a 24 m scale over 1 m blocks the widest octave sits
	 * in one cell for a couple of dozen readings. A memo and never an answer
	 * -- the cell and the seed are checked -- so the point query a collision
	 * or a validator makes simply misses and pays what it always paid.
	 */
	private readonly caveCorners: NoiseCorners;

	/**
	 * The most the cliffs layer's margin can move between one block and the
	 * next, and room to hold one column's worth of its answers.
	 *
	 * `0` says nothing may be skipped, which is a folded field or the layer
	 * being off.
	 */
	private readonly carveMask: Uint8Array;

	/** The most that margin can move between one block of a column and the next. */
	private readonly carveStride: number;
	private readonly carveSeed: number;

	/**
	 * What names the surface, when there is one.
	 *
	 * `null` is a world with no biome table -- the elevation bands below are
	 * the whole of the answer, the way they always were.
	 */
	private readonly biomes: BiomeField | null;

	/** One scratch record, reused for every column's single biome read. */
	private readonly biomeSample: BiomeSample;

	constructor(
		seed: number,
		shape: WorldShape,
		map: CoarseMap,
		options: TerrainOptions = {},
		biomes: BiomeField | null = null,
	) {
		this.seed = seed;
		this.shape = shape;
		this.map = map;
		this.settings = { ...TERRAIN_DEFAULTS, ...options };
		this.biomes = biomes;
		this.biomeSample = makeBiomeSample();
		// The planet's own radius, which is what makes the layer's width a
		// number in metres rather than a count of features round a sphere.
		this.carveCorners = new NoiseCorners(
			Math.max(1, this.settings.carve.octaves),
		);
		this.caveCorners = new NoiseCorners(CAVE_OCTAVES);
		this.carveMask = new Uint8Array(this.shape.crustDepth);
		this.carveNoise = layerNoiseSettings(
			this.settings.carve,
			shape.seaLevelRadius,
		);
		this.carveSeed = carveSeed(seed);
		this.carveStride = carveStep(
			shape.seaLevelRadius,
			shape.blockSize,
			this.settings.carve,
			this.carveNoise,
			this.settings.carveHold,
		);
	}

	/**
	 * Evaluate one column of the world.
	 *
	 * **The map is read and nothing is added to it.** There was a noise term
	 * here, at its own amplitude and its own feature size, laid over a map
	 * height multiplied by a third number -- three knobs that moved the ground
	 * and appeared nowhere in the picture the editor drew, so setting any of
	 * them meant walking the world to find out what had happened. The map is
	 * now stated in metres and the world is the map, which makes the editor's
	 * picture a statement about the ground rather than a suggestion.
	 *
	 * The level of detail is not passed in and must not be. A coarse chunk
	 * draws a subset of a fine chunk's points, and because a point's height
	 * does not depend on who asked, the points it keeps hold exactly the height
	 * the fine chunk gives them -- so a chunk changing level moves no ground.
	 */
	columnAt(face: number, i: number, j: number): TerrainColumn {
		const depth = this.shape.subdivisionDepth;
		const p = latticePosition(face, this.shape.n, i, j);

		// Metres above sea level, straight off the map. Sea level is zero on it
		// by construction, so there is no level to subtract and no scale to
		// apply.
		const elevation = this.map.heightAt(face, i, j, depth);
		const groundRadius = this.shape.seaLevelRadius + elevation;

		// Water stands at sea level and nowhere else. Lakes were a stored field
		// and a flood fill; without them the ocean is the only water, and the
		// ocean is a radius -- which makes it the one exactly flat surface on
		// the planet.
		const waterRadius = Math.max(groundRadius, this.shape.seaLevelRadius);

		return {
			face,
			i,
			j,
			x: p.x,
			y: p.y,
			z: p.z,
			groundRadius,
			waterRadius,
			groundLayer: this.shape.layerOfSurface(groundRadius),
			waterLayer: this.shape.layerOfSurface(waterRadius),
			elevation,
			caveCeiling: this.settings.caves
				? caveCeilingAt(
						p.x,
						p.y,
						p.z,
						this.shape.seaLevelRadius,
						this.seed,
						this.settings.caveCeiling,
						this.settings.caveVary,
						this.settings.caveRare,
						this.settings.caveMouthScale,
					)
				: this.settings.caveCeiling,
		};
	}

	/** What block sits at one layer of a column. */
	blockAt(
		column: TerrainColumn,
		layer: number,
		carved: boolean | null = null,
	): BlockType {
		if (layer < 0 || layer >= this.shape.crustDepth) return BlockType.AIR;

		// Above the ground is air, even below sea level. The sea is a surface
		// at one radius rather than a body of blocks, so an ocean is not
		// something the generator fills in -- it is drawn where the ground is
		// lower than sea level, and `waterRadius` still says where that is for
		// the shore material and the map. A lake or a river, when there is
		// one, is its own body of water and can be blocks.
		if (layer < column.groundLayer) return BlockType.AIR;

		const depthBelow =
			(layer - column.groundLayer + 1) * this.shape.blockSize;

		// **The carve runs first, because it decides whether there is a block
		// here at all** -- caves then hollow what it left, and the material
		// rule paints what survives both.
		if (
			this.settings.carveLayer &&
			!(
				carved ??
				carveIsRock(
					column.x,
					column.y,
					column.z,
					this.shape.seaLevelRadius,
					column.elevation,
					depthBelow,
					this.carveSeed,
					this.settings.carve,
					this.carveNoise,
					this.settings.carveHold,
					undefined,
					undefined,
					this.carveCorners,
				)
			)
		)
			return BlockType.AIR;

		if (this.settings.caves) {
			const radius = this.shape.radiusOfLayer(layer);
			// **The ceiling is a fact about the column and the sheet is a fact
			// about the point**, so the column carries the first and only the
			// second is read here: the dip wanders over the ground, and every
			// layer of one column sits under the same amount of rock.
			const hollow = caveDensity(
				column.x,
				column.y,
				column.z,
				radius,
				depthBelow,
				this.seed,
				this.settings.caveScale,
				this.settings.caveThreshold,
				column.caveCeiling,
				this.settings.caveDepth,
				this.caveCorners,
			);
			// A cave below the water table stays dry. Water is written by the
			// generator and never flows, so a passage under a lake is a passage,
			// not a flooded one.
			if (hollow) return BlockType.AIR;
		}

		return this.material(column, depthBelow);
	}

	/**
	 * Write a whole column's blocks, and report the band they leave open.
	 *
	 * Below the soil every layer is stone all the way to the crust floor, so the
	 * rock is written as one fill rather than evaluated 400 times. That is the
	 * whole of the deep crust: a chunk at 435 layers evaluates about 10 of them
	 * per column and fills the rest.
	 *
	 * **Every layer a term can open has to be evaluated, and the fill starts
	 * under the deepest of them.** Each of the three states its own reach in
	 * metres, so each is a layer count: the soil's depth, the carve's, and the
	 * caves'. The fill keeps the crust below the deepest of them.
	 *
	 * **Caves used to be walked to the bottom of the crust**, on the reasoning
	 * that a passage is free to be at any depth. It is, and the answer is to
	 * bound how deep rather than to ask everywhere: at `1,232` layers against
	 * about ten, turning them on cost the generator more than a hundred times
	 * what it cost with them off, and a world with caves in it simply did not
	 * finish building.
	 *
	 * **Getting this wrong reads as the layer doing nothing.** `blockAt`
	 * answered honestly the whole time and `fillColumn` is what a chunk build
	 * calls: with the band at the soil alone, the carve was evaluated for about
	 * four layers under the ground and every block it opened below that was
	 * written over with stone. Measured over one face of the shipped world
	 * (`tools/probe-carve-depth.ts`), that is **3,311** blocks of **1,596**
	 * land columns opened and refilled, and **0** the other way -- which leaves
	 * a layer that can only nibble the top of a column, so it reads as terrain
	 * whose height moved rather than terrain with a hole in it.
	 */
	fillColumn(
		column: TerrainColumn,
		into: Uint16Array,
		offset: number,
		layers: number,
	): ColumnBand {
		const rock = this.openTo(column, layers);

		// **The cliffs layer is walked with a stride the field itself allows.**
		// It is three quarters of what a column costs, and a margin further
		// from nought than the most it can move in a block is the same answer
		// for that many blocks -- so it is read where it is close to changing
		// its mind and skipped where it is not.
		const carved = this.carveRun(column, rock);

		let first = layers;
		let last = -1;
		for (let layer = 0; layer < rock; layer++) {
			const block = this.blockAt(
				column,
				layer,
				carved ? carved[layer] === 1 : null,
			);
			into[offset + layer] = block;
			if (block !== BlockType.AIR) {
				if (first === layers) first = layer;
			} else last = layer;
			if (block === BlockType.WATER) last = layer;
		}

		if (rock < layers) {
			into.fill(BlockType.STONE, offset + rock, offset + layers);
			if (first === layers) first = rock;
		}

		// The deepest layer of the crust is the floor of the world, and there is
		// nothing under it. Bedrock there refuses every break, so a column keeps
		// a bottom however far a player digs.
		into[offset + layers - 1] = BlockType.BEDROCK;
		if (first === layers) first = layers - 1;
		return { first, last };
	}

	/**
	 * The cliffs layer's answer for every layer of a column, skipping what it
	 * can.
	 *
	 * **A margin says how far this block is from being the other thing**, and
	 * {@link carveStep} says the most that can move between one block and the
	 * next -- so a margin of `m` settles the next `floor(|m| / step)` blocks
	 * without reading them. The bound is the field's own steepest slope along
	 * the ray a column stands on, so this is not an approximation of the walk
	 * it replaces: it is the same answer for every layer, and the tests hold it
	 * to that.
	 *
	 * Nothing here when the layer is off, or when a fold makes the bound
	 * unsound -- the caller then reads every block, as it always did.
	 */
	private carveRun(column: TerrainColumn, rock: number): Uint8Array | null {
		if (!this.settings.carveLayer) return null;
		const out = this.carveMask.length >= rock ? this.carveMask : null;
		if (!out) return null;
		const step = this.carveStride;
		if (step <= 0) return null;
		const from = Math.max(0, column.groundLayer);
		// Above the ground nothing is asked, and the loop below fills from
		// there; what is over it is air whatever this says.
		out.fill(1, 0, Math.min(rock, from));
		let layer = from;
		while (layer < rock) {
			const margin = carveMargin(
				column.x,
				column.y,
				column.z,
				this.shape.seaLevelRadius,
				column.elevation,
				(layer - column.groundLayer + 1) * this.shape.blockSize,
				this.carveSeed,
				this.settings.carve,
				this.carveNoise,
				this.settings.carveHold,
				undefined,
				undefined,
				this.carveCorners,
			);
			const same = margin > 0 ? 1 : 0;
			// **How far this answer reaches**, and never less than the block it
			// was read for.
			const span = Math.max(1, 1 + Math.floor(Math.abs(margin) / step));
			const to = Math.min(rock, layer + span);
			out.fill(same, layer, to);
			layer = to;
		}
		return out;
	}

	/**
	 * The layer under which every term has run out and the crust is solid.
	 *
	 * Each of the three things that can open a layer states its own reach in
	 * metres, so each is a layer count: the soil's depth, the carve's and the
	 * caves'. Below the deepest of them nothing is evaluated, because nothing
	 * could be anything but stone.
	 */
	private openTo(column: TerrainColumn, layers: number): number {
		const carved = this.settings.carveLayer
			? Math.ceil(carveDepth(this.settings.carve) / this.shape.blockSize)
			: 0;
		const hollowed = this.settings.caves
			? Math.ceil(this.settings.caveDepth / this.shape.blockSize)
			: 0;
		return Math.min(
			layers,
			Math.max(
				0,
				column.groundLayer +
					Math.max(
						Math.ceil(this.settings.soilDepth),
						carved,
						hollowed,
					),
			),
		);
	}

	/**
	 * The topmost layer of a column that holds a block.
	 *
	 * **The height field is where the ground would be, not where it is.** The
	 * carve cuts cliffs and overhangs into the top of a column and the caves
	 * hollow it, both after `groundLayer` is decided -- so anything placed at
	 * that layer can be standing over nothing. This walks down until it finds
	 * the block that is really there, which is `first` in the band
	 * {@link fillColumn} returns and is what the mesher draws the ground at.
	 *
	 * **There is always an answer.** Below {@link openTo} no term is evaluated
	 * and the crust is filled solid, so the walk is bounded by the deepest
	 * reach any of them claims and never by the crust.
	 */
	topSolidLayer(column: TerrainColumn): number {
		const layers = this.shape.crustDepth;
		const rock = this.openTo(column, layers);
		for (let layer = Math.max(0, column.groundLayer); layer < rock; layer++)
			if (this.blockAt(column, layer) !== BlockType.AIR) return layer;
		return Math.min(rock, layers - 1);
	}

	/**
	 * The block at a point in space.
	 *
	 * Position to cell, then a block read. Floating in water is this same
	 * query, and so is a camera deciding whether it is under the surface: water
	 * is a block like any other, so there is no water volume to test against and
	 * no second kind of lookup.
	 */
	blockAtPosition(position: Vec3): BlockType {
		const cell = positionToCell(position, this.shape.n);
		const column = this.columnAt(cell.face, cell.i, cell.j);
		return this.blockAt(
			column,
			this.shape.layerOfRadius(position.length()),
		);
	}

	/** Whether a layer of a column stops a player. */
	isSolidAt(column: TerrainColumn, layer: number): boolean {
		const block = this.blockAt(column, layer);
		return block !== BlockType.AIR && block !== BlockType.WATER;
	}

	/**
	 * Which ground a block is made of, from how far under the surface it sits.
	 *
	 * Soil covers rock to a fixed depth, and three things take the soil away.
	 * The bed under standing water is sand. **Above the rock line the soil is
	 * gone and the stone the ground is made of is what shows** -- through the
	 * whole soil band, not only its top layer, so a hillside that high is rock
	 * where it is cut into as well as where it is walked on. Above the snow
	 * line the top layer is snow, lying on that same rock.
	 *
	 * The two lines are elevations and nothing else is read. **The third rule
	 * this once had was a slope**, and it carried a stored field of `2.5 MB`
	 * for one boolean test -- reading the map cell's gradient rather than the
	 * block's, so its rock came out in patches the size of map cells instead
	 * of as a cliff face. An elevation needs no field: the column already
	 * knows how high it is.
	 *
	 * **A biome table, when there is one, names the surface before any of
	 * that is asked.** The terrain still decides everything under the top
	 * layer, except a biome that named its own underlay -- and the surface is
	 * read once a column, at the surface layer alone, the one place `surface`
	 * is ever true; the underlay reads back what that same call already
	 * found rather than asking the table again.
	 */
	private material(column: TerrainColumn, depthBelow: number): BlockType {
		// **Nothing names this ground, so nothing paints it.** The bands below
		// are a fallback, and a fallback that draws grass, beaches and snow
		// lines is one nobody can tell from a world that was named -- so where
		// the biome model is the only thing allowed to say what the surface is
		// made of, a world without one is bare stone rather than a quieter
		// version of the same picture. Every term that decides *where* the
		// ground is has already run.
		if (this.settings.bareRock) return BlockType.STONE;

		const soil = this.settings.soilDepth * this.shape.blockSize;
		if (depthBelow > soil) return BlockType.STONE;

		// Sand from the bed down through the whole soil band.
		if (column.waterRadius > column.groundRadius) return BlockType.SAND;

		const surface = depthBelow <= this.shape.blockSize;
		if (surface && this.biomes) {
			const block = this.biomes.blockAt(
				column.x,
				column.y,
				column.z,
				this.biomeSample,
			);
			if (block >= 0) return block as BlockType;
		}
		if (surface && column.elevation > this.settings.snowLine)
			return BlockType.SNOW;
		if (column.elevation > this.settings.rockLine) return BlockType.STONE;
		if (!surface) {
			// The surface call above, earlier in this same column, is what
			// left a biome here to read back -- underwater and above the
			// rock line both return before reaching this line, so nothing
			// here asks the table for a biome the surface never found one.
			if (this.biomes && this.biomeSample.biome >= 0) {
				const underlay =
					this.biomes.biomes[this.biomeSample.biome]!.underlay;
				if (underlay !== undefined) return underlay as BlockType;
			}
			return BlockType.DIRT;
		}
		return BlockType.GRASS;
	}
}
