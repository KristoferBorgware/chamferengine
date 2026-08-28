import type { CaveDraw } from "./PatchLook.js";
import type { CaveVolume } from "./caveVolume.js";
import type { ColumnGround } from "chamfer/mesh";
import { ROCK, VOID } from "./CaveBlock.js";

/**
 * The volume as runs of heights, which is what a column mesher takes.
 *
 * **A column is a list of heights, not one height.** With nothing carved a
 * column holds exactly one pair and the mesh is the height field it always was;
 * with a sheet running through it a column can hold three or five, and rock
 * over air over rock is a shape one number could not hold at all.
 *
 * **Drawing the void is the same mesher with the other byte counted as
 * filled.** A cave is a hole, and a picture of the rock around a hole says
 * where the rock is; turning the world inside out is the only view that shows
 * the shape of a network from outside it.
 *
 * The one thing the void view needs that the rock view does not is a **floor**.
 * The mesher gives a column's lowest run no bottom cap -- underneath it is the
 * bedrock the walk started from -- so a stack of passages drawn with no floor
 * would hang open at the deepest one. A block of the crust's own bottom is put
 * under them, which is where the caves stand anyway.
 */
export function caveSpans(volume: CaveVolume, draw: CaveDraw): ColumnGround {
	const { count, layers, kind, topLayer, blockMetres } = volume;
	const filled = draw === "void" ? VOID : ROCK;
	const at = new Int32Array(count + 1);
	const height = new Float64Array(count);
	const all: number[] = [];

	for (let c = 0; c < count; c++) {
		at[c] = all.length;
		const base = c * layers;
		const top = topLayer[c]!;
		// Written from the bottom up, because the mesher reads a column's runs
		// low to high and the walk is stored the other way round.
		const bottom = (top - layers + 1) * blockMetres;
		if (filled === VOID) all.push(bottom, bottom + blockMetres);
		let from = Number.NaN;
		for (let L = layers - 1; L >= 0; L--) {
			const y = (top - L) * blockMetres;
			const solid = kind[base + L] === filled;
			if (solid && from !== from) from = y;
			if (!solid && from === from) {
				all.push(from, y);
				from = Number.NaN;
			}
		}
		if (from === from) all.push(from, (top + 1) * blockMetres);
		height[c] =
			all.length > at[c]! ? all[all.length - 1]! : volume.surface[c]!;
		// **Two runs that meet are one run.** The floor block and a passage
		// standing on it share a boundary, and a mesher handed both would draw
		// a cap and a floor in one plane.
		for (let pair = at[c]! + 2; pair < all.length; pair += 2)
			if (all[pair]! <= all[pair - 1]!) {
				all[pair - 1] = all[pair + 1]!;
				all.splice(pair, 2);
				pair -= 2;
			}
	}
	at[count] = all.length;

	return {
		at,
		spans: Float64Array.from(all),
		height,
		raw: volume.raw as Float32Array,
		continent: volume.continent as Float32Array,
		erosion: volume.erosion as Float32Array,
		peaks: volume.peaks as Float32Array,
		carve: volume.carve as Float32Array,
	};
}
