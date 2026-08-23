// Scratch probe: change() invalidates the ANCESTORS of the fine reader set.
// Is that every coarse chunk whose own mesher reads the edit?
// Run: npx vite-node tools/_probe-invalidate.ts
import { chunksReading, coarseCell } from "chamfer/edit";
import { coarseChunkKey } from "chamfer/generation";

const D = 8;
const C = 4;
const n = 1 << D;

const miss = new Map<number, number>();
const total = new Map<number, number>();
const examples: string[] = [];
let cells = 0;

for (let i = 0; i <= n; i++)
	for (let j = 0; i + j <= n; j++) {
		// Interior of the face only: no face edge, no icosahedron vertex.
		// Deep in the face: at least four COARSE cells from every face edge
		// even at the coarsest level, so no face edge or vertex is in reach.
		if (i < 64 || j < 64 || i + j > n - 64) continue;
		if (i % 3 !== 0 || j % 3 !== 0) continue;
		const cell = { face: 0, i, j, layer: 5 };
		cells++;
		const fineReaders = chunksReading(cell, D, C);
		for (let lod = 1; lod <= C; lod++) {
			const level = C - lod;
			const told = new Set(
				fineReaders.map((k) => coarseChunkKey(k, C, level)),
			);
			const cc = coarseCell(cell, D, lod);
			const draws = chunksReading(
				{ ...cc, layer: cell.layer >> lod },
				D - lod,
				level,
			);
			for (const k of draws) {
				total.set(lod, (total.get(lod) ?? 0) + 1);
				if (!told.has(k)) {
					miss.set(lod, (miss.get(lod) ?? 0) + 1);
					if (examples.length < 8)
						examples.push(
							`lod ${lod} (level ${level}): cell (${i},${j}) -> coarse chunk ${k} reads it but change() drops only [${[...told].sort((a, b) => a - b)}]`,
						);
				}
			}
		}
	}

console.log(`cells: ${cells}`);
for (let lod = 1; lod <= C; lod++)
	console.log(
		`lod ${lod}: ${miss.get(lod) ?? 0} of ${total.get(lod) ?? 0} coarse chunks that read the edit are never invalidated`,
	);
for (const line of examples) console.log("  " + line);
