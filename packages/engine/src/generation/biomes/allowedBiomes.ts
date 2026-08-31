import type { BiomeDef } from "./BiomeDef.js";
import { ANY_LANDFORM, LANDFORMS, SHORE } from "./Landform.js";

/**
 * The biomes each landform may build, as indices into the table.
 *
 * Built once whenever the table changes rather than filtered at every lookup:
 * a picture asks the lookup per pixel.
 *
 * **A biome filed under a landform joins that landform's list; it does not
 * replace it.** So a table of climate zones filed under no landform is what
 * every landform chooses between, and one filed under `peaks` is a
 * twenty-fourth dot on the summits alone -- it wins where its own climate is
 * nearest and changes nothing anywhere else, which is what keeps a border
 * where the climate put it.
 *
 * **The shore is the exception, and takes only its own.** It is already the
 * landform the model treats apart: `landformAt` returns it from a height and
 * a room count before the grid is consulted, and the grid has no cell for
 * it. It is also the one landform named by a material rather than a climate
 * -- a strand is sand or shingle at any latitude -- and at roughly a
 * hundredth of the land its border is the coastline, which is a line a
 * reader wants drawn. Measured, a shore biome merely added to the twenty-
 * three life zones won `7.3%` of the shore at its best placement, because
 * the temperate, damp corner a coast reads is the most crowded part of the
 * square; taking the shore outright is what makes a beach a beach. A table
 * that files nothing under `shore` is unaffected and falls back to the
 * zones.
 */
export function allowedBiomes(biomes: readonly BiomeDef[]): number[][] {
	const ownShore = biomes.some((biome) => biome.landform === "shore");
	return LANDFORMS.map((form, at) => {
		const only = at === SHORE && ownShore;
		const out: number[] = [];
		for (let b = 0; b < biomes.length; b++) {
			const filed = biomes[b]!.landform;
			if (filed === form.key || (!only && filed === ANY_LANDFORM))
				out.push(b);
		}
		return out;
	});
}
