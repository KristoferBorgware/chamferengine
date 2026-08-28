import { describe, expect, it } from "vitest";
import { DIRECTIONS, cellOffset, neighbour } from "chamfer/addressing";

const N = 64;

describe("cellOffset", () => {
	// Inside a face there is nothing to repair, and the answer has to be the
	// plain addition or a template would be drawn somewhere else.
	it("adds the step straight on, well inside a face", () => {
		for (let i = 10; i < 40; i += 7)
			for (let j = 10; i + j < 50; j += 5)
				for (const [di, dj] of [
					[3, 4],
					[-5, 2],
					[0, -7],
					[6, -6],
				]) {
					const got = cellOffset(3, N, i, j, di!, dj!);
					expect(got).toEqual({ face: 3, i: i + di!, j: j + dj! });
				}
	});

	// One step is what `neighbour` already answers, including the reflection
	// off a face edge -- so the two have to agree everywhere but the pentagons,
	// whose ring is five long and is not a step in `(i, j)` at all.
	it("agrees with a single neighbour step, across faces too", () => {
		let crossed = 0;
		for (let face = 0; face < 20; face++)
			for (let i = 0; i <= N; i++)
				for (let j = 0; i + j <= N; j++) {
					const corner =
						(i === 0 && j === 0) ||
						(i === N && j === 0) ||
						(i === 0 && j === N);
					if (corner) continue;
					for (let d = 0; d < 6; d++) {
						const step = DIRECTIONS[d]!;
						const one = neighbour(face, N, i, j, d);
						const got = cellOffset(face, N, i, j, step[0], step[1]);
						expect(one).not.toBeNull();
						expect(got).toEqual(one);
						if (got.face !== face) crossed++;
					}
				}
		// The test is only worth having if it left the face it started on.
		expect(crossed).toBeGreaterThan(100);
	});

	// A shape stamped anywhere has to name a real cell, however far off the
	// face its offsets fall -- which is the whole reason this exists.
	it("never names a cell outside a face, wherever it starts", () => {
		for (let face = 0; face < 20; face++)
			for (let i = 0; i <= N; i += 3)
				for (let j = 0; i + j <= N; j += 3)
					for (const [di, dj] of [
						[12, 9],
						[-14, 3],
						[7, -18],
						[-9, -9],
						[20, 20],
					]) {
						const got = cellOffset(face, N, i, j, di!, dj!);
						expect(got.i).toBeGreaterThanOrEqual(0);
						expect(got.j).toBeGreaterThanOrEqual(0);
						expect(got.i + got.j).toBeLessThanOrEqual(N);
						expect(got.face).toBeGreaterThanOrEqual(0);
						expect(got.face).toBeLessThan(20);
					}
	});
});
