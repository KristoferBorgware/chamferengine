/** One ball to draw, in world space. */
export interface BoundsBall {
	readonly center: readonly [number, number, number];
	readonly radius: number;
	readonly color: readonly [number, number, number];
}
