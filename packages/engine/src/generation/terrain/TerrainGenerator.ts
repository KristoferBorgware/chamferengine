import type { CoarseMap } from "../coarse/CoarseMap.js";
import type { ColumnBand } from "./ColumnBand.js";
import type { TerrainColumn } from "./TerrainColumn.js";
import type { TerrainOptions } from "./TerrainOptions.js";
import type { NoiseSettings } from "../noise/NoiseSettings.js";
import type { Vec3 } from "../../math/Vec3.js";
import type { WorldShape } from "../../world/WorldShape.js";
import { BlockType } from "./BlockType.js";
import { TERRAIN_DEFAULTS } from "./TerrainOptions.js";
import { carveDepth, carveIsRock, carveSeed } from "./carveDensity.js";
import { caveCeilingAt } from "./caveCeilingAt.js";
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
	private readonly carveSeed: number;

	constructor(
		seed: number,
		shape: WorldShape,
		map: CoarseMap,
		options: TerrainOptions = {},
	) {
		this.seed = seed;
		this.shape = shape;
		this.map = map;
		this.settings = { ...TERRAIN_DEFAULTS, ...options };
		// The planet's own radius, which is what makes the layer's width a
		// number in metres rather than a count of features round a sphere.
		this.carveNoise = layerNoiseSettings(
			this.settings.carve,
			shape.seaLevelRadius,
		);
		this.carveSeed = carveSeed(seed);
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
	blockAt(column: TerrainColumn, layer: number): BlockType {
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
			!carveIsRock(
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
		const carved = this.settings.carveLayer
			? Math.ceil(carveDepth(this.settings.carve) / this.shape.blockSize)
			: 0;
		const hollowed = this.settings.caves
			? Math.ceil(this.settings.caveDepth / this.shape.blockSize)
			: 0;
		const rock = Math.min(
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

		let first = layers;
		let last = -1;
		for (let layer = 0; layer < rock; layer++) {
			const block = this.blockAt(column, layer);
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
	 */
	private material(column: TerrainColumn, depthBelow: number): BlockType {
		const soil = this.settings.soilDepth * this.shape.blockSize;
		if (depthBelow > soil) return BlockType.STONE;

		// Sand from the bed down through the whole soil band.
		if (column.waterRadius > column.groundRadius) return BlockType.SAND;

		const surface = depthBelow <= this.shape.blockSize;
		if (surface && column.elevation > this.settings.snowLine)
			return BlockType.SNOW;
		if (column.elevation > this.settings.rockLine) return BlockType.STONE;
		if (!surface) return BlockType.DIRT;
		return BlockType.GRASS;
	}
}
