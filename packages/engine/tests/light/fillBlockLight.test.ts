import { describe, expect, it } from "vitest";
import { blockLightSide, fillBlockLight, skyDiscCells } from "chamfer/light";

const DEPTH = 11;
const N = 2 ** DEPTH;
const AT = { face: 7, i: 900, j: 700, layer: 40 };

/** Nothing is solid, which is what a light in open air reaches. */
const OPEN = (): boolean => false;

/** The chart's entry for one offset from the source. */
function level(
	chart: { side: number; levels: Uint8Array },
	di: number,
	dj: number,
	dl: number,
): number {
	const half = (chart.side - 1) / 2;
	return chart.levels[
		(dl + half) * chart.side * chart.side +
			(dj + half) * chart.side +
			(di + half)
	]!;
}

function fill(
	range: number,
	solid: (f: number, i: number, j: number, l: number) => boolean = OPEN,
) {
	return fillBlockLight(
		AT.face,
		AT.i,
		AT.j,
		AT.layer,
		range,
		blockLightSide(range),
		solid,
	);
}

describe("a light flooded out from one cell", () => {
	it("is full at the cell it stands in", () => {
		expect(level(fill(8), 0, 0, 0)).toBe(255);
	});

	it("loses the same share of itself at every step", () => {
		// A step of brightness per cell, so eight steps out there is nothing
		// left. Stored as the fraction of full brightness, which is what a
		// shader reads without a scale.
		const chart = fill(8);
		for (let d = 0; d <= 8; d++)
			expect(level(chart, d, 0, 0)).toBe(Math.round((255 * (9 - d)) / 9));
		expect(level(chart, 9, 0, 0)).toBe(0);
	});

	it("lights a hexagonal disc, not a square one", () => {
		// `3r^2 + 3r + 1` against a square grid's `2r^2 + 2r + 1`, so half
		// again as much world is within reach at every range.
		for (const range of [2, 4, 8]) {
			const chart = fill(range);
			let lit = 0;
			const half = (chart.side - 1) / 2;
			for (let di = -half; di <= half; di++)
				for (let dj = -half; dj <= half; dj++)
					if (level(chart, di, dj, 0) > 0) lit++;
			expect(lit).toBe(skyDiscCells(range));
		}
	});

	it("reaches up and down as readily as sideways", () => {
		// Eight neighbours: the six lateral steps and the two radial ones. A
		// column of cells is a straight line sharing one address, so the
		// radial axis never branches and needs no table.
		const chart = fill(6);
		expect(level(chart, 0, 0, 3)).toBe(level(chart, 3, 0, 0));
		expect(level(chart, 0, 0, -3)).toBe(level(chart, 0, 3, 0));
	});

	it("stops at rock and does not pass through it", () => {
		// One solid layer straight under the source. The cell below takes the
		// light that lands on it -- a face standing there is lit -- and
		// nothing under it takes any.
		const chart = fill(8, (_f, _i, _j, layer) => layer === AT.layer + 1);
		expect(level(chart, 0, 0, 1)).toBeGreaterThan(0);
		for (let dl = 2; dl <= 8; dl++) expect(level(chart, 0, 0, dl)).toBe(0);
		// And the way round is still open: sideways then down comes back into
		// the layer under the slab, which is what a floor with a hole in it
		// has to do.
		expect(level(chart, 0, 0, -1)).toBeGreaterThan(0);
	});

	it("goes round a wall rather than through it", () => {
		// A wall standing between the source and one cell, with a gap at its
		// end. The far cell is lit by the way round, so its level is what the
		// walk costs and not what the straight line would have.
		const wall = (_f: number, i: number, j: number): boolean =>
			i === AT.i + 2 && j > AT.j - 2;
		const chart = fill(10, wall);
		const open = fill(10);
		// Four steps in a straight line, six round the end of the wall.
		expect(level(open, 4, 0, 0)).toBe(Math.round((255 * 7) / 11));
		expect(level(chart, 4, 0, 0)).toBe(Math.round((255 * 5) / 11));
	});

	it("writes nothing at all when it has no range", () => {
		expect(fill(0).levels.every((v) => v === 0)).toBe(true);
	});

	it("keeps a margin past the furthest cell it lights", () => {
		// A filtered read at the rim blends with its neighbours, so the entry
		// past the last lit one has to exist.
		const chart = fill(8);
		const half = (chart.side - 1) / 2;
		expect(half).toBe(9);
		for (let di = -half; di <= half; di++)
			expect(level(chart, di, half, 0)).toBe(0);
	});
});
