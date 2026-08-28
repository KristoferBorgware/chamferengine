import { describe, expect, it } from "vitest";
import { DIRECTIONS, cellOffset, neighbour } from "chamfer/addressing";

const N = 64;

/**
 * The first cell where two answers differ, or nothing.
 *
 * **Counted rather than asserted, one assertion at the end.** These walks cover
 * every cell of every face in every direction, and an `expect` inside that loop
 * costs more than the arithmetic it is checking: at a quarter of a million
 * comparisons it turns a test that measures the code into one that measures
 * the test runner.
 */
type Wrong = { where: string; got: string; wanted: string } | null;

describe("cellOffset", () => {
	// Inside a face there is nothing to repair, and the answer has to be the
	// plain addition or a template would be drawn somewhere else.
	it("adds the step straight on, well inside a face", () => {
		let wrong: Wrong = null;
		for (let i = 10; i < 40 && !wrong; i += 7)
			for (let j = 10; i + j < 50 && !wrong; j += 5)
				for (const [di, dj] of [
					[3, 4],
					[-5, 2],
					[0, -7],
					[6, -6],
				]) {
					const got = cellOffset(3, N, i, j, di!, dj!);
					if (
						got.face !== 3 ||
						got.i !== i + di! ||
						got.j !== j + dj!
					) {
						wrong = {
							where: `3,${i},${j} + ${di},${dj}`,
							got: `${got.face},${got.i},${got.j}`,
							wanted: `3,${i + di!},${j + dj!}`,
						};
						break;
					}
				}
		expect(wrong).toBeNull();
	});

	// One step is what `neighbour` already answers, including the reflection
	// off a face edge -- so the two have to agree everywhere but the pentagons,
	// whose ring is five long and is not a step in `(i, j)` at all.
	it("agrees with a single neighbour step, across faces too", () => {
		let wrong: Wrong = null;
		let crossed = 0;
		for (let face = 0; face < 20 && !wrong; face++)
			for (let i = 0; i <= N && !wrong; i++)
				for (let j = 0; i + j <= N && !wrong; j++) {
					const corner =
						(i === 0 && j === 0) ||
						(i === N && j === 0) ||
						(i === 0 && j === N);
					if (corner) continue;
					for (let d = 0; d < 6; d++) {
						const step = DIRECTIONS[d]!;
						const one = neighbour(face, N, i, j, d);
						const got = cellOffset(face, N, i, j, step[0], step[1]);
						if (
							one === null ||
							got.face !== one.face ||
							got.i !== one.i ||
							got.j !== one.j
						) {
							wrong = {
								where: `${face},${i},${j} step ${d}`,
								got: `${got.face},${got.i},${got.j}`,
								wanted: one
									? `${one.face},${one.i},${one.j}`
									: "nothing",
							};
							break;
						}
						if (got.face !== face) crossed++;
					}
				}
		expect(wrong).toBeNull();
		// The test is only worth having if it left the face it started on.
		expect(crossed).toBeGreaterThan(100);
	});

	// A shape stamped anywhere has to name a real cell, however far off the
	// face its offsets fall -- which is the whole reason this exists.
	it("never names a cell outside a face, wherever it starts", () => {
		let wrong: Wrong = null;
		for (let face = 0; face < 20 && !wrong; face++)
			for (let i = 0; i <= N && !wrong; i += 3)
				for (let j = 0; i + j <= N && !wrong; j += 3)
					for (const [di, dj] of [
						[12, 9],
						[-14, 3],
						[7, -18],
						[-9, -9],
						[20, 20],
					]) {
						const got = cellOffset(face, N, i, j, di!, dj!);
						if (
							got.i < 0 ||
							got.j < 0 ||
							got.i + got.j > N ||
							got.face < 0 ||
							got.face >= 20
						) {
							wrong = {
								where: `${face},${i},${j} + ${di},${dj}`,
								got: `${got.face},${got.i},${got.j}`,
								wanted: `a cell of a face at n=${N}`,
							};
							break;
						}
					}
		expect(wrong).toBeNull();
	});
});
