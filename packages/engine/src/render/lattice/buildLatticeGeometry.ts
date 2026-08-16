import type { Geometry } from "../../mesh/Geometry.js";
import { cellCorners } from "../../addressing/lattice/cellCorners.js";
import { cellKey } from "../../addressing/lattice/cellKey.js";
import { latticePosition } from "../../addressing/lattice/latticePosition.js";
import { pentagonVertex } from "../../addressing/neighbours/pentagonVertex.js";

/**
 * The twelve pentagons, picked out against the faces.
 *
 * They are the only cells with five sides, one per icosahedron vertex, and no
 * amount of subdivision adds or removes one. Coloring them says at a glance
 * that there are twelve and that they sit where the geometry puts them.
 */
const PENTAGON_COLOR: readonly [number, number, number] = [0.86, 0.16, 0.2];

/** Twenty hues spread round the wheel, so neighbouring faces never share one. */
function faceColor(face: number): [number, number, number] {
	// A step of 7 lands on a different part of the wheel each time, and 7 is
	// coprime with 20, so all twenty are used before any repeats.
	const hue = ((face * 7) % 20) / 20;
	const s = 0.45;
	const v = 0.95;
	const h = hue * 6;
	const c = v * s;
	const x = c * (1 - Math.abs((h % 2) - 1));
	const m = v - c;
	const t: [number, number, number] =
		h < 1
			? [c, x, 0]
			: h < 2
				? [x, c, 0]
				: h < 3
					? [0, c, x]
					: h < 4
						? [0, x, c]
						: h < 5
							? [x, 0, c]
							: [c, 0, x];
	return [t[0] + m, t[1] + m, t[2] + m];
}

/**
 * Every cell at one subdivision level, as one polygon each.
 *
 * A cell is drawn as a fan from its first corner, so a hexagon costs four
 * triangles and a pentagon three. Each cell keeps its own copy of the corners
 * rather than sharing them, because the color is per cell.
 *
 * Cells are emitted once. A cell on a face edge is named by two faces and would
 * otherwise be drawn twice, in two colors, with the second flickering over the
 * first.
 */
export function buildLatticeGeometry(depth: number, radius: number): Geometry {
	const n = 1 << depth;
	const verts: number[] = [];
	const indices: number[] = [];
	const seen = new Set<string>();
	let cells = 0;
	let triangles = 0;

	for (let face = 0; face < 20; face++)
		for (let i = 0; i <= n; i++)
			for (let j = 0; i + j <= n; j++) {
				const key = cellKey(face, n, i, j);
				if (seen.has(key)) continue;
				seen.add(key);

				const corners = cellCorners(face, n, i, j);
				const centre = latticePosition(face, n, i, j);
				const [r, g, b] =
					pentagonVertex(face, n, i, j) >= 0
						? PENTAGON_COLOR
						: faceColor(face);
				// A slight lift toward the cell centre keeps neighbouring polygons
				// from meeting exactly on the same plane, where the depth test has
				// no ordering to work with.
				const base = verts.length / 6;
				for (const c of corners) {
					const lift =
						1 +
						0.0004 *
							(c.x * centre.x + c.y * centre.y + c.z * centre.z);
					verts.push(
						c.x * radius * lift,
						c.y * radius * lift,
						c.z * radius * lift,
						r,
						g,
						b,
					);
				}
				for (let k = 1; k + 1 < corners.length; k++) {
					indices.push(base, base + k, base + k + 1);
					triangles++;
				}
				cells++;
			}

	return {
		vertices: Float32Array.from(verts),
		indices: Uint32Array.from(indices),
		cellCount: cells,
		triangleCount: triangles,
	};
}
