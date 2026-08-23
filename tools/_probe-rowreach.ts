// Scratch probe: does every chunk that HOLDS a slot for a changed cell get
// handed the row that contains it -- at the finest level and at every coarse
// one? Run: npx vite-node tools/_probe-rowreach.ts
import { DeltaStore, cellSlot, chunksHolding, coarseCell } from "chamfer/edit";
import { cellRepresentations } from "chamfer/addressing";

const D = 8;
const C = 4;
const n = 1 << D;

const header = {
	version: 1,
	subdivisionDepth: D,
	chunkLevel: C,
	registry: [] as string[],
};

let checked = 0;
let missFine = 0;
let missCoarse = new Map<number, number>();
let coarseChecked = new Map<number, number>();
const examples: string[] = [];

// Every cell of one face, plus one interior face for a control.
for (const face of [0, 7]) {
	for (let i = 0; i <= n; i += 1)
		for (let j = 0; i + j <= n; j += 1) {
			// Sample: whole rim of the face plus a stride inside, to keep it quick.
			const onRim = i === 0 || j === 0 || i + j === n;
			if (!onRim && (i % 17 !== 0 || j % 17 !== 0)) continue;
			const cell = { face, i, j, layer: 5 };
			const store = new DeltaStore(header);
			const owner = cellSlot(cell, D, C).chunkKey;
			store.write(cell, 0x1111);
			checked++;

			// FINEST: every chunk holding a slot for this cell, under every
			// name the cell has.
			const holders = new Set<number>();
			for (const rep of cellRepresentations(face, n, i, j))
				for (const h of chunksHolding({ ...rep, layer: 5 }, D, C))
					holders.add(h.chunkKey);
			for (const key of holders) {
				const got = store.rowsFor(key).map((r) => r.chunkKey);
				if (!got.includes(owner)) {
					missFine++;
					if (examples.length < 6)
						examples.push(
							`FINE: cell face ${face} (${i},${j}) owner ${owner}; chunk ${key} holds a slot and rowsFor gives [${got}]`,
						);
				}
			}

			// COARSE: the same question at every level the chunk can be drawn at.
			for (let lod = 1; lod <= C; lod++) {
				const cd = D - lod;
				const cl = C - lod;
				const cc = coarseCell(cell, D, lod);
				const cHolders = new Set<number>();
				for (const rep of cellRepresentations(cc.face, 1 << cd, cc.i, cc.j))
					for (const h of chunksHolding({ ...rep, layer: 0 }, cd, cl))
						cHolders.add(h.chunkKey);
				for (const key of cHolders) {
					coarseChecked.set(lod, (coarseChecked.get(lod) ?? 0) + 1);
					const got = store.rowsUnder(key, cl).map((r) => r.chunkKey);
					if (!got.includes(owner)) {
						missCoarse.set(lod, (missCoarse.get(lod) ?? 0) + 1);
						if (examples.length < 12)
							examples.push(
								`LOD ${lod}: cell face ${face} (${i},${j}) owner ${owner}; coarse chunk ${key} at level ${cl} holds a slot for coarse cell face ${cc.face} (${cc.i},${cc.j}) and rowsUnder gives [${got}]`,
							);
					}
				}
			}
		}
}

console.log(`cells checked: ${checked}`);
console.log(`finest-level holders never handed the row: ${missFine}`);
for (let lod = 1; lod <= C; lod++)
	console.log(
		`lod ${lod}: ${missCoarse.get(lod) ?? 0} of ${coarseChecked.get(lod) ?? 0} coarse holders never handed the row`,
	);
for (const line of examples) console.log("  " + line);
