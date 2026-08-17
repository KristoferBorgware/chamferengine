import type { Column } from "./Column.js";
import { BlockType } from "../terrain/BlockType.js";

/** Wrap a column's blocks with the band anything can happen in. */
export function columnBand(blocks: Uint16Array): Column {
	let first = blocks.length;
	for (let layer = 0; layer < blocks.length; layer++)
		if (blocks[layer] !== BlockType.AIR) {
			first = layer;
			break;
		}

	let last = -1;
	for (let layer = blocks.length - 1; layer >= 0; layer--) {
		const block = blocks[layer]!;
		if (block === BlockType.AIR || block === BlockType.WATER) {
			last = layer;
			break;
		}
	}
	return { blocks, first, last, groundRadius: 0, waterRadius: 0 };
}
