// Scratch probe: owns-vs-contains audit of the identity rules.
// Run: npx vite-node tools/_lens1.ts
import { cellSlot, chunksHolding, offsetIn } from "chamfer/edit";
import { ChunkAddress } from "chamfer/generation";
import {
	cellRepresentations,
	canonicalCell,
	rank,
	splitPath,
} from "chamfer/addressing";

const D = 8;
const C = 4;
const n = 1 << D;
const m = 1 << (D - C);

let cells = 0;
let ownerNotInHolders = 0;
let ownerNotLowest = 0;
let slotMismatch = 0;
let multiName = 0;
let multiNameDifferentOwner = 0;
let multiNameDifferentSlotSet = 0;
const examples: string[] = [];

for (let face = 0; face < 20; face++)
	for (let i = 0; i <= n; i++)
		for (let j = 0; i + j <= n; j++) {
			cells++;
			const cell = { face, i, j, layer: 0 };
			const owner = cellSlot(cell, D, C);
			const holders = chunksHolding(cell, D, C);
			const keys = holders.map((h) => h.chunkKey);
			if (!keys.includes(owner.chunkKey)) {
				ownerNotInHolders++;
				if (examples.length < 6)
					examples.push(
						`owner not a holder: face ${face} (${i},${j}) owner ${owner.chunkKey} holders ${keys}`,
					);
			}
			if (owner.chunkKey !== Math.min(...keys)) ownerNotLowest++;
			// The slot the store computes against the slot the mesher computes.
			const mine = holders.find((h) => h.chunkKey === owner.chunkKey);
			if (mine && mine.slot !== owner.slot) slotMismatch++;

			// Every holder's slot, cross-checked against offsetIn, which is
			// what applyDeltas and ChunkColumnSampler actually use.
			for (const h of holders) {
				const addr = ChunkAddress.fromKey(h.chunkKey, C);
				const named = cellRepresentations(face, n, i, j).find(
					(x) => x.face === addr.face,
				);
				if (!named) {
					if (examples.length < 12)
						examples.push(
							`holder on a face the cell has no name on: ${h.chunkKey}`,
						);
					continue;
				}
				const at = offsetIn(addr.path, named.i, named.j, D);
				if (!at) {
					slotMismatch++;
					if (examples.length < 12)
						examples.push(
							`offsetIn says NOT contained but chunksHolding says held: chunk ${h.chunkKey} cell ${face}:${i}:${j}`,
						);
					continue;
				}
				if (rank(at.q, at.r, m) !== h.slot) {
					slotMismatch++;
					if (examples.length < 12)
						examples.push(
							`slot differs: chunk ${h.chunkKey} cell ${face}:${i}:${j} offsetIn ${rank(at.q, at.r, m)} holding ${h.slot}`,
						);
				}
			}

			const names = cellRepresentations(face, n, i, j);
			if (names.length > 1) {
				multiName++;
				const owners = new Set(
					names.map((x) => cellSlot({ ...x, layer: 0 }, D, C).chunkKey),
				);
				if (owners.size > 1) multiNameDifferentOwner++;
				const sets = names.map((x) =>
					[
						...new Set(
							chunksHolding({ ...x, layer: 0 }, D, C).map(
								(h) => h.chunkKey,
							),
						),
					]
						.sort((a, b) => a - b)
						.join(","),
				);
				if (new Set(sets).size > 1) multiNameDifferentSlotSet++;
				if (owners.size > 1 && examples.length < 20)
					examples.push(
						`two names, two owners: ${names
							.map(
								(x) =>
									`${x.face}:${x.i}:${x.j}->${cellSlot({ ...x, layer: 0 }, D, C).chunkKey}`,
							)
							.join("  ")}  canonical face ${canonicalCell(face, n, i, j).face}`,
					);
			}
		}

console.log({
	cells,
	ownerNotInHolders,
	ownerNotLowest,
	slotMismatch,
	multiName,
	multiNameDifferentOwner,
	multiNameDifferentSlotSet,
});
for (const e of examples) console.log(" ", e);

// Is splitPath's descent the lowest-key child among the ones containing a point?
let notLowestChild = 0;
for (let i = 0; i <= n; i++)
	for (let j = 0; i + j <= n; j++) {
		const cut = splitPath(i, j, D, C);
		let path = 0;
		for (const d of cut.path) path = path * 4 + d;
		const holders = chunksHolding({ face: 0, i, j, layer: 0 }, D, C)
			.filter((h) => h.chunkKey < 4 ** C)
			.map((h) => h.chunkKey);
		if (holders.length && path !== Math.min(...holders)) notLowestChild++;
	}
console.log({ notLowestChild });
