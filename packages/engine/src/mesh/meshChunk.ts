import { hash3 } from "../generation/noise/hash3.js";
import type { Chunk } from "../generation/chunk/Chunk.js";
import type { Column } from "../generation/chunk/Column.js";
import type { ColumnSampler } from "../generation/chunk/ColumnSampler.js";
import type { MeshOptions } from "./MeshOptions.js";
import type { MeshSink } from "./MeshSink.js";
import { Vec3 } from "../math/Vec3.js";
import type { WorldShape } from "../world/WorldShape.js";
import { AMBIENT_OCCLUSION } from "./AMBIENT_OCCLUSION.js";

/** Every corner at full light -- the geometry {@link AMBIENT_OCCLUSION} shares. */
const FLAT_LIGHT: readonly number[] = [1, 1, 1];
import { MESH_DEFAULTS } from "./MeshOptions.js";
import { blockColor, speckleShade } from "../generation/terrain/blockColor.js";
import { gridCellColor } from "./gridCellColor.js";
import { skyExposure } from "../light/skyExposure.js";
import { canonicalCell } from "../addressing/neighbours/canonicalCell.js";
import { cellCorners } from "../addressing/lattice/cellCorners.js";
import { coarseCell } from "../edit/coarseCell.js";
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

/** A lattice point, named by the face whose coordinates it is written in. */
interface Cell {
	readonly face: number;
	readonly i: number;
	readonly j: number;
}

/**
 * One number for a cell, to key a map by.
 *
 * The lattice runs to `2^17` a side at the deepest world the address word
 * allows, so two coordinates and a face fit inside an exact integer with room
 * over.
 */
function nameOf(cell: Cell): number {
	return (cell.face * 262144 + cell.i) * 262144 + cell.j;
}

/** Scratch color, refilled per face rather than allocated per vertex. */
const COLOR = new Float32Array(3);

/**
 * Scratch pictures for the cell being drawn: its cap, its side, its underside.
 *
 * Refilled beside {@link COLOR} and for the same reason -- a face needs to know
 * which layer it reads, and threading it through every emit would be one more
 * argument on calls that already take nine.
 */
const SLOT = new Int32Array(3);

/**
 * How far round its own ring this cell's picture is turned.
 *
 * **A cell here is a hexagon and shows a whole picture**, so one picture a
 * block reads as a grid laid over the world. A hexagon has six rotations that
 * map it onto itself where a square face has four, so the turn costs nothing
 * but which corner gets which corner of the picture. Measured over a field of
 * grass, it takes the repeat at one cell from `0.70` to `0.08`
 * (`tools/trial-tiles.mjs`).
 */
let TURN = 0;

/** How much of the picture a cap's corner sits at, for a polygon of `degree`. */
function capU(at: number, degree: number): number {
	return 0.5 + 0.5 * Math.cos(((at + TURN) * 2 * Math.PI) / degree);
}

function capV(at: number, degree: number): number {
	return 0.5 + 0.5 * Math.sin(((at + TURN) * 2 * Math.PI) / degree);
}

/** Fills {@link COLOR} for one cell: the block's color, or the grid's. */
type CellPaint = (block: number, face: number, i: number, j: number) => void;

/**
 * How many layers of neighbouring ground it takes to shut the sky out.
 *
 * A cell with ground this much higher on every side takes the least light the
 * exposure allows.
 */
const SKY_REACH = 6;

/**
 * What a cell shut in on every side still takes, as a fraction.
 *
 * The whole of what an enclosed place gets from the sky, and 0 would be
 * pitch black. A light standing in the world reaches it separately: the
 * shader multiplies this into the sun, the sky and the moon and not into a
 * lamp, so a cave is dark until something is carried down there.
 */
const SKY_FLOOR = 0.12;

/**
 * How much sky a face at one layer sees, from the ground around its cell.
 *
 * **A layer, not a column.** The exposure used to be read once per cell at
 * the column's own top and painted over every face the column produced --
 * which is right for the cap sitting on that top and wrong for everything
 * below it. A wall belongs to the solid side, so a shaft's wall took the
 * exposure of the surface the shaft was dug from, at full daylight, however
 * deep it ran; a cave inside a hill took it too, because the column's top is
 * still the hillside standing over the cave.
 *
 * \`around\` is the ring's own tops, which is what says whether this face is
 * under the ground beside it or standing clear of it -- so a cliff face stays
 * bright as it should while a cave a metre away goes dark.
 */
function skyAt(on: boolean, layer: number, around: readonly number[]): number {
	return on ? skyExposure(layer, around, SKY_REACH, SKY_FLOOR) : 1;
}

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
 * How far into the territory beyond a chunk's own ring a copied wall is
 * pushed, in metres.
 *
 * Under the seam's curtain this chunk draws the walls the cell beyond its ring
 * owes -- the rock facing a cave it has opened -- because the chunk over there
 * may be a level coarser and draw nothing at this resolution at all. Where it
 * is at this level it draws those very quads itself, from a ring this chunk
 * cannot reach and so with corner shading this chunk cannot reproduce; two
 * coplanar copies in two shadings sparkle along the boundary. A centimetre
 * further out puts this copy behind theirs wherever theirs exists, and a
 * centimetre inside the neighbouring column's rock is invisible wherever it
 * does not.
 */
const SEAM_PUSH = 0.01;

/**
 * How far a side face reaches past each of its own two corners, in metres.
 *
 * The vertical line where two walls meet holds vertices from both, and the two
 * sets rarely agree: each wall is a run merged over its own neighbour's
 * transitions, and across a chunk boundary the same corner is computed against
 * two different origins. A rasterizer given two edges on one line with
 * different vertices leaves pinprick holes along it -- dots of sky down the
 * corner of a cliff, bright wherever the unlit inside of the planet is behind
 * them.
 *
 * Each side face therefore runs this far past its corners, along its own
 * plane. The extension is never visible: where the corner's third cell is air
 * the wall around the corner exists -- the cell this face stands on is solid
 * there, so a face toward that third cell is emitted too -- and the extension
 * lands behind it; where the third cell is solid the extension is inside its
 * rock. It closes the corner slit between two chunks' copies of one wall for
 * the same reason.
 *
 * **A face widened past its corners must also run past its own ends.** The
 * top and bottom of a wall used to share their vertices with the caps beside
 * them to the bit, which is what kept those junctions watertight; moving the
 * corners for the widening broke the sharing, and every cap grew a dotted rim
 * where its edge and the wall's edge rasterize apart -- brinks seen from
 * above, bottoms seen from below. So a face also runs this far past each end
 * where no other face of the same wall continues there, and the cap junction
 * is interior to the face instead of an edge meeting an edge.
 */
const WALL_WELD = 0.004;

/**
 * How many levels coarser than itself a chunk assumes its neighbours may be.
 *
 * The selection splits a triangle when it is nearer than a multiple of its own
 * width, and that test is on a distance which changes smoothly across the
 * surface, so two triangles that end up side by side cannot be far apart in the
 * walk. It is **one**, measured rather than argued: over every pair of adjacent
 * cells in a real selection, at altitudes from 2 m to 1,500 m and with each
 * triangle's own tallest ground deciding its reach, the worst gap between the
 * levels of two neighbouring chunks is one, every time.
 *
 * That multiple is the `detail` knob, so the reading has to hold across its
 * range and does: 1 to 8, where the selection goes from 169 chunks to 3,320,
 * and the smallest reading is over 14,642 adjacent pairs and the largest over
 * 216,000.
 *
 * At one, the coarse lattice point a rim cell falls into is still inside the
 * two cells past the triangle that the mesher already reads, so the store's
 * routing does not widen with it (`tools/probe-mesher-reach.ts`, 0% of a
 * chunk's samples unrouted). Raising it would.
 */
const SEAM_JUMP = 1;

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

/** The seam overlay's marker colors, by tint index. */
const TINTS: readonly (readonly [number, number, number])[] = [
	[0, 0, 0],
	// A cell on a chunk boundary.
	[0.15, 0.35, 0.95],
	// A cell on a face edge.
	[0.95, 0.85, 0.1],
	// An apron cell.
	[0.95, 0.45, 0.1],
];

/**
 * Paint a cell's faces toward its seam marker.
 *
 * The overlay mixes hard, because it exists to be unmissable on top of
 * terrain. The grid mixes softer: at 8-cell chunks nearly half the cells are
 * rim cells, and a hard mark turns the shell into solid paint with the
 * tiling unreadable inside it.
 */
function debugTint(color: Float32Array, tint: number, mix: number): void {
	if (tint === 0) return;
	const mark = TINTS[tint]!;
	color[0] = color[0]! * (1 - mix) + mark[0] * mix;
	color[1] = color[1]! * (1 - mix) + mark[1] * mix;
	color[2] = color[2]! * (1 - mix) + mark[2] * mix;
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
	const light = settings.ambientOcclusion ? AMBIENT_OCCLUSION : FLAT_LIGHT;
	const exposed = settings.skyExposure;
	const depth = chunk.depth;
	const n = 1 << depth;
	const face = chunk.address.face;
	const layers = chunk.layerCount;
	const grid = settings.surfaceGrid || shape.blockSize;
	const tally: MeshTally = { cells: 0, faces: 0, merged: 0, apron: 0 };
	const gridPaint = settings.grid;
	const mix = gridPaint ? 0.45 : 0.7;
	// **Not under the grid**, which draws its own colours and is a picture of
	// the addressing rather than of the world.
	const pictures = gridPaint ? null : (settings.textureLayers ?? null);
	const wearing: CellPaint = (block, cellFace, i, j) => {
		if (!pictures) {
			SLOT[0] = -1;
			SLOT[1] = -1;
			SLOT[2] = -1;
			return;
		}
		const at = block * 4;
		SLOT[0] = pictures[at] ?? -1;
		SLOT[1] = pictures[at + 1] ?? -1;
		SLOT[2] = pictures[at + 2] ?? -1;
		TURN = Math.floor(hash3(cellFace * 8191 + i, j, i ^ j, seed + 17) * 6);
	};
	const paint: CellPaint = gridPaint
		? (block, cellFace, i, j) => {
				gridCellColor(gridPaint, cellFace, i, j, seed, COLOR, 0);
				wearing(block, cellFace, i, j);
			}
		: pictures
			? // **The picture carries the colour, so the vertex carries only
				// what shades it.** Writing the registry colour here as well
				// would multiply the block's own colour into itself.
				(block, cellFace, i, j) => {
					const shade = speckleShade(
						cellFace,
						i,
						j,
						seed,
						settings.speckle,
					);
					COLOR[0] = shade;
					COLOR[1] = shade;
					COLOR[2] = shade;
					wearing(block, cellFace, i, j);
				}
			: (block, cellFace, i, j) => {
					blockColor(
						block,
						cellFace,
						i,
						j,
						seed,
						COLOR,
						0,
						settings.speckle,
					);
					wearing(block, cellFace, i, j);
				};

	/**
	 * The canopy colour a cell's ground cap takes, or `0` for its own.
	 *
	 * **A plant under half a block is not a shape, it is the colour of the
	 * ground it stands on.** The plant pass hands over the columns whose grid
	 * was too coarse to build on; nothing was written into the blocks, so this
	 * is the only place that canopy exists.
	 */
	const coverAt = settings.cover;
	const canopyOf = (cell: Cell): number =>
		coverAt ? (coverAt.get(nameOf(cell)) ?? 0) : 0;

	const ring: (Column | null)[] = new Array<Column | null>(6);
	const ringCells: (Cell | null)[] = new Array<Cell | null>(6);
	const outward: boolean[] = new Array<boolean>(6).fill(false);

	// Where a cell's ground cap lands once snapped to the shared fine grid,
	// remembered by cell. The seam floor below asks for the same handful of
	// coarse lattice points from every cell that falls into one of them.
	const capAt = new Map<number, number>();
	const snappedCapOf = (cell: Cell): number => {
		const key = nameOf(cell);
		const had = capAt.get(key);
		if (had !== undefined) return had;
		const ground = sampler.columnAt(cell.face, cell.i, cell.j).groundRadius;
		const cap =
			ground > 0 ? snappedSurface(shape.crustTopRadius, ground, grid) : 0;
		capAt.set(key, cap);
		return cap;
	};

	/**
	 * The lowest ground any level of detail in play draws over a cell.
	 *
	 * A chunk one level coarser keeps every other lattice point and drops the
	 * rest, and **a point's height does not depend on who asks** -- so the
	 * ground a coarser neighbour puts over a cell is this chunk's own reading
	 * of the coarse lattice point that cell falls into, at the same radius to
	 * the last bit. That is what makes the join closable from one side: the
	 * mesher never has to be told which level the chunk over there is drawn
	 * at, because it can evaluate what every candidate level would draw.
	 *
	 * Which coarse point a cell falls into is `hexRound` on its weights, not a
	 * shift -- a cell is the region around a lattice point rather than a square
	 * of them, and a shift names the wrong one for 43.9% of cells one level
	 * out.
	 */
	const seamFloor = (cell: Cell): number => {
		let low = 0;
		for (let step = 1; step <= SEAM_JUMP; step++) {
			const coarse = coarseCell(
				{ face: cell.face, i: cell.i, j: cell.j, layer: 0 },
				depth,
				step,
			);
			const cap = snappedCapOf({
				face: coarse.face,
				i: coarse.i << step,
				j: coarse.j << step,
			});
			if (cap > 0 && (low === 0 || cap < low)) low = cap;
		}
		return low;
	};

	// The cells just outside the rim. Two chunks drawn at different levels
	// tile the boundary with hexagons of two different sizes, and those do not
	// interlock: strips of ground fall between the levels' jagged edges with
	// neither side's cells covering them. Each chunk closes its own side by
	// also drawing the ring beyond its rim, dropped a centimetre so a real
	// cell wins wherever one exists.
	const apron = new Map<number, Cell>();

	/**
	 * Whether this chunk draws a cap for a cell at all.
	 *
	 * The cells it owns and the ring it draws beyond them, and nothing else --
	 * which is what says where its own surface stops and another chunk's
	 * begins.
	 */
	const drawnHere = (cell: Cell): boolean => {
		if (owns(chunk, cell.face, n, cell.i, cell.j)) return true;
		return apron.has(nameOf(canonicalCell(cell.face, n, cell.i, cell.j)));
	};

	for (let q = 0; q <= chunk.m; q++)
		for (let r = 0; q + r <= chunk.m; r++) {
			const [i, j] = joinPath(chunk.address.path, q, r, depth);
			if (!owns(chunk, face, n, i, j)) continue;
			tally.cells++;

			const corners = cellCorners(face, n, i, j);
			const degree = corners.length;
			const own = sampler.columnAt(face, i, j);
			// An edge is outward when it faces a cell this chunk does not
			// draw, wherever the cell sits. The rim rows are the usual case,
			// but a boundary row can belong wholly to the neighbouring chunk,
			// and the canonical-face rule refuses cells inside the triangle
			// on a face edge -- either way the adjacent drawn cells sit one
			// row in, and a rim test on `q` and `r` never sees their edges.
			// The face check first: a neighbour across a face edge carries
			// the other face's coordinates, and those can path-match this
			// triangle by coincidence.
			for (let k = 0; k < 6; k++) {
				const nb = k < degree ? neighbour(face, n, i, j, k) : null;
				ring[k] = nb ? sampler.columnAt(nb.face, nb.i, nb.j) : null;
				outward[k] =
					nb !== null &&
					!(
						nb.face === face &&
						inChunk(chunk, nb.i, nb.j) &&
						owns(chunk, nb.face, n, nb.i, nb.j)
					);
				if (outward[k] && nb && settings.apron) {
					const canon = canonicalCell(nb.face, n, nb.i, nb.j);
					apron.set(nameOf(canon), canon);
				}
			}

			// The same two marks serve the seam overlay and the grid: a
			// face-edge cell and a chunk-boundary cell. The overlay paints
			// both; the grid paints each under its own switch.
			let tint = 0;
			if (settings.debugSeams || gridPaint) {
				const w = latticeWeights(n, i, j);
				const onFaceEdge = w[0] === 0 || w[1] === 0 || w[2] === 0;
				const onRim = outward.some(Boolean);
				if (settings.debugSeams) tint = onFaceEdge ? 2 : onRim ? 1 : 0;
				else if (gridPaint!.faces && onFaceEdge) tint = 2;
				else if (gridPaint!.chunks && onRim) tint = 1;
			}

			meshCell(
				chunk,
				shape,
				paint,
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
				grid,
				tint,
				mix,
				light,
				exposed,
				canopyOf({ face, i, j }),
			);
		}

	// The three corners of the chunk triangle. A cell clipping the corner
	// wedge can sit two steps from every owned cell -- the edge cells at a
	// corner often belong to the neighbouring chunk -- so the walk along the
	// rim never reaches it, and the far side of the planet showed through a
	// sliver of exactly that shape. The corner point's own cell and its full
	// ring are everything that can touch the wedge, and they go in outright.
	if (settings.apron)
		for (const [cq, cr] of [
			[0, 0],
			[chunk.m, 0],
			[0, chunk.m],
		] as const) {
			const [ci, cj] = joinPath(chunk.address.path, cq, cr, depth);
			const corner = canonicalCell(face, n, ci, cj);
			const degree = cellCorners(
				corner.face,
				n,
				corner.i,
				corner.j,
			).length;
			apron.set(nameOf(corner), corner);
			for (let k = 0; k < degree; k++) {
				const nb = neighbour(corner.face, n, corner.i, corner.j, k);
				if (!nb) continue;
				const canon = canonicalCell(nb.face, n, nb.i, nb.j);
				apron.set(nameOf(canon), canon);
			}
		}

	// Under the grid the apron sits flush rather than a centimetre low, and
	// wears the same mark its real copy wears. A flat shell makes both safe
	// and both necessary: the copy and the cell it duplicates take identical
	// colors -- same canonical address, same flat light -- so their z-fight
	// paints one color and is invisible, while the centimetre step showed as
	// a dark slit along every level join when looked at along the surface.
	// And an apron cell is always a rim cell of its own chunk -- adjacency to
	// this chunk is what put it in the ring -- so under the chunk switch it
	// takes the boundary mark, or the two copies would z-fight in two colors.
	const drop = gridPaint ? 0 : APRON_DROP;
	for (const cell of apron.values()) {
		// Already canonical, so the chunk draws it exactly when it is on this
		// chunk's own face and inside its triangle. `owns` is not this test:
		// it never compares the faces, and another face's coordinates can
		// path-match this triangle by coincidence.
		if (cell.face === face && inChunk(chunk, cell.i, cell.j)) continue;
		let apronTint = settings.debugSeams ? 3 : 0;
		if (gridPaint) {
			const w = latticeWeights(n, cell.i, cell.j);
			const onFaceEdge = w[0] === 0 || w[1] === 0 || w[2] === 0;
			if (gridPaint.faces && onFaceEdge) apronTint = 2;
			else if (gridPaint.chunks) apronTint = 1;
		}
		meshApronCell(
			chunk,
			sampler,
			shape,
			paint,
			origin,
			cell,
			ring,
			ringCells,
			layers,
			opaque,
			translucent,
			tally,
			grid,
			apronTint,
			mix,
			drop,
			drawnHere,
			seamFloor,
			light,
			exposed,
			canopyOf(cell),
		);
	}
	return tally;
}

/**
 * Whether the descent for a lattice point lands on this chunk's triangle.
 *
 * **This is the ownership question, not containment.** A point on a chunk edge
 * is *inside* two or three triangles; `splitPath` picks the one the border rule
 * awards it to, so this is true for exactly one of them. Both callers want that
 * -- they are deciding what to draw, where drawing a shared cell twice is the
 * fault -- and both already combine it with `owns`, which runs the same
 * descent. Anything asking whether this chunk *holds* data for a point wants
 * `offsetIn` instead, which answers for the triangle asked rather than the
 * winner: reading a chunk's own rim through this one is what made a chunk
 * regenerate its own border from the seed.
 */
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
	paint: CellPaint,
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
	grid: number,
	tint: number,
	mix: number,
	light: readonly number[],
	exposed: boolean,
	canopy: number,
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

	// Caps first: a top or a bottom face covers one layer and never merges with
	// the layer under it, because there is a different block there.
	for (let layer = from; layer <= to; layer++) {
		const block = at(own, layer);
		const here = opacityOf(block);
		if (here === 0) continue;
		const sink = here === 1 ? translucent : opaque;
		paint(block, face, i, j);
		debugTint(COLOR, tint, mix);

		if (opacityOf(at(own, layer - 1)) < here) {
			// **Only the cap, and only the ground's own.** A cliff face under
			// a forest is still rock, and so is the underside of a ledge.
			const covered = canopy !== 0 && layer === groundCap;
			if (covered) {
				paint(canopy, face, i, j);
				debugTint(COLOR, tint, mix);
			}
			emitCap(
				sink,
				corners,
				degree,
				capRadius(layer),
				origin,
				true,
				(corner) =>
					occlusion(ring, degree, corner, corner + 1, layer - 1),
				light,
				skyAt(exposed, layer, around),
			);
			tally.faces++;
			if (covered) {
				paint(block, face, i, j);
				debugTint(COLOR, tint, mix);
			}
		}
		const below = layer + 1 >= layers ? 0 : opacityOf(at(own, layer + 1));
		if (below < here) {
			emitCap(
				sink,
				corners,
				degree,
				shape.radiusOfLayer(layer + 1),
				origin,
				false,
				() => 0,
				light,
				skyAt(exposed, layer, around),
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
			paint(block, face, i, j);
			debugTint(COLOR, tint, mix);
			emitCap(
				opacityOf(block) === 1 ? translucent : opaque,
				corners,
				degree,
				shape.radiusOfLayer(floor + 1),
				origin,
				false,
				() => 0,
				light,
				skyAt(exposed, floor, around),
			);
			tally.faces++;
		}
	}

	// A cap step. Two neighbours level at this chunk's own grid can stand
	// several fine layers apart once their caps snap to the shared fine grid,
	// and the side runs never cover that span: at the chunk's own resolution
	// the two columns are the same height, so no run exists there at all. The
	// wall between the two snapped caps is what a terrace brink shows.
	if (groundCap >= 0 && opacityOf(at(own, groundCap)) === 2) {
		for (let k = 0; k < degree; k++) {
			const other = ring[k];
			if (!other || other.groundRadius <= 0) continue;
			// A neighbour open at the cap layer already has a run whose top
			// is this cap; only a level neighbour leaves the span bare.
			if (opacityOf(at(other, groundCap)) !== 2) continue;
			const otherTop = snappedSurface(
				shape.crustTopRadius,
				other.groundRadius,
				grid,
			);
			if (otherTop >= groundTop - 1e-9) continue;
			const block = at(own, groundCap);
			paint(block, face, i, j);
			debugTint(COLOR, tint, mix);
			emitSide(
				opaque,
				corners,
				degree,
				k,
				groundTop,
				otherTop,
				origin,
				ring,
				groundCap,
				groundCap,
				true,
				true,
				light,
				skyAt(exposed, groundCap, around),
				skyAt(exposed, groundCap, around),
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

			// Whether another run of this same wall continues past either
			// end -- the one place the weld must not reach past, or two
			// coplanar runs of different colors overlap and fight.
			const aboveOpacity = opacityOf(at(own, layer - 1));
			const belowOpacity = opacityOf(at(own, end + 1));
			const wallAbove =
				aboveOpacity > 0 &&
				opacityOf(at(other, layer - 1)) < aboveOpacity;
			const wallBelow =
				belowOpacity > 0 &&
				opacityOf(at(other, end + 1)) < belowOpacity;

			paint(block, face, i, j);
			debugTint(COLOR, tint, mix);
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
				!wallAbove,
				!wallBelow,
				light,
				skyAt(exposed, layer, around),
				skyAt(exposed, end, around),
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
 * drawn: the caps, the cap steps between them, and the curtain that closes the
 * ring's outer edge.
 */
function meshApronCell(
	chunk: Chunk,
	sampler: ColumnSampler,
	shape: WorldShape,
	paint: CellPaint,
	origin: Vec3,
	cell: Cell,
	ring: (Column | null)[],
	ringCells: (Cell | null)[],
	layers: number,
	opaque: MeshSink,
	translucent: MeshSink,
	tally: MeshTally,
	grid: number,
	tint: number,
	mix: number,
	drop: number,
	drawnHere: (cell: Cell) => boolean,
	seamFloor: (cell: Cell) => number,
	light: readonly number[],
	exposed: boolean,
	canopy: number,
): void {
	const n = 1 << chunk.depth;
	const { face, i, j } = cell;
	const corners = cellCorners(face, n, i, j);
	const degree = corners.length;
	const own = sampler.columnAt(face, i, j);

	// The ring, for the band to walk, the corner occlusion, the sky exposure,
	// and -- for the cells this chunk does not itself draw -- which edges its
	// surface stops at.
	for (let k = 0; k < 6; k++) {
		const nb = k < degree ? neighbour(face, n, i, j, k) : null;
		ring[k] = nb ? sampler.columnAt(nb.face, nb.i, nb.j) : null;
		ringCells[k] = nb;
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

	// The caps, to be looked down at.
	for (let layer = from; layer <= to; layer++) {
		const block = at(own, layer);
		const here = opacityOf(block);
		if (here === 0) continue;
		if (opacityOf(at(own, layer - 1)) >= here) continue;
		// A plant too small for this grid to build is the colour of the
		// ground it stands on, and the apron draws that ground too.
		paint(canopy !== 0 && layer === groundCap ? canopy : block, face, i, j);
		debugTint(COLOR, tint, mix);
		emitCap(
			here === 1 ? translucent : opaque,
			corners,
			degree,
			capRadius(layer) - drop,
			origin,
			true,
			(corner) => occlusion(ring, degree, corner, corner + 1, layer - 1),
			light,
			skyAt(exposed, layer, around),
		);
		tally.faces++;
	}

	// The same cap step the owned cells draw: a level neighbour whose cap
	// snapped lower leaves a bare span no run covers.
	if (groundCap >= 0 && opacityOf(at(own, groundCap)) === 2) {
		for (let k = 0; k < degree; k++) {
			const other = ring[k];
			if (!other || other.groundRadius <= 0) continue;
			if (opacityOf(at(other, groundCap)) !== 2) continue;
			const otherTop = snappedSurface(
				shape.crustTopRadius,
				other.groundRadius,
				grid,
			);
			if (otherTop >= groundTop - 1e-9) continue;
			const block = at(own, groundCap);
			paint(block, face, i, j);
			debugTint(COLOR, tint, mix);
			emitSide(
				opaque,
				corners,
				degree,
				k,
				groundTop - drop,
				otherTop - drop,
				origin,
				ring,
				groundCap,
				groundCap,
				true,
				true,
				light,
				skyAt(exposed, groundCap, around),
				skyAt(exposed, groundCap, around),
			);
			tally.faces++;
		}
	}

	// The walls a neighbour at this chunk's own level would draw for this
	// cell, reproduced exactly -- same canonical cell, same ring, same colors,
	// same radii, no drop. Where the chunk over there IS at this level it
	// draws these very quads, the two copies land on one another, and a depth
	// fight between identical colors paints one color. Where it is a level
	// coarser nobody else draws them: a level draws the ground at the points
	// it kept, so every step at the boundary stood open -- a dashed line of
	// holes climbing every slope a level join crosses, one slit per terrace.
	//
	// **Every edge, not only the ring's outer ones.** The ring itself is drawn
	// at this chunk's own heights inside the coarser chunk's territory, so the
	// steps between two ring cells -- and between a ring cell and the rim cell
	// it stands over -- need these walls exactly as much as the outer edges
	// do. Gating them to the outer edges left each of those steps as a slit
	// with the sea showing through it. The run condition is the whole
	// duplicate rule: a wall belongs to its more opaque side, so an owned
	// cell's own runs and an apron cell's never both fire for one edge.
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

			// Whether another run of this same wall continues past either
			// end -- the one place the weld must not reach past, or two
			// coplanar runs of different colors overlap and fight.
			const aboveOpacity = opacityOf(at(own, layer - 1));
			const belowOpacity = opacityOf(at(own, end + 1));
			const wallAbove =
				aboveOpacity > 0 &&
				opacityOf(at(other, layer - 1)) < aboveOpacity;
			const wallBelow =
				belowOpacity > 0 &&
				opacityOf(at(other, end + 1)) < belowOpacity;

			paint(block, face, i, j);
			debugTint(COLOR, tint, mix);
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
				!wallAbove,
				!wallBelow,
				light,
				skyAt(exposed, layer, around),
				skyAt(exposed, end, around),
			);
			tally.faces++;
			tally.merged += end - layer;
			layer = end + 1;
		}
	}

	// The ring's outer edge, where this chunk's surface stops and another
	// chunk's begins. Everything above walls the drops this chunk can see, and
	// this is the one it cannot: the cell over that edge belongs to a chunk
	// which may be drawing it at a different level of detail, and a level draws
	// the ground at the points it kept rather than at the points between them.
	// The two surfaces then stand apart with nothing between them, and a look
	// along the ground goes in at one seam and out of the planet -- measured
	// before this wall existed, 20.8% of the outer edges at a level join stood
	// over the neighbour's ground by 4.91 m on average and 20 m at worst, on a
	// world whose block is 2 m.
	//
	// The curtain's top is the lowest this cell's own geometry already reaches
	// at that edge, and its foot is the lowest ground any level in play puts
	// over there. Where the chunk beyond is at this one's own level the two are
	// the same reading of the same lattice, the curtain has no span, and none
	// is drawn.
	//
	// **It hangs from the apron, which is why it can hang at all.** A wall from
	// a real rim cell starts in the cap plane, so wherever the neighbouring
	// chunk put its own cap on that layer the two are coplanar and speckle
	// through each other -- a dashed dark outline along every chunk boundary,
	// which is what retired the skirt. An apron cell is already a centimetre
	// low, so this starts a centimetre under the neighbour's cap instead of in
	// it. Where it is not needed it hangs inside the neighbouring column's own
	// rock, and the terrain shell is closed, so nothing can see it.
	//
	// **Under the curtain's foot the boundary itself is closed, both ways.**
	// The curtain is a solid wall and closes every disagreement above its own
	// foot whatever the two columns hold; below it nothing was drawn at all,
	// and below it is where a hollow column disagrees. Two cases, and they are
	// not the same rule:
	//
	// A face on THIS chunk's own rock is safe to emit with no thought about
	// levels at all -- where the chunk over there has rock the face is inside
	// it and cannot be seen, and where it does not the face is exactly what
	// was missing. So the outward run condition drops from *the cell beyond is
	// more open* to *this cell is solid*, and the buried copies cost faces and
	// decide nothing.
	//
	// A face on THEIR rock, facing into this chunk's own void, is the cave
	// mouth -- and it is **not** safe to guess. Gating it on this chunk's own
	// reading of the coarse ground over there was measured
	// (`tools/probe-seam-cave.ts`): at the joins where the neighbour is at
	// this chunk's own level, that gate fires 63,690 times and **25,556** of
	// those walls stand in the neighbour's open air, a wall across an open
	// passage two joins in five. Gated instead on the cell beyond's own fine
	// column, every one of them is a quad the neighbour at this level draws
	// itself, so it is a duplicate rather than a guess -- and {@link
	// SEAM_PUSH} puts this copy behind theirs.
	// Whether anything around this cell is hollow under its own ground at all.
	// A column with nothing but rock below its surface has a coarse reading
	// that is rock as well -- the two run one field at two spacings -- so the
	// buried faces below cost a fifth of a chunk's whole face bill and close
	// nothing. Measured over the level joins a real selection makes, gating
	// them on this leaves 5.2% of outer edges holed against 4.8% ungated, and
	// takes the bill from 22% more faces to 8%.
	const hollowHere = groundCap >= 0 && own.last > groundCap;

	for (let k = 0; k < degree; k++) {
		const beyond = ringCells[k];
		const other = ring[k];
		if (!beyond || !other || drawnHere(beyond)) continue;
		const hollow =
			hollowHere ||
			(other.groundRadius > 0 &&
				other.last > shape.layerOfSurface(other.groundRadius));

		// Above this radius the boundary is already closed. The curtain when
		// there is one, and nothing at all when this cell has no ground --
		// deep water, where the whole column is open to the sea.
		let sealed = Infinity;
		if (
			groundCap >= 0 &&
			groundTop > 0 &&
			opacityOf(at(own, groundCap)) === 2
		) {
			const otherTop =
				other.groundRadius > 0
					? snappedSurface(
							shape.crustTopRadius,
							other.groundRadius,
							grid,
						)
					: 0;
			const top =
				otherTop > 0 ? Math.min(groundTop, otherTop) : groundTop;
			const foot = seamFloor(beyond);
			if (foot > 0 && foot < top - 1e-9) {
				const block = at(own, groundCap);
				paint(block, face, i, j);
				debugTint(COLOR, tint, mix);
				emitSide(
					opaque,
					corners,
					degree,
					k,
					top - drop,
					foot - drop,
					origin,
					ring,
					groundCap,
					groundCap,
					true,
					true,
					light,
					skyAt(exposed, groundCap, around),
					skyAt(exposed, groundCap, around),
				);
				tally.faces++;
				sealed = foot - drop;
			}
		}

		// The corners pushed a centimetre into the territory over there, for
		// the copies of the neighbour's own walls. Taken at one radius for the
		// whole edge: the push is a centimetre against a planet, and which
		// centimetre it is decides nothing.
		let pushed: Vec3[] | null = null;
		const pushedCorners = (): Vec3[] => {
			if (pushed) return pushed;
			let cx = 0;
			let cy = 0;
			let cz = 0;
			for (const c of corners) {
				cx += c.x;
				cy += c.y;
				cz += c.z;
			}
			const centre = new Vec3(cx, cy, cz).normalize();
			const leftCorner = corners[(k + degree - 1) % degree]!;
			const rightCorner = corners[k]!;
			const across = leftCorner
				.add(rightCorner)
				.normalize()
				.sub(centre)
				.normalize()
				.scale(SEAM_PUSH / shape.radiusOfLayer(from));
			pushed = corners.slice();
			pushed[(k + degree - 1) % degree] = leftCorner.add(across);
			pushed[k] = rightCorner.add(across);
			return pushed;
		};

		// The ring stood on its head, for a face whose solid side is the cell
		// beyond: the cell across that wall is this one, and the two cells
		// round its corners are the same two either way.
		let mirror: (Column | null)[] | null = null;

		let layer =
			sealed === Infinity
				? from
				: Math.max(from, shape.layerOfRadius(sealed));
		while (layer <= to) {
			const block = at(own, layer);
			const here = opacityOf(block);
			const theirs = opacityOf(at(other, layer));
			if (here > theirs || (here === 0 && theirs === 0)) {
				// More opaque here: the run loop above already drew it.
				layer++;
				continue;
			}
			if (here === theirs) {
				// **Only under this cell's own cap.** A face on solid rock is
				// never wrong, but it is only ever needed where the chunk over
				// there is hollow, and nothing is hollow above the ground. On
				// a world with no caves at all the band stops at the ground
				// cap and this fires for no layer of no column -- which is
				// what keeps a flat shell meshing to caps and nothing else.
				if (
					here !== 2 ||
					!hollow ||
					groundCap < 0 ||
					layer <= groundCap
				) {
					layer++;
					continue;
				}
				let end = layer;
				while (
					end + 1 <= to &&
					at(own, end + 1) === block &&
					opacityOf(at(other, end + 1)) === here
				)
					end++;
				const top = Math.min(capRadius(layer), sealed);
				const bottom = shape.radiusOfLayer(end + 1);
				if (top > bottom + 1e-9) {
					paint(block, face, i, j);
					debugTint(COLOR, tint, mix);
					emitSide(
						opaque,
						corners,
						degree,
						k,
						top,
						bottom,
						origin,
						ring,
						layer,
						end,
						opacityOf(at(own, layer - 1)) === 0,
						opacityOf(at(own, end + 1)) === 0,
						light,
						skyAt(exposed, layer, around),
						skyAt(exposed, end, around),
					);
					tally.faces++;
					tally.merged += end - layer;
				}
				layer = end + 1;
				continue;
			}

			// Their rock against this chunk's void: the wall they owe.
			const theirBlock = at(other, layer);
			let end = layer;
			while (
				end + 1 <= to &&
				at(other, end + 1) === theirBlock &&
				opacityOf(at(own, end + 1)) < theirs
			)
				end++;
			const top = Math.min(shape.radiusOfLayer(layer), sealed);
			const bottom = shape.radiusOfLayer(end + 1);
			if (top > bottom + 1e-9) {
				if (!mirror) mirror = ring.slice();
				const was = mirror[k]!;
				mirror[k] = own;
				const named = canonicalCell(beyond.face, n, beyond.i, beyond.j);
				paint(theirBlock, named.face, named.i, named.j);
				debugTint(COLOR, tint, mix);
				emitSide(
					theirs === 1 ? translucent : opaque,
					pushedCorners(),
					degree,
					k,
					top,
					bottom,
					origin,
					mirror,
					layer,
					end,
					opacityOf(at(other, layer - 1)) === 0,
					opacityOf(at(other, end + 1)) === 0,
					light,
					skyAt(exposed, layer, around),
					skyAt(exposed, end, around),
					true,
				);
				mirror[k] = was;
				tally.faces++;
				tally.merged += end - layer;
			}
			layer = end + 1;
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
	upward: boolean,
	occlude: (corner: number) => number,
	light: readonly number[],
	sky: number,
): void {
	const first: number[] = new Array<number>(degree);
	for (let c = 0; c < degree; c++) {
		const at = upward ? c : degree - 1 - c;
		const p = corners[at]!;
		const lit = light[occlude(at)]!;
		first[c] = sink.vertex(
			p.x * radius - origin.x,
			p.y * radius - origin.y,
			p.z * radius - origin.z,
			COLOR[0]! * lit,
			COLOR[1]! * lit,
			COLOR[2]! * lit,
			sky,
			capU(at, degree),
			capV(at, degree),
			// A cap seen from below is the block's underside, which is a
			// different picture wherever a block has one -- a grass block seen
			// from under an overhang is dirt.
			upward ? SLOT[0]! : SLOT[2]!,
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
	extendTop: boolean,
	extendBottom: boolean,
	light: readonly number[],
	topSky: number,
	bottomSky: number,
	inward = false,
): void {
	// The same quad wound the other way round, for the face the cell ACROSS
	// this edge owes. A wall belongs to its more opaque side, so this is only
	// ever the seam's own copy of a neighbour's wall: the two corners are the
	// two ends of one shared edge whichever cell names them, and swapping them
	// swaps the winding, which is what decides the side it is visible from.
	const leftCorner = corners[(k + (inward ? 0 : degree - 1)) % degree]!;
	const rightCorner = corners[(k + (inward ? degree - 1 : 0)) % degree]!;

	// The face runs past its own ends as well as past its corners, wherever no
	// other face of the same wall continues there -- the junction with a cap is
	// then interior to this face rather than two edges meeting on one line.
	// Where another run does continue, the extension would lie in that run's
	// own plane and the two would fight; those ends stay exact, and exact is
	// enough there because two stacked runs share their corner directions.
	if (extendTop) topRadius += WALL_WELD;
	if (extendBottom) bottomRadius -= WALL_WELD;

	// The widened corners: each pushed past its own end along the edge, so the
	// face overlaps whatever meets it on the corner line. See {@link WALL_WELD}.
	const ex = rightCorner.x - leftCorner.x;
	const ey = rightCorner.y - leftCorner.y;
	const ez = rightCorner.z - leftCorner.z;
	const weld =
		WALL_WELD / (Math.sqrt(ex * ex + ey * ey + ez * ez) * topRadius);
	const left = new Vec3(
		leftCorner.x - ex * weld,
		leftCorner.y - ey * weld,
		leftCorner.z - ez * weld,
	);
	const right = new Vec3(
		rightCorner.x + ex * weld,
		rightCorner.y + ey * weld,
		rightCorner.z + ez * weld,
	);

	// Two occluders per vertex, as everywhere else: the cell beyond the wall at
	// the layer above or below, and the cell round the corner at this layer.
	const beyond = ring[k]!;
	const leftSide = ring[(k + (inward ? 1 : degree - 1)) % degree];
	const rightSide = ring[(k + (inward ? degree - 1 : 1)) % degree];
	const above = opacityOf(at(beyond, topLayer - 1)) === 2 ? 1 : 0;
	const under = opacityOf(at(beyond, bottomLayer + 1)) === 2 ? 1 : 0;
	const byLeft = leftSide && opacityOf(at(leftSide, topLayer)) === 2 ? 1 : 0;
	const byRight =
		rightSide && opacityOf(at(rightSide, topLayer)) === 2 ? 1 : 0;

	// **A wall merged down a column is that many pictures tall.** The run's own
	// length is what `v` reaches, and the sampler repeats -- so merging stays
	// exactly as free as it was and a three-layer wall is not one picture
	// stretched over three metres.
	const runs = Math.max(1, bottomLayer - topLayer + 1);
	const put = (
		p: Vec3,
		radius: number,
		occ: number,
		sky: number,
		u: number,
		v: number,
	) => {
		const lit = light[occ]!;
		return sink.vertex(
			p.x * radius - origin.x,
			p.y * radius - origin.y,
			p.z * radius - origin.z,
			COLOR[0]! * lit,
			COLOR[1]! * lit,
			COLOR[2]! * lit,
			sky,
			u,
			v,
			SLOT[1]!,
		);
	};

	const topLeft = put(left, topRadius, above + byLeft, topSky, 0, 0);
	const topRight = put(right, topRadius, above + byRight, topSky, 1, 0);
	const bottomRight = put(
		right,
		bottomRadius,
		under + byRight,
		bottomSky,
		1,
		runs,
	);
	const bottomLeft = put(
		left,
		bottomRadius,
		under + byLeft,
		bottomSky,
		0,
		runs,
	);

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
