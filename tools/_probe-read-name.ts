/**
 * DeltaStore.write is told about every chunk that reads a cell (name-aware),
 * but DeltaStore.read files the lookup under the face name it was handed.
 * A cell on an icosahedron face edge has two names. Do they agree?
 */
import { DeltaStore, STORE_VERSION, cellSlot, packBlockState, typeOf } from "chamfer/edit";
import {
	cellRepresentations,
	canonicalCell,
	latticeWeights,
	positionToCell,
	latticePosition,
} from "chamfer/addressing";
import { BlockType } from "chamfer/generation";

const DEPTH = 10;
const CHUNK_LEVEL = 4;
const N = 1 << DEPTH;

const store = new DeltaStore({
	version: STORE_VERSION,
	subdivisionDepth: DEPTH,
	chunkLevel: CHUNK_LEVEL,
	registry: ["chamfer:air", "chamfer:stone"],
});

let onEdge = 0;
let twoNames = 0;
let disagree = 0;
let posDisagree = 0;
const examples: string[] = [];

for (let face = 0; face < 20; face++)
	for (let i = 0; i <= N; i += 37)
		for (let j = 0; i + j <= N; j += 41) {
			const w = latticeWeights(N, i, j);
			if (!(w[0] === 0 || w[1] === 0 || w[2] === 0)) continue;
			onEdge++;
			const names = cellRepresentations(face, N, i, j);
			if (names.length < 2) continue;
			twoNames++;

			// Write under the first name, read under each of the others.
			const layer = 30;
			const a = names[0]!;
			store.write(
				{ face: a.face, i: a.i, j: a.j, layer },
				packBlockState(BlockType.AIR, 0),
			);
			for (const b of names) {
				if (b.face === a.face) continue;
				const got = store.read({ face: b.face, i: b.i, j: b.j, layer });
				if (got === undefined) {
					disagree++;
					if (examples.length < 3)
						examples.push(
							`wrote ${a.face}:${a.i}:${a.j} row ${cellSlot({ ...a, layer }, DEPTH, CHUNK_LEVEL).chunkKey}` +
								` / read ${b.face}:${b.i}:${b.j} row ${cellSlot({ ...b, layer }, DEPTH, CHUNK_LEVEL).chunkKey} -> undefined`,
						);
				}
			}

			// And which name does positionToCell -- what the collision probe
			// uses -- produce for the same point?
			const dir = latticePosition(face, N, i, j);
			const cell = positionToCell(dir.scale(1700), N);
			const same = names.some(
				(nm) => nm.face === cell.face && nm.i === cell.i && nm.j === cell.j,
			);
			if (!same) posDisagree++;
			else if (cell.face !== a.face) {
				// The probe names it under a face the writer did not use.
				const got = store.read({ ...cell, layer });
				if (got === undefined && examples.length < 6)
					examples.push(
						`positionToCell names it ${cell.face}:${cell.i}:${cell.j}; store.read -> undefined (written under ${a.face}:${a.i}:${a.j})`,
					);
			}
		}

console.log(`face-edge lattice points sampled: ${onEdge}, with two or more names: ${twoNames}`);
console.log(`  store.read under a different name of the same cell missed: ${disagree}`);
console.log(`  positionToCell produced a name outside cellRepresentations: ${posDisagree}`);
for (const line of examples) console.log("  " + line);
