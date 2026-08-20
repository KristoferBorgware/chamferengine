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
		// One layer past the rounded-up count, never exactly it. A surface
		// fills only layers whose top face is at or below it, so ground lying
		// inside the bottom layer's span fills the layer below the floor --
		// which must exist, or the column writes nothing at all. The base
		// level is guaranteed a floor below the deepest ground when the world
		// is settled; here the margin needed is one coarse block, 256 m at
		// eight levels out, and rounding up supplies at most a block minus a
		// metre of it. Without this layer, whole deep-ocean chunks at the
		// coarse levels held nothing and the far field of a large world was
		// drawn with face-sized holes in it.
		return new WorldShape(
			this.seaLevelRadius,
			this.subdivisionDepth - lod,
			this.maxElevation,
			Math.ceil(this.crustDepth / 2 ** lod) + 1,
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

	/**
	 * The first layer a surface topping at `radius` fills.
	 *
	 * Not {@link layerOfRadius}: that assigns a radius to the layer it falls
	 * inside, which puts a surface landing exactly on a layer boundary into
	 * the layer above the one it tops -- a whole block of air where the ground
	 * should end. A surface fills every layer whose top face is at or below
	 * it, so the exact hit belongs to the layer under the boundary. Noise
	 * terrain lands on a boundary almost never; a sphere with no relief lands
	 * on one at every column, which is how a whole planet's walkable surface
	 * once came to sit one block below the radius the generator named.
	 *
	 * The boundary is recognised within a billionth of a layer, because the
	 * arithmetic rebuilding one -- a subtraction against the crust top and a
	 * division by the block size -- does not always land on it to the last
	 * bit, and a surface a last-bit over a boundary must not skip a layer.
	 */
	layerOfSurface(radius: number): number {
		return Math.ceil(
			(this.crustTopRadius - radius) / this.blockSize - 1e-9,
		);
	}

	/** The layer holding sea level. */
	get seaLevelLayer(): number {
		return this.layerOfRadius(this.seaLevelRadius);
	}

	/**
	 * The radius the sea's own surface is drawn at, and stood in.
	 *
	 * **Sea level snapped onto the layer grid the ground already lands on.**
	 * `seaLevelRadius` is where the terrain measures its elevations from and
	 * is a continuous number; ground is built out of whole layers, so a
	 * surface at exactly sea level is drawn at the boundary at or under it.
	 * Left unsnapped, the two disagree by up to a block and every coast at
	 * sea level stands in water it is not supposed to be in -- a flat world
	 * measured 2 m under its own sea. Snapping the water the same way puts
	 * ground at sea level exactly on the waterline.
	 */
	get seaSurfaceRadius(): number {
		return this.radiusOfLayer(this.layerOfSurface(this.seaLevelRadius));
	}
}
