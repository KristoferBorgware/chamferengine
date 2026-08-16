import { CELL_CONSTANT } from "./CELL_CONSTANT.js";

/**
 * A planet's size: where sea level is, how fine the grid is, and how deep the
 * crust runs.
 *
 * Block size follows from the radius and the subdivision depth rather than
 * being chosen, and it is fixed when the world is created. The radius absorbs
 * the rounding.
 *
 * Layers are a radial grid over the whole planet, counting downward from a
 * fixed crust top. That makes a layer a global index rather than a depth below
 * the local terrain, so two columns at the same layer are at the same radius
 * and a column runs straight down.
 */
export class WorldShape {
	/** The radius the ocean surface stands at. */
	readonly seaLevelRadius: number;

	readonly subdivisionDepth: number;

	/** Centre-to-centre spacing of a nominal cell, and the height of a layer. */
	readonly blockSize: number;

	/** The radius of layer 0, above the highest ground the generator produces. */
	readonly crustTopRadius: number;

	readonly crustDepth: number;

	/** How far above sea level layer 0 sits. */
	readonly maxElevation: number;

	constructor(
		seaLevelRadius: number,
		subdivisionDepth: number,
		maxElevation: number,
		crustDepth: number,
	) {
		this.seaLevelRadius = seaLevelRadius;
		this.subdivisionDepth = subdivisionDepth;
		this.blockSize =
			(CELL_CONSTANT * seaLevelRadius) / 2 ** subdivisionDepth;
		this.crustTopRadius = seaLevelRadius + maxElevation;
		this.crustDepth = crustDepth;
		this.maxElevation = maxElevation;
	}

	/**
	 * The same planet sampled `lod` levels coarser.
	 *
	 * Cells double in width each level and so do layers, and the crust keeps the
	 * same reach with half as many of them. The crust top does not move, so
	 * `radiusOfLayer` at one level lands on radii the finer level also has:
	 * layer `L` here is layer `L * 2^lod` there. Two chunks at different levels
	 * therefore agree about where every layer boundary is, and a seam between
	 * them can only open horizontally.
	 */
	atLod(lod: number): WorldShape {
		if (lod === 0) return this;
		return new WorldShape(
			this.seaLevelRadius,
			this.subdivisionDepth - lod,
			this.maxElevation,
			Math.ceil(this.crustDepth / 2 ** lod),
		);
	}

	/** Cells along one face edge. */
	get n(): number {
		return 1 << this.subdivisionDepth;
	}

	/** How many cells cover the surface. */
	get cellCount(): number {
		return 10 * 4 ** this.subdivisionDepth + 2;
	}

	/** The radius at the top of a layer. */
	radiusOfLayer(layer: number): number {
		return this.crustTopRadius - layer * this.blockSize;
	}

	/** Which layer a radius falls in. Negative above the crust top. */
	layerOfRadius(radius: number): number {
		return Math.floor((this.crustTopRadius - radius) / this.blockSize);
	}

	/** The layer holding sea level. */
	get seaLevelLayer(): number {
		return this.layerOfRadius(this.seaLevelRadius);
	}
}
