import { describe, expect, it } from "vitest";
import { CoarseGrid, makeBlend, readBlend } from "chamfer/generation";
import { Vec3 } from "chamfer/math";
import { cellKey, degree, neighbour } from "chamfer/addressing";

describe("CoarseGrid", () => {
	it("holds every cell once, at every level", () => {
		for (const level of [1, 2, 3, 4, 5]) {
			const grid = new CoarseGrid(level);
			expect(grid.count).toBe(10 * 4 ** level + 2);

			// Every face-and-offset pair has to land on a cell, and the number of
			// distinct cells they land on has to be the count above -- one home
			// per name, and no cell without one.
			const n = grid.n;
			const seen = new Set<number>();
			for (let face = 0; face < 20; face++)
				for (let i = 0; i <= n; i++)
					for (let j = 0; i + j <= n; j++) {
						const cell = grid.indexOf(face, i, j);
						expect(cell).toBeGreaterThanOrEqual(0);
						expect(cell).toBeLessThan(grid.count);
						seen.add(cell);
					}
			expect(seen.size).toBe(grid.count);
		}
	});

	it("gives exactly twelve cells five neighbours", () => {
		for (const level of [2, 3, 4]) {
			const grid = new CoarseGrid(level);
			let fives = 0;
			for (let cell = 0; cell < grid.count; cell++)
				if (grid.degreeOf(cell) === 5) fives++;
			expect(fives).toBe(12);
		}
	});

	it("agrees with the addressing graph on every ring", () => {
		// The grid links lattice steps inside each face and lets shared cells do
		// the crossing. `neighbour` crosses a face edge explicitly, by
		// reflection. The two arrive at the same graph or one of them is wrong.
		const level = 3;
		const grid = new CoarseGrid(level);
		const n = grid.n;
		const byKey = new Map<string, number>();
		for (let face = 0; face < 20; face++)
			for (let i = 0; i <= n; i++)
				for (let j = 0; i + j <= n; j++)
					byKey.set(cellKey(face, n, i, j), grid.indexOf(face, i, j));

		for (let face = 0; face < 20; face++)
			for (let i = 0; i <= n; i++)
				for (let j = 0; i + j <= n; j++) {
					const cell = grid.indexOf(face, i, j);
					const expected = new Set<number>();
					for (let k = 0; k < 6; k++) {
						const nb = neighbour(face, n, i, j, k);
						if (nb)
							expected.add(
								byKey.get(cellKey(nb.face, n, nb.i, nb.j))!,
							);
					}
					const got = new Set<number>();
					for (let k = 0; k < 6; k++) {
						const at = grid.ring[cell * 6 + k]!;
						if (at >= 0) got.add(at);
					}
					expect([...got].sort()).toEqual([...expected].sort());
					expect(got.size).toBe(degree(face, n, i, j));
				}
	});

	it("never lists a cell as its own neighbour", () => {
		const grid = new CoarseGrid(4);
		for (let cell = 0; cell < grid.count; cell++)
			for (let k = 0; k < 6; k++)
				expect(grid.ring[cell * 6 + k]).not.toBe(cell);
	});

	it("keeps the ring symmetric", () => {
		const grid = new CoarseGrid(4);
		for (let cell = 0; cell < grid.count; cell++)
			for (let k = 0; k < 6; k++) {
				const other = grid.ring[cell * 6 + k]!;
				if (other < 0) continue;
				let back = false;
				for (let m = 0; m < 6; m++)
					if (grid.ring[other * 6 + m] === cell) back = true;
				expect(back).toBe(true);
			}
	});

	it("puts every cell on the unit sphere", () => {
		const grid = new CoarseGrid(3);
		for (let cell = 0; cell < grid.count; cell++) {
			const x = grid.directions[cell * 3]!;
			const y = grid.directions[cell * 3 + 1]!;
			const z = grid.directions[cell * 3 + 2]!;
			expect(Math.sqrt(x * x + y * y + z * z)).toBeCloseTo(1, 14);
		}
	});
});

describe("reading many fields at one place", () => {
	const grid = new CoarseGrid(5);
	const one = Float32Array.from({ length: grid.count }, (_, at) => at % 37);
	const two = Float32Array.from({ length: grid.count }, (_, at) =>
		Math.sin(at),
	);

	/**
	 * The blend exists to be read several times, so the guarantee is that it
	 * gives exactly what the single-field lookup gives -- bit for bit, because
	 * the map is what the ground is read off and a last bit is a real
	 * disagreement.
	 */
	it("gives what the single lookup gives, at 4,000 directions", () => {
		const blend = makeBlend();
		const golden = Math.PI * (3 - Math.sqrt(5));
		for (let n = 0; n < 4000; n++) {
			const z = 1 - (2 * n + 1) / 4000;
			const ring = Math.sqrt(Math.max(0, 1 - z * z));
			const a = n * golden;
			const dir = new Vec3(Math.cos(a) * ring, z, Math.sin(a) * ring);
			grid.blendInto(dir, blend);
			expect(readBlend(one, blend)).toBe(grid.sampleAt(one, dir));
			expect(readBlend(two, blend)).toBe(grid.sampleAt(two, dir));
		}
	});

	it("weighs three cells, and the weights are a whole one", () => {
		const blend = makeBlend();
		grid.blendInto(new Vec3(0.3, 0.6, 0.74).normalize(), blend);
		expect(blend.cells.length).toBe(3);
		expect(
			blend.weights[0]! + blend.weights[1]! + blend.weights[2]!,
		).toBeCloseTo(1, 12);
	});
});
