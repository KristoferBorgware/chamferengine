import type { ChunkDeltas } from "./ChunkDeltas.js";

/**
 * One chunk's records together with the chunk they were written under.
 *
 * A slot is a rank inside a triangle, so it names a cell only alongside the
 * chunk it was counted in. A chunk being built reads its own records and those
 * of the chunks whose border cells it also holds, so what travels is a list of
 * rows rather than one, and each row carries its own key.
 */
export interface ChunkRow {
	readonly chunkKey: number;
	readonly deltas: ChunkDeltas;
}
