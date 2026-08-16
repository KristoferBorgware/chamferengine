/** A lattice point named by a face and an offset inside it. */
export interface FaceCell {
	readonly face: number;
	readonly i: number;
	readonly j: number;
}
