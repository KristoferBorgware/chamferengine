/**
 * One layer's own offset from the world seed.
 *
 * Taken from the layer's id, which is handed out once and travels in a link, so
 * a layer keeps its own forest for as long as it exists. The multiplier is a
 * prime well clear of any octave offset, so two layers a few ids apart share no
 * lattice.
 */
export function plantSalt(id: number): number {
	return 909 + id * 7919;
}
