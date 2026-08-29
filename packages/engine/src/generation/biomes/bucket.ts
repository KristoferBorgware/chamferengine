/**
 * Which band of a set of edges a reading falls in.
 *
 * Edges are ascending; a reading past the last edge lands in the last band, so
 * every value has a band and none has two.
 */
export function bucket(value: number, edges: readonly number[]): number {
	let band = 0;
	while (band < edges.length && value > edges[band]!) band++;
	return band;
}
