/** A cell taken apart into the fields the word carries. */
export interface CellFields {
	readonly planet: number;
	readonly face: number;
	readonly i: number;
	readonly j: number;
	readonly layer: number;
}
