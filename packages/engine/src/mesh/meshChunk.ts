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
import { skyExposure } from "../light/skyExposure.js";
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

	/** Cells drawn beyond the rim, closing the tiling gap at a level join. */
	apron: number;
}

/** Scratch color, refilled per face rather than allocated per vertex. */
const COLOR = new Float32Array(3);

/**
 * How many layers of neighbouring ground it takes to shut the sky out.
 *
 * A cell with ground this much higher on every side takes the least light the
 * exposure allows.
 */
const SKY_REACH = 6;

/**
 * How far below its true radius an apron cell is drawn, in metres.
 *
 * An apron duplicates a cell its neighbour may be drawing as its own, and two
 * copies of one polygon written against two different chunk origins land on
 * two different `float32` roundings — a sparkle of depth fighting along every
 * boundary. A centimetre puts the apron cleanly underneath wherever a real
 * cell exists, and a centimetre down is invisible where one does not.
 */
const APRON_DROP = 0.01;

/**
 * Where a chunk's surfaces sit once snapped to the shared fine grid.
 *
 * The rounding is {@link WorldShape.layerOfSurface}'s, on the grid the caller
 * asked for rather than the chunk's own: the layer boundaries hang from the
 * crust top, which every level shares, so two levels snapping one radius get
 * one answer.
 */
function snappedSurface(
	crustTopRadius: number,
	radius: number,
	grid: number,
): number {
	return (
		crustTopRadius -
		Math.ceil((crustTopRadius - radius) / grid - 1e-9) * grid
	);
}

/**
 * Where a skirt stops: its fixed depth, or the seam floor, whichever is lower.
 *
 * The floor is where a neighbouring level might put its own surface beside
 * this column, snapped to the shared grid and taken one step further so the
 * wall meets that surface rather than ending flush with it.
 */
function skirtBottom(
	shape: WorldShape,
	grid: number,
	top: number,
	skirtCells: number,
	floor: number,
): number {
	const fixed = shape.radiusOfLayer(top + skirtCells);
	if (!Number.isFinite(floor)) return fixed;
	return Math.min(
		fixed,
		snappedSurface(shape.crustTopRadius, floor, grid) - grid,
	);
}

/** Multiply a color in place. */
function shade(color: Float32Array, by: number): void {
	color[0] = color[0]! * by;
	color[1] = color[1]! * by;
	color[2] = color[2]! * by;
}

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
	const grid = settings.surfaceGrid || shape.blockSize;
	const floorAt = settings.seamFloor;
	const tally: MeshTally = { cells: 0, faces: 0, merged: 0, apron: 0 };

	const ring: (Column | null)[] = new Array<Column | null>(6);
	const outward: boolean[] = new Array<boolean>(6).fill(false);

	// The cells just outside the rim. Two chunks drawn at different levels
	// tile the boundary with hexagons of two different sizes, and those do not
	// interlock: strips of ground fall between the levels' jagged edges with
	// neither side's cells covering them. Each chunk closes its own side by
	// also drawing the ring beyond its rim, dropped a centimetre so a real
	// cell wins wherever one exists.
	const apron = new Map<number, { face: number; i: number; j: number }>();

	for (let q = 0; q <= chunk.m; q++)
		for (let r = 0; q + r <= chunk.m; r++) {
			const [i, j] = joinPath(chunk.address.path, q, r, depth);
			if (!owns(chunk, face, n, i, j)) continue;
			tally.cells++;

			const corners = cellCorners(face, n, i, j);
			const degree = corners.length;
			const own = sampler.columnAt(face, i, j);
			// A cell on the chunk triangle's own edge has neighbours in another
			// chunk, and those are the edges a skirt hangs from.
			const onRim = q === 0 || r === 0 || q + r === chunk.m;
			for (let k = 0; k < 6; k++) {
				const nb = k < degree ? neighbour(face, n, i, j, k) : null;
				ring[k] = nb ? sampler.columnAt(nb.face, nb.i, nb.j) : null;
				// A neighbour across a face edge carries the other face's
				// coordinates, and those can path-match this triangle by
				// coincidence -- the face has to agree before the path means
				// anything.
				outward[k] =
					onRim &&
					nb !== null &&
					!(nb.face === face && inChunk(chunk, nb.i, nb.j));
				if (outward[k] && nb && settings.skirtCells > 0) {
					const canon = canonicalCell(nb.face, n, nb.i, nb.j);
					apron.set(
						(canon.face * 262144 + canon.i) * 262144 + canon.j,
						canon,
					);
				}
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
				settings.skirtCells > 0 ? outward : null,
				settings.skirtCells,
				grid,
				floorAt,
			);
		}

	for (const cell of apron.values()) {
		// Already canonical, so the chunk draws it exactly when it is on this
		// chunk's own face and inside its triangle. `owns` is not this test:
		// it never compares the faces, and another face's coordinates can
		// path-match this triangle by coincidence.
		if (cell.face === face && inChunk(chunk, cell.i, cell.j)) continue;
		meshApronCell(
			chunk,
			sampler,
			shape,
			seed,
			origin,
			cell,
			ring,
			layers,
			opaque,
			translucent,
			tally,
			settings.skirtCells,
			grid,
			floorAt,
		);
	}
	return tally;
}

/** Whether a lattice point falls inside this chunk's triangle. */
function inChunk(chunk: Chunk, i: number, j: number): boolean {
	const split = splitPath(i, j, chunk.depth, chunk.chunkLevel);
	for (let level = 0; level < split.path.length; level++)
		if (split.path[level] !== chunk.address.path[level]) return false;
	return true;
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
	outward: readonly boolean[] | null,
	skirtCells: number,
	grid: number,
	floorAt: ((face: number, i: number, j: number) => number) | undefined,
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

	// Where the ground and water surfaces sit once snapped to the shared fine
	// grid, and which of this chunk's own layers each cap belongs to. Every
	// level snapping to one grid is what merges the levels: wherever the
	// terrain gave two levels the same surface, their caps land on the same
	// radius and the join disappears. Caps deeper down -- cave ceilings and
	// floors -- stay on the chunk's own grid, where nothing joins them.
	const groundCap =
		own.groundRadius > 0 ? shape.layerOfSurface(own.groundRadius) : -1;
	const waterCap =
		own.waterRadius > 0 ? shape.layerOfSurface(own.waterRadius) : -1;
	const groundTop =
		groundCap >= 0
			? snappedSurface(shape.crustTopRadius, own.groundRadius, grid)
			: 0;
	const waterTop =
		waterCap >= 0
			? snappedSurface(shape.crustTopRadius, own.waterRadius, grid)
			: 0;
	const capRadius = (layer: number): number =>
		layer === groundCap
			? groundTop
			: layer === waterCap
				? waterTop
				: shape.radiusOfLayer(layer);

	// How much sky this column takes, from the ground standing around it. A
	// hollow is darker than a ridge, which the occlusion at a face's corners
	// cannot see: that only ever looks at the two cells touching the corner.
	const around: number[] = [];
	for (let k = 0; k < degree; k++) {
		const other = ring[k];
		if (other) around.push(other.first);
	}
	const sky = skyExposure(own.first, around, SKY_REACH);

	// Caps first: a top or a bottom face covers one layer and never merges with
	// the layer under it, because there is a different block there.
	for (let layer = from; layer <= to; layer++) {
		const block = at(own, layer);
		const here = opacityOf(block);
		if (here === 0) continue;
		const sink = here === 1 ? translucent : opaque;
		blockColor(block, face, i, j, seed, COLOR, 0);
		shade(COLOR, sky);

		if (opacityOf(at(own, layer - 1)) < here) {
			emitCap(
				sink,
				corners,
				degree,
				capRadius(layer),
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
			shade(COLOR, sky);
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

	// A skirt on every edge of the chunk that faces out of it, hanging from the
	// cell's own surface. It covers the slit where a neighbour drawn at another
	// level put its surface at a slightly different height.
	if (outward && skirtCells > 0) {
		const top = firstSolid(own, from, to);
		if (top >= 0) {
			const block = at(own, top);
			blockColor(block, face, i, j, seed, COLOR, 0);
			shade(COLOR, sky);
			const bottom = skirtBottom(
				shape,
				grid,
				top,
				skirtCells,
				floorAt ? floorAt(face, i, j) : Infinity,
			);
			for (let k = 0; k < degree; k++) {
				if (!outward[k]) continue;
				emitSide(
					opaque,
					corners,
					degree,
					k,
					capRadius(top),
					bottom,
					origin,
					ring,
					top,
					Math.min(layers - 1, shape.layerOfRadius(bottom)),
				);
				tally.faces++;
			}
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
			shade(COLOR, sky);
			emitSide(
				here === 1 ? translucent : opaque,
				corners,
				degree,
				k,
				capRadius(layer),
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
 * Draw one cell from just beyond the rim, a centimetre under its true height.
 *
 * The apron is coverage, not terrain. Where the neighbouring chunk is at this
 * chunk's own level it draws this very cell itself, and the apron sits a
 * centimetre under it, invisible. Where the levels differ, the two tilings'
 * jagged edges leave strips neither side's own cells cover, and the apron is
 * what shows there instead of the sky through the planet. Only the surface is
 * drawn: the caps, and a skirt on the edges facing away from the chunk.
 */
function meshApronCell(
	chunk: Chunk,
	sampler: ColumnSampler,
	shape: WorldShape,
	seed: number,
	origin: Vec3,
	cell: { face: number; i: number; j: number },
	ring: (Column | null)[],
	layers: number,
	opaque: MeshSink,
	translucent: MeshSink,
	tally: MeshTally,
	skirtCells: number,
	grid: number,
	floorAt: ((face: number, i: number, j: number) => number) | undefined,
): void {
	const n = 1 << chunk.depth;
	const { face, i, j } = cell;
	const corners = cellCorners(face, n, i, j);
	const degree = corners.length;
	const own = sampler.columnAt(face, i, j);

	const away: boolean[] = new Array<boolean>(6).fill(false);
	for (let k = 0; k < 6; k++) {
		const nb = k < degree ? neighbour(face, n, i, j, k) : null;
		ring[k] = nb ? sampler.columnAt(nb.face, nb.i, nb.j) : null;
		// The edges facing away from the chunk carry the skirt; the inner ones
		// are buried in the rim cells the chunk already drew.
		away[k] =
			nb === null ||
			nb.face !== chunk.address.face ||
			!inChunk(chunk, nb.i, nb.j);
	}

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

	const groundCap =
		own.groundRadius > 0 ? shape.layerOfSurface(own.groundRadius) : -1;
	const waterCap =
		own.waterRadius > 0 ? shape.layerOfSurface(own.waterRadius) : -1;
	const groundTop =
		groundCap >= 0
			? snappedSurface(shape.crustTopRadius, own.groundRadius, grid)
			: 0;
	const waterTop =
		waterCap >= 0
			? snappedSurface(shape.crustTopRadius, own.waterRadius, grid)
			: 0;
	const capRadius = (layer: number): number =>
		layer === groundCap
			? groundTop
			: layer === waterCap
				? waterTop
				: shape.radiusOfLayer(layer);

	const around: number[] = [];
	for (let k = 0; k < degree; k++) {
		const other = ring[k];
		if (other) around.push(other.first);
	}
	const sky = skyExposure(own.first, around, SKY_REACH);

	// Up-caps only: the apron exists to be looked down at.
	for (let layer = from; layer <= to; layer++) {
		const block = at(own, layer);
		const here = opacityOf(block);
		if (here === 0) continue;
		if (opacityOf(at(own, layer - 1)) >= here) continue;
		blockColor(block, face, i, j, seed, COLOR, 0);
		shade(COLOR, sky);
		emitCap(
			here === 1 ? translucent : opaque,
			corners,
			degree,
			capRadius(layer) - APRON_DROP,
			origin,
			FACE_SHADE.top,
			true,
			(corner) => occlusion(ring, degree, corner, corner + 1, layer - 1),
		);
		tally.faces++;
	}

	// A skirt down from the surface on the outward edges.
	const top = firstSolid(own, from, to);
	if (top >= 0) {
		const block = at(own, top);
		blockColor(block, face, i, j, seed, COLOR, 0);
		shade(COLOR, sky);
		const bottom = skirtBottom(
			shape,
			grid,
			top,
			skirtCells,
			floorAt ? floorAt(face, i, j) : Infinity,
		);
		for (let k = 0; k < degree; k++) {
			if (!away[k] || !ring[k]) continue;
			emitSide(
				opaque,
				corners,
				degree,
				k,
				capRadius(top) - APRON_DROP,
				bottom - APRON_DROP,
				origin,
				ring,
				top,
				Math.min(layers - 1, shape.layerOfRadius(bottom)),
			);
			tally.faces++;
		}
	}
	tally.apron++;
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

/** The topmost layer of a column that stops light, inside a band. */
function firstSolid(column: Column, from: number, to: number): number {
	for (let layer = Math.max(0, from); layer <= to; layer++)
		if (opacityOf(at(column, layer)) === 2) return layer;
	return -1;
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
