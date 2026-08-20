import type { GridPaint } from "./GridPaint.js";
import { hash3 } from "../generation/noise/hash3.js";

/** Offset from the world seed, so the speckle is not the terrain's. */
const GRID_SEED_OFFSET = 5;

/** How far a cell's shade drifts from its chunk's base, when cells show. */
const SPECKLE = 0.12;

/** The base when levels are off: one light grey for the whole shell. */
const PLAIN: readonly [number, number, number] = [0.62, 0.63, 0.66];

/**
 * One flat color for a grid cell.
 *
 * The chunk's level of detail picks the base -- the same teal-to-violet ramp
 * the subdivision demo uses, teal at full detail -- and the cell's own address
 * moves the shade, which is what makes the hexagons legible on a shell where
 * every cell is otherwise identical. The offset comes from the integer hash,
 * so a cell is the same color on every machine and on every frame.
 */
export function gridCellColor(
	grid: GridPaint,
	face: number,
	i: number,
	j: number,
	seed: number,
	out: Float32Array,
	at: number,
): void {
	if (grid.levels) {
		const t = grid.finest > 0 ? Math.min(1, grid.lod / grid.finest) : 0;
		ramp(t, out, at);
	} else {
		out[at] = PLAIN[0];
		out[at + 1] = PLAIN[1];
		out[at + 2] = PLAIN[2];
	}
	if (!grid.cells) return;
	const noise =
		hash3(face * 8191 + i, j, i ^ j, (seed + GRID_SEED_OFFSET) | 0) - 0.5;
	const shade = 1 + noise * 2 * SPECKLE;
	out[at] = out[at]! * shade;
	out[at + 1] = out[at + 1]! * shade;
	out[at + 2] = out[at + 2]! * shade;
}

/**
 * The demo's level ramp -- hue 150 to 260, thinning and darkening -- as red,
 * green and blue. The piecewise-linear HSL form, no transcendentals.
 */
function ramp(t: number, out: Float32Array, at: number): void {
	const hue = (150 + 110 * t) / 60;
	const saturation = 0.7 - 0.25 * t;
	const lightness = 0.62 - 0.18 * t;
	const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
	const x = chroma * (1 - Math.abs((hue % 2) - 1));
	const base = lightness - chroma / 2;
	const sector = Math.floor(hue);
	const rgb =
		sector === 2
			? [0, chroma, x]
			: sector === 3
				? [0, x, chroma]
				: [x, 0, chroma];
	out[at] = rgb[0]! + base;
	out[at + 1] = rgb[1]! + base;
	out[at + 2] = rgb[2]! + base;
}
