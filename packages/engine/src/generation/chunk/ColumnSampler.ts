import type { Column } from "./Column.js";

/**
 * Where a mesher reads blocks from.
 *
 * A whole column rather than a cell, because every consumer walks downward: the
 * six neighbours of a cell are resolved once and then read at every layer, so
 * the address arithmetic happens once per column instead of once per layer.
 *
 * The same address returns the same object, so a caller may hold one and a
 * consumer may key a cache on it.
 */
export interface ColumnSampler {
	columnAt(face: number, i: number, j: number): Column;
}
