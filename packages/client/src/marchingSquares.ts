/**
 * One contour of a field sampled on a square grid.
 *
 * Sixteen cases, of which two are saddles where the same four corners admit two
 * different curves. They are settled by the average of the four, which is the
 * cheapest rule that at least decides the two the same way -- a curve that
 * turned one saddle one way and its neighbour the other would cross itself.
 *
 * `emit` is handed the two ends of one segment, in grid coordinates: whole
 * numbers are sample points and a fraction is how far between two of them the
 * level was crossed.
 */
export function marchingSquares(
	grid: Float32Array,
	width: number,
	height: number,
	level: number,
	emit: (a: readonly [number, number], b: readonly [number, number]) => void,
): void {
	const point = (
		ax: number,
		ay: number,
		av: number,
		bx: number,
		by: number,
		bv: number,
	): [number, number] => {
		const t = (level - av) / (bv - av || 1e-9);
		return [ax + (bx - ax) * t, ay + (by - ay) * t];
	};
	for (let y = 0; y < height - 1; y++) {
		for (let x = 0; x < width - 1; x++) {
			const a = grid[y * width + x]!;
			const b = grid[y * width + x + 1]!;
			const c = grid[(y + 1) * width + x + 1]!;
			const d = grid[(y + 1) * width + x]!;
			let code = 0;
			if (a > level) code |= 1;
			if (b > level) code |= 2;
			if (c > level) code |= 4;
			if (d > level) code |= 8;
			if (code === 0 || code === 15) continue;
			const e0 = (): [number, number] => point(x, y, a, x + 1, y, b);
			const e1 = (): [number, number] =>
				point(x + 1, y, b, x + 1, y + 1, c);
			const e2 = (): [number, number] =>
				point(x + 1, y + 1, c, x, y + 1, d);
			const e3 = (): [number, number] => point(x, y + 1, d, x, y, a);
			const middle = (a + b + c + d) / 4 > level;
			switch (code) {
				case 1:
				case 14:
					emit(e3(), e0());
					break;
				case 2:
				case 13:
					emit(e0(), e1());
					break;
				case 3:
				case 12:
					emit(e3(), e1());
					break;
				case 4:
				case 11:
					emit(e1(), e2());
					break;
				case 6:
				case 9:
					emit(e0(), e2());
					break;
				case 7:
				case 8:
					emit(e2(), e3());
					break;
				case 5:
					if (middle) {
						emit(e3(), e0());
						emit(e1(), e2());
					} else {
						emit(e0(), e1());
						emit(e2(), e3());
					}
					break;
				case 10:
					if (middle) {
						emit(e0(), e1());
						emit(e2(), e3());
					} else {
						emit(e3(), e0());
						emit(e1(), e2());
					}
					break;
			}
		}
	}
}
