import type { PatchLayout } from "./patchLayout.js";
import { PATCH_STRIDE } from "./PatchGeometry.js";

/** The four fields a patch is drawn from, one value per map cell. */
export interface PatchFields {
	/** The ground in metres above sea level. */
	readonly height: Float32Array;

	/** The field before sea level was taken off it. */
	readonly raw: Float32Array;

	/**
	 * What each layer's curve returned, one field apiece.
	 *
	 * **Three, because the surface is three layers.** A picture of one layer on
	 * its own is how its curve is judged -- dark where that layer says nothing,
	 * bright where it says most -- so each one has to reach a vertex.
	 */
	readonly continent: Float32Array;
	readonly erosion: Float32Array;
	readonly peaks: Float32Array;
}

/** The vertex buffer of a patch, and what the ground in it reached. */
export interface PatchFill {
	readonly vertices: Float32Array<ArrayBuffer>;

	/** The lowest and highest ground in it, in metres above sea level. */
	readonly lowest: number;
	readonly highest: number;

	/** What the field itself reached here, which the Raw picture is drawn against. */
	readonly rawLow: number;
	readonly rawHigh: number;

	/** How much of the patch stands above the water. */
	readonly landShare: number;
}

/**
 * The ground poured into a patch's shape.
 *
 * **A corner is where three cells meet, and it is drawn at the height of all
 * three.** The generator reads the map as a blend of the three samples around
 * a point, so a surface whose corners are that same blend is the ground the
 * world would build; giving each hexagon one flat height would draw a terrace
 * the world does not have. What stays per cell is the **colour**, because the
 * material bands are per cell in the world too.
 *
 * This is the half that answers to the ground, and all of it is a walk down
 * two arrays: which cells meet at a vertex and which cell it takes its numbers
 * from were both settled when the patch was laid out.
 */
export function patchVertices(
	layout: PatchLayout,
	fields: PatchFields,
): PatchFill {
	const { height, raw, continent, erosion, peaks } = fields;
	const count = layout.of.length;
	const vertices = new Float32Array(count * PATCH_STRIDE);

	for (let v = 0; v < count; v++) {
		const cell = layout.of[v]!;
		let sum = 0;
		let met = 0;
		for (let c = 0; c < 3; c++) {
			const other = layout.corners[v * 3 + c]!;
			if (other < 0) continue;
			sum += height[other]!;
			met++;
		}
		const at = v * PATCH_STRIDE;
		vertices[at] = layout.flat[v * 2]!;
		vertices[at + 1] = met > 0 ? sum / met : 0;
		vertices[at + 2] = layout.flat[v * 2 + 1]!;
		vertices[at + 6] = height[cell]!;
		vertices[at + 7] = raw[cell]!;
		vertices[at + 8] = continent[cell]!;
		vertices[at + 9] = erosion[cell]!;
		vertices[at + 10] = peaks[cell]!;
		// A surface patch reads the map and the carve is not in it, so the
		// channel is there and says nothing; and it draws map cells rather than
		// blocks, so there is no block to speckle.
		vertices[at + 11] = 0;
		vertices[at + 12] = 1;
	}

	// A flat normal per triangle would need its own vertices; these are shared
	// round a cell, so the normal is the cell's own plane -- which is the slope
	// of the ground there and is what the light is wanted for.
	//
	// **The cross product is taken the other way round, and that is not a
	// detail.** A cell's rim is wound counter-clockwise as seen from outside
	// the sphere, in east and north; a patch vertex is laid out as
	// `(east, up, north)`, which swaps two axes and so flips the handedness --
	// so `cross(b - a, c - a)` comes out pointing into the ground. Measured on
	// the shipped world, every land vertex had a normal 160 degrees or more
	// from vertical, which put `dot(normal, sun)` at zero over the whole
	// surface: the sun contributed nothing anywhere, the ambient term was the
	// entire picture, and the preview had no shape in it at all.
	const tris = layout.indices;
	for (let t = 0; t < tris.length; t += 3) {
		const a = tris[t]! * PATCH_STRIDE;
		const b = tris[t + 1]! * PATCH_STRIDE;
		const c = tris[t + 2]! * PATCH_STRIDE;
		const ux = vertices[b]! - vertices[a]!;
		const uy = vertices[b + 1]! - vertices[a + 1]!;
		const uz = vertices[b + 2]! - vertices[a + 2]!;
		const vx = vertices[c]! - vertices[a]!;
		const vy = vertices[c + 1]! - vertices[a + 1]!;
		const vz = vertices[c + 2]! - vertices[a + 2]!;
		const nx = vy * uz - vz * uy;
		const ny = vz * ux - vx * uz;
		const nz = vx * uy - vy * ux;
		for (const at of [a, b, c]) {
			vertices[at + 3] = vertices[at + 3]! + nx;
			vertices[at + 4] = vertices[at + 4]! + ny;
			vertices[at + 5] = vertices[at + 5]! + nz;
		}
	}
	for (let v = 0; v < vertices.length; v += PATCH_STRIDE) {
		const x = vertices[v + 3]!;
		const y = vertices[v + 4]!;
		const z = vertices[v + 5]!;
		const length = Math.sqrt(x * x + y * y + z * z) || 1;
		vertices[v + 3] = x / length;
		vertices[v + 4] = y / length;
		vertices[v + 5] = z / length;
	}

	// What the ground reached is a fact about the cells, not about the vertices
	// drawn for them: a pentagon puts down six where a hexagon puts down seven,
	// and counting vertices would weigh the twelve of them differently.
	let lowest = Infinity;
	let highest = -Infinity;
	let rawLow = Infinity;
	let rawHigh = -Infinity;
	let land = 0;
	for (const cell of layout.cells) {
		const metres = height[cell]!;
		const unitless = raw[cell]!;
		if (metres < lowest) lowest = metres;
		if (metres > highest) highest = metres;
		if (unitless < rawLow) rawLow = unitless;
		if (unitless > rawHigh) rawHigh = unitless;
		if (metres > 0) land++;
	}
	const held = layout.cellCount;
	return {
		vertices,
		lowest: held ? lowest : 0,
		highest: held ? highest : 0,
		rawLow: held ? rawLow : 0,
		rawHigh: held ? rawHigh : 0,
		landShare: held ? land / held : 0,
	};
}
