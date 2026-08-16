/**
 * What a player asks the world about.
 *
 * A block at a point, which is a cell lookup and a read. Collision and floating
 * are both this question: water is a block like any other, so there is no
 * second kind of thing to test against.
 */
export interface BlockProbe {
	blockAtPosition(position: {
		readonly x: number;
		readonly y: number;
		readonly z: number;
	}): number;
}
