import type { BiomeDef } from "./BiomeDef.js";

/**
 * Which biome a climate lands in on one kind of ground: the nearest dot among
 * the ones that ground allows, and nothing else.
 *
 * **Nearest point, not a table of ranges.** A range table has to name a biome
 * for every cell of a grid and a cell nobody filled in is a hole; a Voronoi
 * diagram has no holes by construction, and every edge in it is the
 * perpendicular bisector between two dots, so a border moves when either of
 * the two biomes it separates moves.
 *
 * A landform with no biome at all has no answer and returns `-1`, which a
 * bench refuses to let happen by declining to remove a landform's last biome.
 */
export function biomeOf(
	t: number,
	h: number,
	allowed: readonly number[] | undefined,
	biomes: readonly BiomeDef[],
): number {
	if (!allowed || allowed.length === 0) return -1;
	let best = allowed[0]!;
	let near = Infinity;
	for (let n = 0; n < allowed.length; n++) {
		const b = biomes[allowed[n]!]!;
		const dt = t - b.t;
		const dh = h - b.h;
		const d = dt * dt + dh * dh;
		if (d < near) {
			near = d;
			best = allowed[n]!;
		}
	}
	return best;
}
