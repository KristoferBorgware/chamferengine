// What a light carried through the world costs, and where its chart is wrong.
//
//   npx vite-node tools/trial-torch.ts
//
// A light is a flood fill over the eight-neighbour cell graph, and the answer
// has to reach a fragment shader every time the player steps off a cell. It
// travels as a cube of levels named by how far each cell is from the source
// along the source's OWN FACE coordinates, extended past that face's edges --
// which costs one 3x3 solve in the shader and no lookup at all.
//
// Two things that chart has to be measured on: what the fill costs at each
// range, and what the extended lattice does at one of the twelve pentagons,
// where the sphere is one direction short and a flat chart cannot be.
import {
	barycentricOf,
	hexRound,
	latticeCell,
	latticePosition,
	pentagonVertex,
} from "chamfer/addressing";
import {
	blockLightSide,
	fillBlockLight,
	pentagonDiscCells,
	skyDiscCells,
} from "chamfer/light";

const DEPTH = 11;
const N = 2 ** DEPTH;
const OPEN = () => false;

console.log(`depth ${DEPTH}, n ${N}, ${10 * 4 ** DEPTH + 2} surface cells\n`);

console.log("what the fill costs, in open air, which is the worst case");
console.log(" range   cells lit   3r^2+3r+1        fill      per cell");
for (const range of [4, 6, 8, 10, 12, 16]) {
	const side = blockLightSide(range);
	const runs = 20;
	const t0 = performance.now();
	let chart = fillBlockLight(7, 900, 700, 40, range, side, OPEN);
	for (let r = 1; r < runs; r++)
		chart = fillBlockLight(7, 900, 700, 40, range, side, OPEN);
	const ms = (performance.now() - t0) / runs;
	let lit = 0;
	for (const level of chart.levels) if (level > 0) lit++;
	console.log(
		`${String(range).padStart(6)} ${lit.toLocaleString("en-US").padStart(11)} ` +
			`${skyDiscCells(range).toLocaleString("en-US").padStart(11)}` +
			`${`${ms.toFixed(2)} ms`.padStart(12)} ${`${((ms * 1000) / lit).toFixed(2)} us`.padStart(13)}`,
	);
}
console.log(
	"\nthe closed form is the disc in ONE layer; the count is the whole ball",
);

// ---- the chart against the sphere -----------------------------------------
//
// A fragment solves its own direction into the source's face and reads the
// chart; the fill names the same entries by counting. The two agree wherever
// the chart is a chart, and a corner of the icosahedron is where it stops
// being one.
console.log("\nwhere the chart names the cell the sphere does");
console.log("  source        entries   distinct cells   round trips");
const sources: [string, number, number, number][] = [
	["mid-face", 7, 900, 700],
	["near an edge", 7, 1000, 4],
	["on an edge", 7, 1000, 0],
	["a pentagon", 7, 0, 0],
];
for (const [what, face, i0, j0] of sources) {
	const range = 15;
	const seen = new Set<string>();
	let entries = 0;
	let round = 0;
	for (let di = -range; di <= range; di++)
		for (let dj = -range; dj <= range; dj++) {
			if (hexDistance(di, dj) > range) continue;
			entries++;
			const cell = latticeCell(face, N, i0 + di, j0 + dj);
			seen.add(`${cell.face}/${cell.i}/${cell.j}`);
			// The shader's own route back: the cell's direction, solved into
			// the source's face and rounded.
			const dir = latticePosition(cell.face, N, cell.i, cell.j);
			const w = barycentricOf(face, dir);
			const [, ri, rj] = hexRound(N * w[0], N * w[1], N * w[2], N);
			if (ri === i0 + di && rj === j0 + dj) round++;
		}
	console.log(
		`  ${what.padEnd(14)}${String(entries).padStart(6)} ` +
			`${String(seen.size).padStart(16)} ` +
			`${`${((100 * round) / entries).toFixed(1)}%`.padStart(13)}`,
	);
}
console.log(
	`\n  a hexagon's disc at 15 steps is ${skyDiscCells(15).toLocaleString("en-US")} cells` +
		` and a pentagon's ${pentagonDiscCells(15).toLocaleString("en-US")},` +
		"\n  because a ring around a pentagon holds 5k cells where a hexagon's holds 6k",
);

// How much of the world is within reach of one of the twelve.
const near = 12 * skyDiscCells(16);
const all = 10 * 4 ** DEPTH + 2;
console.log(
	`\n  a light within 16 steps of a pentagon stands on ${near.toLocaleString("en-US")} of` +
		` ${all.toLocaleString("en-US")} columns, ${((100 * near) / all).toFixed(4)}%`,
);
console.log(
	`  pentagon at (0, 0) of face 7: ${pentagonVertex(7, N, 0, 0) >= 0 ? "yes" : "no"}`,
);

/** Steps between two axial offsets on the hexagonal lattice. */
function hexDistance(di: number, dj: number): number {
	return (Math.abs(di) + Math.abs(dj) + Math.abs(di + dj)) / 2;
}
