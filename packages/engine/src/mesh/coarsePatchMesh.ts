import type { CoarseGrid } from "../generation/coarse/CoarseGrid.js";
import type { PatchGeometry } from "./PatchGeometry.js";
import { CELL_CONSTANT } from "../world/CELL_CONSTANT.js";
import { PATCH_STRIDE } from "./PatchGeometry.js";
import { Vec3 } from "../math/Vec3.js";
import { cellCorners } from "../addressing/lattice/cellCorners.js";
import { neighbour } from "../addressing/neighbours/neighbour.js";

/** What the patch is cut from, and how it is laid out. */
export interface PatchOptions {
	/** The middle of the patch, as a unit direction. */
	readonly at: Vec3;

	/** How many cells across the patch is. */
	readonly cells: number;

	/** The planet's radius in metres, which turns an angle into a distance. */
	readonly radius: number;

	/** How much taller than the world the ground is drawn. */
	readonly exaggeration: number;

	/** The ground in metres above sea level, one value per cell. */
	readonly height: Float32Array;

	/** The field before sea level was taken off it, one value per cell. */
	readonly raw: Float32Array;

	/** Whichever control layer the picture is showing, one value per cell. */
	readonly layer: Float32Array;
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
 * A patch of the surface, one hexagon per map cell.
 *
 * Cells are chosen by direction rather than by walking a face's lattice, so a
 * patch straddling one of the thirty face edges is drawn whole and needs no
 * case of its own -- and a patch over one of the twelve icosahedron vertices
 * gets its pentagon. That costs a pass over the grid, which is one dot product
 * a cell.
 *
 * **A corner is where three cells meet, and it is drawn at the height of all
 * three.** The generator reads the map as a blend of the three samples around
 * a point, so a surface whose corners are that same blend is the ground the
 * world would build; giving each hexagon one flat height would draw a terrace
 * the world does not have. What stays per cell is the **colour**, because the
 * material bands are per cell in the world too.
 */
export function coarsePatchMesh(
	grid: CoarseGrid,
	options: PatchOptions,
): PatchGeometry {
	const { at, cells, radius, exaggeration, height, raw, layer } = options;
	const n = grid.n;
	const frame = frameAt(at);
	// One cell is `CELL_CONSTANT * radius / n` metres across, so it subtends
	// that over the radius: the width asked for in cells becomes an angle
	// without the radius entering it at all.
	const cellArc = CELL_CONSTANT / n;
	const reach = Math.cos((cells / 2) * cellArc);
	const span = cells * cellArc * radius;

	const corners: number[] = [];
	const tris: number[] = [];
	const lines: number[] = [];
	let cellCount = 0;
	let lowest = Infinity;
	let highest = -Infinity;
	let rawLow = Infinity;
	let rawHigh = -Infinity;
	let land = 0;

	// The height at a corner: the three cells that meet there, which is the
	// blend the terrain generator reads the map with.
	const cornerHeight = (
		face: number,
		i: number,
		j: number,
		a: { face: number; i: number; j: number } | null,
		b: { face: number; i: number; j: number } | null,
	): number => {
		let sum = height[grid.indexOf(face, i, j)]!;
		let count = 1;
		if (a) {
			sum += height[grid.indexOf(a.face, a.i, a.j)]!;
			count++;
		}
		if (b) {
			sum += height[grid.indexOf(b.face, b.i, b.j)]!;
			count++;
		}
		return sum / count;
	};

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
				const middle = new Vec3(mx, my, mz);

				const rim = cellCorners(face, n, i, j);
				const degree = rim.length;
				const metres = height[cell]!;
				const unitless = raw[cell]!;
				const control = layer[cell]!;
				if (metres < lowest) lowest = metres;
				if (metres > highest) highest = metres;
				if (unitless < rawLow) rawLow = unitless;
				if (unitless > rawHigh) rawHigh = unitless;
				if (metres > 0) land++;

				// The cell's own middle, then its rim. Every vertex of a cell
				// carries that cell's numbers, so the bands read per cell the
				// way the world builds them.
				const base = corners.length / PATCH_STRIDE;
				flatten(middle, flat);
				// The normal starts at nothing and every triangle round the
				// cell adds its own, so what comes out is the cell's own plane.
				const push = (x: number, y: number, z: number): void => {
					corners.push(x, y, z, 0, 0, 0, metres, unitless, control);
				};
				push(flat[0], metres * exaggeration, flat[1]);
				for (let k = 0; k < degree; k++) {
					const a = neighbour(face, n, i, j, k);
					const b = neighbour(face, n, i, j, (k + 1) % degree);
					flatten(rim[k]!, flat);
					push(
						flat[0],
						cornerHeight(face, i, j, a, b) * exaggeration,
						flat[1],
					);
				}
				for (let k = 0; k < degree; k++) {
					const one = base + 1 + k;
					const two = base + 1 + ((k + 1) % degree);
					tris.push(base, one, two);
					lines.push(one, two);
				}
				cellCount++;
			}

	const vertices = Float32Array.from(corners);
	// A flat normal per triangle would need its own vertices; these are shared
	// round a cell, so the normal is the cell's own plane -- which is the slope
	// of the ground there and is what the light is wanted for.
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
		const nx = uy * vz - uz * vy;
		const ny = uz * vx - ux * vz;
		const nz = ux * vy - uy * vx;
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

	return {
		vertices,
		indices: Uint32Array.from(tris),
		lines: Uint32Array.from(lines),
		cellCount,
		triangleCount: tris.length / 3,
		span,
		lowest: cellCount ? lowest : 0,
		highest: cellCount ? highest : 0,
		rawLow: cellCount ? rawLow : 0,
		rawHigh: cellCount ? rawHigh : 0,
		landShare: cellCount ? land / cellCount : 0,
	};
}
