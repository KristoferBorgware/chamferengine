/**
 * Read a curve at one point: straight between the control points, flat past
 * either end.
 *
 * The points are `[in, out]` pairs in ascending `in` order. Linear rather than
 * smooth on purpose -- the curve is dragged by hand and a smooth interpolant
 * overshoots between two points that were placed exactly where they are wanted,
 * which draws ground nobody asked for.
 */
export function splineAt(
	points: readonly (readonly [number, number])[],
	at: number,
): number {
	if (points.length === 0) return 0;
	const first = points[0]!;
	if (at <= first[0]) return first[1];
	const last = points[points.length - 1]!;
	if (at >= last[0]) return last[1];
	for (let n = 1; n < points.length; n++) {
		const [x1, y1] = points[n]!;
		if (at > x1) continue;
		const [x0, y0] = points[n - 1]!;
		const span = x1 - x0;
		if (span <= 1e-9) return y1;
		return y0 + ((y1 - y0) * (at - x0)) / span;
	}
	return last[1];
}
