import type { BiomeDef } from "./BiomeDef.js";
import { ANY_LANDFORM, LANDFORMS } from "./Landform.js";

/**
 * The biomes each landform may build, as indices into the table.
 *
 * Built once whenever the table changes rather than filtered at every lookup:
 * a picture asks the lookup per pixel.
 */
export function allowedBiomes(biomes: readonly BiomeDef[]): number[][] {
	return LANDFORMS.map((form) => {
		const out: number[] = [];
		for (let b = 0; b < biomes.length; b++) {
			const filed = biomes[b]!.landform;
			if (filed === form.key || filed === ANY_LANDFORM) out.push(b);
		}
		return out;
	});
}
