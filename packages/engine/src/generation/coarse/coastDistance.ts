import type { CoarseGrid } from "./CoarseGrid.js";

/**
 * How many steps each cell is from the nearest coast, negative at sea and
 * positive on land.
 *
 * One breadth-first walk outward from every cell that touches a cell of the
 * other kind. Every cell is reached, because a mask with any coast at all has
 * the whole surface within reach of one, and a mask with none is handed back
 * unchanged at one step.
 *
 * Counting steps rather than adding real distances measures a slightly
 * different length in different parts of the sphere, where cell spacing varies
 * `1.41:1`. Nothing here is read in metres, so that spread is a property of the
 * count rather than an error in it.
 */
export function coastDistance(grid: CoarseGrid, mask: Uint8Array): Int32Array {
	const distance = new Int32Array(grid.count);
	const seen = new Uint8Array(grid.count);
	let wave: number[] = [];

	for (let cell = 0; cell < grid.count; cell++)
		for (let k = 0; k < 6; k++) {
			const other = grid.ring[cell * 6 + k]!;
			if (other < 0 || mask[other] === mask[cell]) continue;
			seen[cell] = 1;
			wave.push(cell);
			break;
		}

	let step = 0;
	while (wave.length) {
		step++;
		const next: number[] = [];
		for (const cell of wave)
			for (let k = 0; k < 6; k++) {
				const other = grid.ring[cell * 6 + k]!;
				if (other < 0 || seen[other]) continue;
				seen[other] = 1;
				distance[other] = step;
				next.push(other);
			}
		wave = next;
	}

	for (let cell = 0; cell < grid.count; cell++)
		distance[cell] = mask[cell]
			? distance[cell]! + 1
			: -(distance[cell]! + 1);
	return distance;
}
