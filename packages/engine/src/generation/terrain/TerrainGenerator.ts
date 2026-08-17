import type { CoarseMap } from "../coarse/CoarseMap.js";
import type { ColumnBand } from "./ColumnBand.js";
import type { TerrainColumn } from "./TerrainColumn.js";
import type { TerrainOptions } from "./TerrainOptions.js";
import type { Vec3 } from "../../math/Vec3.js";
import type { WorldShape } from "../../world/WorldShape.js";
import { BlockType } from "./BlockType.js";
import { TERRAIN_DEFAULTS } from "./TerrainOptions.js";
import { caveDensity } from "./caveDensity.js";
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
	private readonly detailSeed: number;

	/** Metres of ground fall per metre travelled, per unit of coarse slope. */
	private readonly gradientScale: number;

	/** Square metres one coarse cell covers, on average. */
	private readonly coarseCellArea: number;

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
		this.detailSeed = (seed + DETAIL_SEED_OFFSET) | 0;

		// The coarse map's slope is a height difference between neighbouring
		// coarse cells. Metres of fall over metres of ground turns it into the
		// gradient the material rules are written against.
		const coarseSpacing =
			shape.blockSize * 2 ** (shape.subdivisionDepth - map.level);
		this.gradientScale = this.settings.heightScale / coarseSpacing;

		// The map counts cells draining through a cell, and a cell is four times
		// smaller at each finer level, so the count for one physical catchment
		// moves by four while the catchment does not. Multiplying by the area a
		// cell covers gives a number that means the same at every resolution:
		// the wettest place on the worked planet drains 5.1 square kilometres
		// whether the map is drawn at 64 m, 32 m or 16 m.
		this.coarseCellArea =
			(4 * Math.PI * shape.seaLevelRadius * shape.seaLevelRadius) /
			map.count;
	}

	/** Evaluate one column of the world. */
	columnAt(face: number, i: number, j: number): TerrainColumn {
		const depth = this.shape.subdivisionDepth;
		const p = latticePosition(face, this.shape.n, i, j);

		const detail =
			this.settings.detailAmplitude *
			fbm(
				p.x,
				p.y,
				p.z,
				this.settings.detailFrequency,
				this.settings.detailOctaves,
				this.detailSeed,
			);

		const coarseGround = this.map.heightAt(face, i, j, depth);
		const coarseWater = this.map.waterAt(face, i, j, depth);
		const scale = this.settings.heightScale;

		const elevation = (coarseGround - this.map.seaLevel) * scale + detail;
		const groundRadius = this.shape.seaLevelRadius + elevation;

		// Whether there is water here is the coarse map's answer, and the coarse
		// map has no fine detail in it. Comparing the two surfaces after the
		// detail is added instead would put a film of water over every dry cell
		// the detail happened to push downward, which is half of the land.
		//
		// Where the coarse map does say water, the surface is its level, and
		// never below the detailed ground.
		const coarseGroundRadius =
			this.shape.seaLevelRadius +
			(coarseGround - this.map.seaLevel) * scale;
		const coarseWaterRadius =
			this.shape.seaLevelRadius +
			(coarseWater - this.map.seaLevel) * scale;
		const waterRadius =
			coarseWaterRadius > coarseGroundRadius
				? Math.max(groundRadius, coarseWaterRadius)
				: groundRadius;

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
			gradient: this.map.slopeAt(face, i, j, depth) * this.gradientScale,
			catchment: this.map.flowAt(face, i, j, depth) * this.coarseCellArea,
		};
	}

	/** What block sits at one layer of a column. */
	blockAt(column: TerrainColumn, layer: number): BlockType {
		if (layer < 0 || layer >= this.shape.crustDepth) return BlockType.AIR;

		if (layer < column.groundLayer)
			return layer < column.waterLayer ? BlockType.AIR : BlockType.WATER;

		const depthBelow =
			(layer - column.groundLayer + 1) * this.shape.blockSize;

		if (this.settings.caves) {
			const radius = this.shape.radiusOfLayer(layer);
			const hollow = caveDensity(
				column.x,
				column.y,
				column.z,
				radius,
				depthBelow,
				this.seed,
				this.settings.caveScale,
				this.settings.caveThreshold,
				this.settings.caveCeiling,
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
	 * The density term takes that away, because a passage can open at any depth.
	 * With caves on every layer is evaluated.
	 */
	fillColumn(
		column: TerrainColumn,
		into: Uint16Array,
		offset: number,
		layers: number,
	): ColumnBand {
		const rock = this.settings.caves
			? layers
			: Math.min(
					layers,
					Math.max(
						0,
						column.groundLayer + Math.ceil(this.settings.soilDepth),
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
	 * Soil covers rock to a fixed depth, and three things replace the soil: the
	 * bed under standing water is sand, ground steeper than a cliff gradient is
	 * bare rock because soil does not hold on it, and ground above the snow line
	 * is snow.
	 */
	private material(column: TerrainColumn, depthBelow: number): BlockType {
		const soil = this.settings.soilDepth * this.shape.blockSize;
		if (depthBelow > soil) return BlockType.STONE;

		const submerged = column.waterRadius > column.groundRadius;
		const surface = depthBelow <= this.shape.blockSize;
		if (!surface) return submerged ? BlockType.SAND : BlockType.DIRT;

		if (submerged) return BlockType.SAND;
		if (column.gradient > this.settings.cliffGradient)
			return BlockType.STONE;
		if (column.elevation > this.settings.snowLine) return BlockType.SNOW;
		return BlockType.GRASS;
	}
}
