/**
 * How fast the line between day and night crosses the ground, in metres a
 * second.
 *
 * One circumference every day. On a planet this small that is a walking pace
 * for a day of about two hours, and below that a player outruns the sun and can
 * hold a sunrise in place by walking west.
 */
export function terminatorSpeed(radius: number, dayLength: number): number {
	return (2 * Math.PI * radius) / dayLength;
}
