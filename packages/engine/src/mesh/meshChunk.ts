import type { Chunk } from "../generation/chunk/Chunk.js";
import type { Column } from "../generation/chunk/Column.js";
import type { ColumnSampler } from "../generation/chunk/ColumnSampler.js";
import type { MeshOptions } from "./MeshOptions.js";
import type { MeshSink } from "./MeshSink.js";
import type { Vec3 } from "../math/Vec3.js";
import type { WorldShape } from "../world/WorldShape.js";
import { AMBIENT_OCCLUSION, FACE_SHADE } from "./AMBIENT_OCCLUSION.js";
import { MESH_DEFAULTS } from "./MeshOptions.js";
import { blockColor } from "../generation/terrain/blockColor.js";
import { canonicalCell } from "../addressing/neighbours/canonicalCell.js";
import { cellCorners } from "../addressing/lattice/cellCorners.js";
import { joinPath } from "../addressing/lattice/joinPath.js";
import { latticeWeights } from "../addressing/lattice/latticeWeights.js";
import { neighbour } from "../addressing/neighbours/neighbour.js";
import { opacityOf } from "./opacityOf.js";
import { splitPath } from "../addressing/lattice/splitPath.js";

/** What one chunk's mesh cost, for a caller that wants to report it. */
export interface MeshTally {
	/** Cells the chunk owns and drew. */
	cells: number;

	/** Faces emitted, counting a merged run of side faces as one. */
	faces: number;

	/** Side faces the run-length merge collapsed away. */
	merged: number;
}

/** Scratch color, refilled per face rather than allocated per vertex. */
const COLOR = new Float32Array(3);

/** A column's block at a layer, air outside the crust. */
function at(column: Column, layer: number): number {
	const blocks = column.blocks;
	return layer < 0 || layer >= blocks.length ? 0 : blocks[layer]!;
}

/**
 * Turn one chunk into triangles.
 *
 * A face is emitted where a cell is more opaque than what is next to it, across
 * all six sides plus up and down. Opaque and translucent geometry go to
 * separate sinks, because they are drawn in separate passes.
 *
 * Positions are written relative to `origin` so they stay inside `float32`'s
 * useful range whatever the planet's radius. Nothing here mentions a device, a
 * buffer or a renderer.
 */
export function meshChunk(
	chunk: Chunk,
	sampler: ColumnSampler,
	shape: WorldShape,
	seed: number,
	origin: Vec3,
	opaque: MeshSink,
	translucent: MeshSink,
	options: MeshOptions = {},
): MeshTally {
	const settings = { ...MESH_DEFAULTS, ...options };
	const depth = chunk.depth;
	const n = 1 << depth;
	const face = chunk.address.face;
	const layers = chunk.layerCount;
	const tally: MeshTally = { cells: 0, faces: 0, merged: 0 };

	const ring: (Column | null)[] = new Array<Column | null>(6);

	for (let q = 0; q <= chunk.m; q++)
		for (let r = 0; q + r <= chunk.m; r++) {
			const [i, j] = joinPath(chunk.address.path, q, r, depth);
			if (!owns(chunk, face, n, i, j)) continue;
			tally.cells++;

			const corners = cellCorners(face, n, i, j);
			const degree = corners.length;
			const own = sampler.columnAt(face, i, j);
			for (let k = 0; k < 6; k++) {
				const nb = k < degree ? neighbour(face, n, i, j, k) : null;
				ring[k] = nb ? sampler.columnAt(nb.face, nb.i, nb.j) : null;
			}

			meshCell(
				chunk,
				shape,
				seed,
				origin,
				face,
				i,
				j,
				corners,
				degree,
				own,
				ring,
				layers,
				opaque,
				translucent,
				tally,
				settings.crustFloor,
			);
		}
	return tally;
}

/**
 * Whether this chunk draws a cell.
 *
 * A lattice point on a chunk edge sits in two chunk triangles and a point on a
 * face edge is named by two faces, so without a rule the same cell is drawn
 * twice and the two copies fight over the depth buffer. `splitPath` already
 * picks one triangle for a point and `canonicalCell` picks one face, and
 * agreeing to use both is the whole rule.
 */
function owns(
	chunk: Chunk,
	face: number,
	n: number,
	i: number,
	j: number,
): boolean {
	const w = latticeWeights(n, i, j);
	if (w[0] === 0 || w[1] === 0 || w[2] === 0)
		if (canonicalCell(face, n, i, j).face !== face) return false;

	const split = splitPath(i, j, chunk.depth, chunk.chunkLevel);
	for (let level = 0; level < split.path.length; level++)
		if (split.path[level] !== chunk.address.path[level]) return false;
	return true;
}

/** Emit every exposed face of one cell's column. */
function meshCell(
	chunk: Chunk,
	shape: WorldShape,
	seed: number,
	origin: Vec3,
	face: number,
	i: number,
	j: number,
	corners: readonly Vec3[],
	degree: number,
	own: Column,
	ring: readonly (Column | null)[],
	layers: number,
	opaque: MeshSink,
	translucent: MeshSink,
	tally: MeshTally,
	crustFloor: boolean,
): void {
	// The band anything can happen in: from the highest layer that is not air
	// in the cell or any neighbour, to the lowest that is not solid in any of
	// them. Outside it every cell is air, or every cell is solid, and neither
	// produces a face. On this terrain that is a handful of layers on land
	// against the 435 the crust runs to.
	let bandTop = own.first;
	let bandBottom = own.last;
	for (let k = 0; k < degree; k++) {
		const other = ring[k];
		if (!other) continue;
		if (other.first < bandTop) bandTop = other.first;
		if (other.last > bandBottom) bandBottom = other.last;
	}
	const from = Math.max(0, bandTop - 1);
	const to = Math.min(layers - 1, bandBottom + 1);

	// Caps first: a top or a bottom face covers one layer and never merges with
	// the layer under it, because there is a different block there.
	for (let layer = from; layer <= to; layer++) {
		const block = at(own, layer);
		const here = opacityOf(block);
		if (here === 0) continue;
		const sink = here === 1 ? translucent : opaque;
		blockColor(block, face, i, j, seed, COLOR, 0);

		if (opacityOf(at(own, layer - 1)) < here) {
			emitCap(
				sink,
				corners,
				degree,
				shape.radiusOfLayer(layer),
				origin,
				FACE_SHADE.top,
				true,
				(corner) =>
					occlusion(ring, degree, corner, corner + 1, layer - 1),
			);
			tally.faces++;
		}
		const below = layer + 1 >= layers ? 0 : opacityOf(at(own, layer + 1));
		if (below < here) {
			emitCap(
				sink,
				corners,
				degree,
				shape.radiusOfLayer(layer + 1),
				origin,
				FACE_SHADE.bottom,
				false,
				() => 0,
			);
			tally.faces++;
		}
	}

	// The floor of the crust is below the band by construction: nothing under it
	// is air, so the band never reaches it.
	const floor = layers - 1;
	if (crustFloor && floor > to) {
		const block = at(own, floor);
		if (opacityOf(block) > 0) {
			blockColor(block, face, i, j, seed, COLOR, 0);
			emitCap(
				opacityOf(block) === 1 ? translucent : opaque,
				corners,
				degree,
				shape.radiusOfLayer(floor + 1),
				origin,
				FACE_SHADE.bottom,
				false,
				() => 0,
			);
			tally.faces++;
		}
	}

	// Sides, as runs. A column is straight -- the tessellation is identical at
	// every layer -- so a stretch of layers with the same block and the same
	// neighbour exposed is one quad however tall it is.
	for (let k = 0; k < degree; k++) {
		const other = ring[k];
		if (!other) continue;
		let layer = from;
		while (layer <= to) {
			const block = at(own, layer);
			const here = opacityOf(block);
			if (here === 0 || opacityOf(at(other, layer)) >= here) {
				layer++;
				continue;
			}
			let end = layer;
			while (
				end + 1 <= to &&
				at(own, end + 1) === block &&
				opacityOf(at(other, end + 1)) < here
			)
				end++;

			blockColor(block, face, i, j, seed, COLOR, 0);
			emitSide(
				here === 1 ? translucent : opaque,
				corners,
				degree,
				k,
				shape.radiusOfLayer(layer),
				shape.radiusOfLayer(end + 1),
				origin,
				ring,
				layer,
				end,
			);
			tally.faces++;
			tally.merged += end - layer;
			layer = end + 1;
		}
	}
	void chunk;
}

/**
 * A cell's polygon at one radius, as a fan from its first corner.
 *
 * Five or six corners, three or four triangles. Reversing the order for a
 * downward face is not decoration: listing a downward polygon by the same rule
 * as an upward one winds it inward, and the face is then invisible from the one
 * side anybody looks at it from.
 */
function emitCap(
	sink: MeshSink,
	corners: readonly Vec3[],
	degree: number,
	radius: number,
	origin: Vec3,
	shade: number,
	upward: boolean,
	occlude: (corner: number) => number,
): void {
	const first: number[] = new Array<number>(degree);
	for (let c = 0; c < degree; c++) {
		const at = upward ? c : degree - 1 - c;
		const p = corners[at]!;
		const light = shade * AMBIENT_OCCLUSION[occlude(at)]!;
		first[c] = sink.vertex(
			p.x * radius - origin.x,
			p.y * radius - origin.y,
			p.z * radius - origin.z,
			COLOR[0]! * light,
			COLOR[1]! * light,
			COLOR[2]! * light,
		);
	}
	for (let c = 1; c + 1 < degree; c++)
		sink.triangle(first[0]!, first[c]!, first[c + 1]!);
}

/**
 * The wall between a cell and one of its neighbours, over a run of layers.
 *
 * The edge shared with neighbour `k` runs between the two corners that both
 * touch it, `k - 1` and `k`, because corner `k` is where the cell meets
 * neighbours `k` and `k + 1`.
 */
function emitSide(
	sink: MeshSink,
	corners: readonly Vec3[],
	degree: number,
	k: number,
	topRadius: number,
	bottomRadius: number,
	origin: Vec3,
	ring: readonly (Column | null)[],
	topLayer: number,
	bottomLayer: number,
): void {
	const left = corners[(k + degree - 1) % degree]!;
	const right = corners[k]!;

	// Two occluders per vertex, as everywhere else: the cell beyond the wall at
	// the layer above or below, and the cell round the corner at this layer.
	const beyond = ring[k]!;
	const leftSide = ring[(k + degree - 1) % degree];
	const rightSide = ring[(k + 1) % degree];
	const above = opacityOf(at(beyond, topLayer - 1)) === 2 ? 1 : 0;
	const under = opacityOf(at(beyond, bottomLayer + 1)) === 2 ? 1 : 0;
	const byLeft = leftSide && opacityOf(at(leftSide, topLayer)) === 2 ? 1 : 0;
	const byRight =
		rightSide && opacityOf(at(rightSide, topLayer)) === 2 ? 1 : 0;

	const put = (p: Vec3, radius: number, occ: number) => {
		const light = FACE_SHADE.side * AMBIENT_OCCLUSION[occ]!;
		return sink.vertex(
			p.x * radius - origin.x,
			p.y * radius - origin.y,
			p.z * radius - origin.z,
			COLOR[0]! * light,
			COLOR[1]! * light,
			COLOR[2]! * light,
		);
	};

	const topLeft = put(left, topRadius, above + byLeft);
	const topRight = put(right, topRadius, above + byRight);
	const bottomRight = put(right, bottomRadius, under + byRight);
	const bottomLeft = put(left, bottomRadius, under + byLeft);

	sink.triangle(topLeft, bottomLeft, bottomRight);
	sink.triangle(topLeft, bottomRight, topRight);
}

/** How many of the two cells touching a corner are solid at a layer. */
function occlusion(
	ring: readonly (Column | null)[],
	degree: number,
	a: number,
	b: number,
	layer: number,
): number {
	const first = ring[a % degree];
	const second = ring[b % degree];
	let count = 0;
	if (first && opacityOf(at(first, layer)) === 2) count++;
	if (second && opacityOf(at(second, layer)) === 2) count++;
	return count;
}
