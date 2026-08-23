// Scratch probe: at a coarse level, does every chunk whose MESHER READS the
// coarse cell get the row? The mesher reads one step past its rim (the apron),
// and the apron cell itself asks its own six neighbours -- two steps out.
// Run: npx vite-node tools/_probe-rowreach2.ts
import { DeltaStore, cellSlot, chunksHolding, chunksReading, coarseCell } from "chamfer/edit";
import { cellRepresentations, neighbour } from "chamfer/addressing";

const D = 8;
const C = 4;
const n = 1 << D;
const header = {
	version: 1,
	subdivisionDepth: D,
	chunkLevel: C,
	registry: [] as string[],
};

/** Chunks holding the cell, or any cell within `steps` of it. */
function within(
	cell: { face: number; i: number; j: number },
	depth: number,
	level: number,
	steps: number,
): Set<number> {
	const N = 1 << depth;
	let front = new Set<string>([`${cell.face},${cell.i},${cell.j}`]);
	const all = new Set<string>(front);
	for (let s = 0; s < steps; s++) {
		const next = new Set<string>();
		for (const at of front) {
			const [f, i, j] = at.split(",").map(Number) as [number, number, number];
			for (const rep of cellRepresentations(f, N, i, j))
				for (let k = 0; k < 6; k++) {
					const nb = neighbour(rep.face, N, rep.i, rep.j, k);
					if (!nb) continue;
					const id = `${nb.face},${nb.i},${nb.j}`;
					if (!all.has(id)) {
						all.add(id);
						next.add(id);
					}
				}
		}
		front = next;
	}
	const keys = new Set<number>();
	for (const at of all) {
		const [f, i, j] = at.split(",").map(Number) as [number, number, number];
		for (const rep of cellRepresentations(f, 1 << depth, i, j))
			for (const h of chunksHolding({ ...rep, layer: 0 }, depth, level))
				keys.add(h.chunkKey);
	}
	return keys;
}

for (const steps of [1, 2]) {
	const missed = new Map<number, number>();
	const total = new Map<number, number>();
	const examples: string[] = [];
	let cells = 0;
	for (const face of [0]) {
		for (let i = 0; i <= n; i++)
			for (let j = 0; i + j <= n; j++) {
				const onRim = i === 0 || j === 0 || i + j === n;
				if (!onRim && (i % 23 !== 0 || j % 23 !== 0)) continue;
				const cell = { face, i, j, layer: 5 };
				const store = new DeltaStore(header);
				const owner = cellSlot(cell, D, C).chunkKey;
				store.write(cell, 0x1111);
				cells++;
				for (let lod = 0; lod <= C; lod++) {
					const cd = D - lod;
					const cl = C - lod;
					const cc = lod === 0 ? cell : coarseCell(cell, D, lod);
					for (const key of within(cc, cd, cl, steps)) {
						total.set(lod, (total.get(lod) ?? 0) + 1);
						const got = store.rowsUnder(key, cl).map((r) => r.chunkKey);
						if (!got.includes(owner)) {
							missed.set(lod, (missed.get(lod) ?? 0) + 1);
							if (examples.length < 8)
								examples.push(
									`steps ${steps} lod ${lod}: cell face ${face} (${i},${j}) owner ${owner}; chunk ${key} at level ${cl} reads it, rowsUnder gives [${got}]`,
								);
						}
					}
				}
			}
	}
	console.log(`--- reach ${steps} step(s) past the cell, ${cells} cells ---`);
	for (let lod = 0; lod <= C; lod++)
		console.log(
			`  lod ${lod}: ${missed.get(lod) ?? 0} of ${total.get(lod) ?? 0} readers never handed the row`,
		);
	for (const line of examples) console.log("   " + line);
}
