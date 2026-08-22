import type { CoarseGrid } from "./CoarseGrid.js";
import type { CoarseMapOptions } from "./CoarseMapOptions.js";
import type { NoiseSettings } from "../noise/NoiseSettings.js";
import type { TerrainLayer } from "./TerrainLayer.js";
import { COARSE_MAP_DEFAULTS } from "./CoarseMapOptions.js";
import { LAYER_LACUNARITY, LAYER_PERSISTENCE } from "./TerrainLayer.js";
import { CELL_CONSTANT } from "../../world/CELL_CONSTANT.js";
import { octaveNoise } from "../noise/octaveNoise.js";
import { splineAt } from "./splineAt.js";

/**
 * Offsets from the world seed, so the two layers are two fields.
 *
 * Exported so a caller can sample a layer's own field independently of a
 * whole map build -- the panel's curve rows do, to draw the histogram of
 * where the world actually lands on a curve.
 */
export const TERRAIN_SEED_OFFSET = 101;
export const MOUNTAIN_SEED_OFFSET = 211;

/** What one build of the surface hands to the metre step. */
export interface LayeredField {
	/** The unitless field, in roughly `[-1, 1]`, one entry per grid cell. */
	readonly raw: Float64Array;

	/**
	 * What each layer's curve returned at each cell, `0` to `1`.
	 *
	 * The sum says what the ground is and hides which layer said it. A picture
	 * of one layer on its own is how a curve is judged -- dark where that layer
	 * says nothing, bright where it says most -- and these are what it draws.
	 * `float32` because they are looked at rather than computed with.
	 */
	readonly terrain: Float32Array;
	readonly mountain: Float32Array;
}

/**
 * The planet's radius, from the two numbers that describe its map.
 *
 * A map cell is `CELL_CONSTANT * radius / 2^level` metres across, so a map
 * stated in metres at a level already says how big the planet is. That is what
 * lets a layer be set in metres: the frequency the noise takes is this divided
 * by the layer's own width.
 */
export function radiusOf(cellMetres: number, level: number): number {
	return (cellMetres * 2 ** level) / CELL_CONSTANT;
}

/**
 * The octave-stack settings for one layer, read off its own knobs.
 *
 * Exported alongside the seed offsets above, for the same reason: a caller
 * sampling one layer on its own needs to build exactly what this file passes
 * to `octaveNoise` internally, not a hand-copied approximation of it.
 */
export function layerNoiseSettings(
	layer: TerrainLayer,
	radius: number,
): NoiseSettings {
	return {
		// A frequency counts how many times the widest octave repeats around
		// the planet, and the layer is set as how wide that octave is.
		frequency: radius / Math.max(1, layer.metres),
		octaves: layer.octaves,
		persistence: LAYER_PERSISTENCE,
		lacunarity: LAYER_LACUNARITY,
		// **There is no offset.** Sliding a field sideways names a different
		// world, and the seed already does that -- with every octave moved
		// rather than the stack as a whole.
		offsetX: 0,
		offsetY: 0,
		// The stack is always the plain octave stack. What the fold used to do
		// -- crease a whole world at once -- is what the second layer replaces.
		ridge: 0,
	};
}

/**
 * The surface as two noise layers and two curves, sampled from each cell's own
 * direction in 3D.
 *
 * Sampled in 3D world space and never from a face's own `(i, j)`, which is
 * what makes the thirty face edges invisible: a cell on an edge has two names
 * and one direction, so both names give it the same height.
 *
 * **A single octave stack makes one kind of landscape.** fBm is homogeneous --
 * every octave applies everywhere at one amplitude, so one statistic describes
 * the whole planet and nothing in it can say *be different here*. Measured as
 * the spread of local roughness, calmest tenth against roughest tenth, one
 * stack gives `1.3x`. What draws a region is a second field, slower than the
 * ground, read through a curve.
 *
 * **Terrain and continents are one layer**, because they are one question at
 * two sizes: this layer's widest octaves are where the land is and its
 * narrowest are what the ground does underfoot. Its curve decides the coast.
 *
 * **The mountain layer reaches the ground one of two ways.**
 *
 * `gated` lets it through in proportion to how far the terrain already stands
 * above `mountainLine` -- nothing at or below it, all of it at the top of the
 * terrain curve's own range -- so a range can only grow where the ground was
 * already high. The terrain layer draws the land and says where it may become
 * mountain; the mountain layer says what the mountain looks like. The line is a
 * fraction of the terrain curve's **own** reach rather than a height on a fixed
 * axis, so dragging that curve's top down does not slowly close the gate. The
 * edge is smoothed, because a hard cut draws a contour line across every
 * hillside at exactly the same height.
 *
 * `roughen` keeps it a per-place multiplier on the terrain layer's own noise:
 * a range is rougher ground rather than taller ground, and because the bumps
 * and the base come out of one field they line up instead of crossing.
 *
 * An ungated third rule was tried and removed. Nothing told it where it was, so
 * a range could start in the sea.
 *
 * The result carries no unit. The metre scale downstream puts sea level at the
 * percentile that leaves the asked-for land above it and scales what is left
 * into metres.
 */
export function layeredHeight(
	grid: CoarseGrid,
	seed: number,
	options: CoarseMapOptions = {},
): LayeredField {
	const s = { ...COARSE_MAP_DEFAULTS, ...options };
	const radius = radiusOf(s.cellMetres, s.level);
	const terrain = layerNoiseSettings(s.terrain, radius);
	const mountain = layerNoiseSettings(s.mountain, radius);
	const terrainSeed = (seed + TERRAIN_SEED_OFFSET) | 0;
	const mountainSeed = (seed + MOUNTAIN_SEED_OFFSET) | 0;

	// Where the terrain curve reaches, so the gate is stated against the curve
	// rather than against an axis the curve may not touch.
	let curveLow = Infinity;
	let curveHigh = -Infinity;
	for (const [, out] of s.terrain.curve) {
		if (out < curveLow) curveLow = out;
		if (out > curveHigh) curveHigh = out;
	}
	const lineHeight = curveLow + s.mountainLine * (curveHigh - curveLow);
	const gateSpan = Math.max(1e-6, curveHigh - lineHeight);

	const raw = new Float64Array(grid.count);
	const terrainOf = new Float32Array(grid.count);
	const mountainOf = new Float32Array(grid.count);
	const gated = s.merge === "gated";
	for (let cell = 0; cell < grid.count; cell++) {
		const x = grid.directions[cell * 3]!;
		const y = grid.directions[cell * 3 + 1]!;
		const z = grid.directions[cell * 3 + 2]!;
		const terrainRaw = octaveNoise(x, y, z, terrainSeed, terrain);
		const shaped = splineAt(s.terrain.curve, terrainRaw);
		terrainOf[cell] = shaped;
		let mount = 1;
		if (s.mountainLayer) {
			mount = splineAt(
				s.mountain.curve,
				octaveNoise(x, y, z, mountainSeed, mountain),
			);
			mountainOf[cell] = mount;
		} else if (gated) {
			// A layer switched off means the value that removes it: no height
			// under `gated`, full roughness everywhere under `roughen`.
			mount = 0;
		}
		let term;
		if (gated) {
			const over = Math.max(
				0,
				Math.min(1, (shaped - lineHeight) / gateSpan),
			);
			term = mount * (over * over * (3 - 2 * over)) * s.detail;
		} else {
			term = terrainRaw * mount * s.detail;
		}
		raw[cell] = shaped * 2 - 1 + term;
	}
	return { raw, terrain: terrainOf, mountain: mountainOf };
}
