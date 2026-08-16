/**
 * One triangle at the chunk level: a face, and the path of quaternary digits
 * that walks down to it.
 *
 * The path names a triangle, which is what a chunk is. A cell is a vertex, so
 * a chunk's cells are named by an offset inside the triangle rather than by
 * more path digits.
 *
 * `key` packs the two into one number for use as a map key and a sort order.
 * Chunks sort into the same order their cell IDs do, so a run of nearby chunks
 * is a run of consecutive keys.
 */
export class ChunkAddress {
	readonly face: number;
	readonly path: readonly number[];
	readonly key: number;

	constructor(face: number, path: readonly number[]) {
		this.face = face;
		this.path = path;
		let value = 0;
		for (const digit of path) value = value * 4 + digit;
		this.key = face * 4 ** path.length + value;
	}

	/** Take a key apart again, given the level it was packed at. */
	static fromKey(key: number, chunkLevel: number): ChunkAddress {
		const span = 4 ** chunkLevel;
		const face = Math.floor(key / span);
		let value = key % span;
		const path: number[] = new Array<number>(chunkLevel);
		for (let level = chunkLevel - 1; level >= 0; level--) {
			path[level] = value % 4;
			value = Math.floor(value / 4);
		}
		return new ChunkAddress(face, path);
	}

	/** How many chunks cover the planet at a level. */
	static countAt(chunkLevel: number): number {
		return 20 * 4 ** chunkLevel;
	}
}
