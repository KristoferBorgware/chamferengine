import type { CoarseGrid } from "../generation/coarse/CoarseGrid.js";
import { CELL_CONSTANT } from "../world/CELL_CONSTANT.js";
import { Vec3 } from "../math/Vec3.js";
import { cellCorners } from "../addressing/lattice/cellCorners.js";
import { neighbour } from "../addressing/neighbours/neighbour.js";

/** Where a patch stands and how wide it is, which is all its shape depends on. */
export interface PatchPlace {
	/** The middle of the patch, as a unit direction. */
	readonly at: Vec3;

	/** How many cells across the patch is. */
	readonly cells: number;

	/** The planet's radius in metres, which turns an angle into a distance. */
	readonly radius: number;
}

/**
 * Everything about a patch that the ground under it does not decide.
 *
 * Which cells it holds, where their corners sit, which cells meet at each of
 * them, and every triangle and rim line. All of it answers to where the patch
 * stands and how wide it is, so a knob that moves the ground leaves the whole
 * of it standing and only four floats a vertex change.
 */
export interface PatchLayout {
	/** Metres from one side of the patch to the other. */
	readonly span: number;

	readonly cellCount: number;
	readonly triangleCount: number;

	/** Triangles, three indices each, and the rim of every cell for the wireframe. */
	readonly indices: Uint32Array<ArrayBuffer>;
	readonly lines: Uint32Array<ArrayBuffer>;

	/** Which map cell each cell of the patch is, for the numbers read per cell. */
	readonly cells: Int32Array;

	/** Per vertex: whose cell's numbers it carries. */
	readonly of: Int32Array;

	/**
	 * Per vertex: the up to three cells whose heights meet there, `-1` for none.
	 *
	 * A corner is where three cells meet and is drawn at the height of all
	 * three, which is the blend the terrain generator reads the map with; a
	 * cell's own middle names itself and nothing else. One rule for both, so
	 * the fill has no case in it.
	 */
	readonly corners: Int32Array;

	/** Per vertex: east and north in metres from the middle of the patch. */
	readonly flat: Float32Array;
}

/** The three axes of the patch: out of the ground, east, and north. */
function frameAt(at: Vec3): { up: Vec3; east: Vec3; north: Vec3 } {
	const up = at.normalize();
	// Any axis not parallel to `up` gives an east; the planet's own poles are
	// the one place that has to be avoided, and the cross product with the
	// polar axis is what does it everywhere else.
	const pole = new Vec3(0, 1, 0);
	const along = Math.abs(up.dot(pole)) > 0.999 ? new Vec3(1, 0, 0) : pole;
	const east = along.cross(up).normalize();
	return { up, east, north: up.cross(east).normalize() };
}

/**
 * The shape of a patch of the surface, one hexagon per map cell.
 *
 * Cells are chosen by direction rather than by walking a face's lattice, so a
 * patch straddling one of the thirty face edges is drawn whole and needs no
 * case of its own -- and a patch over one of the twelve icosahedron vertices
 * gets its pentagon. That costs a pass over the grid, which is one dot product
 * a cell.
 *
 * **This is the expensive half and the half that hardly ever changes.** The
 * scan is 660,000 dot products at level 8 and every selected cell costs a
 * `cellCorners` and six `neighbour` calls; measured in the browser it is about
 * `130 ms` of what used to be a `410 ms` live update. A knob that moves the
 * ground does not move any of it.
 */
export function patchLayout(grid: CoarseGrid, place: PatchPlace): PatchLayout {
	const { at, cells, radius } = place;
	const n = grid.n;
	const frame = frameAt(at);
	// One cell is `CELL_CONSTANT * radius / n` metres across, so it subtends
	// that over the radius: the width asked for in cells becomes an angle
	// without the radius entering it at all.
	const cellArc = CELL_CONSTANT / n;
	const reach = Math.cos((cells / 2) * cellArc);
	const span = cells * cellArc * radius;

	const held: number[] = [];
	const of: number[] = [];
	const corners: number[] = [];
	const flatOf: number[] = [];
	const tris: number[] = [];
	const lines: number[] = [];

	/** A direction, in the patch's own flat frame, in metres. */
	const flatten = (d: Vec3, out: [number, number]): void => {
		const e = d.dot(frame.east);
		const north = d.dot(frame.north);
		const up = d.dot(frame.up);
		const across = Math.sqrt(e * e + north * north);
		// The inverse of the map the patch is laid out by: metres out from the
		// middle are an arc, so the scale holds to the corners rather than
		// stretching the way a flat projection does.
		const angle = Math.atan2(across, up);
		const scale = across < 1e-12 ? 0 : (radius * angle) / across;
		out[0] = e * scale;
		out[1] = north * scale;
	};

	const flat: [number, number] = [0, 0];
	const seen = new Set<number>();
	for (let face = 0; face < 20; face++)
		for (let i = 0; i <= n; i++)
			for (let j = 0; i + j <= n; j++) {
				const cell = grid.indexOf(face, i, j);
				if (cell < 0 || seen.has(cell)) continue;
				// The grid already holds every cell's direction, so choosing the
				// patch is one dot product a cell and no geometry at all.
				const mx = grid.directions[cell * 3]!;
				const my = grid.directions[cell * 3 + 1]!;
				const mz = grid.directions[cell * 3 + 2]!;
				if (mx * at.x + my * at.y + mz * at.z < reach) continue;
				seen.add(cell);
				held.push(cell);
				const middle = new Vec3(mx, my, mz);

				const rim = cellCorners(face, n, i, j);
				const degree = rim.length;

				// The cell's own middle, then its rim. Every vertex of a cell
				// carries that cell's numbers, so the bands read per cell the
				// way the world builds them.
				const base = of.length;
				const put = (a: number, b: number, c: number): void => {
					of.push(cell);
					corners.push(a, b, c);
					flatOf.push(flat[0], flat[1]);
				};
				flatten(middle, flat);
				put(cell, -1, -1);
				for (let k = 0; k < degree; k++) {
					const a = neighbour(face, n, i, j, k);
					const b = neighbour(face, n, i, j, (k + 1) % degree);
					flatten(rim[k]!, flat);
					put(
						cell,
						a ? grid.indexOf(a.face, a.i, a.j) : -1,
						b ? grid.indexOf(b.face, b.i, b.j) : -1,
					);
				}
				for (let k = 0; k < degree; k++) {
					const one = base + 1 + k;
					const two = base + 1 + ((k + 1) % degree);
					tris.push(base, one, two);
					lines.push(one, two);
				}
			}

	return {
		span,
		cellCount: held.length,
		triangleCount: tris.length / 3,
		indices: Uint32Array.from(tris),
		lines: Uint32Array.from(lines),
		cells: Int32Array.from(held),
		of: Int32Array.from(of),
		corners: Int32Array.from(corners),
		flat: Float32Array.from(flatOf),
	};
}
