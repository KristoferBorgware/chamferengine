/**
 * One cell straddling an icosahedron face edge. Break it under one of its two
 * names -- which is what the ray walk hands `change()` -- then ask the player's
 * collision probe about points inside it. `DeltaStore.read` files the lookup
 * under whatever face name it is handed, so half the cell answers "air" and the
 * other half answers with the seed's block.
 */
import { DeltaStore, STORE_VERSION, packBlockState, typeOf } from "chamfer/edit";
import {
	cellCorners,
	cellRepresentations,
	latticePosition,
	positionToCell,
	latticeWeights,
} from "chamfer/addressing";
import { BlockType } from "chamfer/generation";
import { Vec3 } from "chamfer/math";

const DEPTH = 10;
const CHUNK_LEVEL = 4;
const N = 1 << DEPTH;
const LAYER = 30;

const store = new DeltaStore({
	version: STORE_VERSION,
	subdivisionDepth: DEPTH,
	chunkLevel: CHUNK_LEVEL,
	registry: ["chamfer:air", "chamfer:stone"],
});

// A lattice point in the middle of the shared edge of faces 0 and 1.
let target: { face: number; i: number; j: number } | null = null;
for (let i = 0; i <= N && !target; i++)
	for (let j = 0; i + j <= N; j++) {
		const w = latticeWeights(N, i, j);
		if (!(w[0] === 0 || w[1] === 0 || w[2] === 0)) continue;
		if (i < N / 3 || j < 1) continue;
		const names = cellRepresentations(0, N, i, j);
		if (names.length !== 2) continue;
		target = { face: 0, i, j };
		break;
	}
const cell = target!;
const names = cellRepresentations(cell.face, N, cell.i, cell.j);
console.log(
	`cell names: ${names.map((c) => `${c.face}:${c.i}:${c.j}`).join("  and  ")}`,
);

// Break it under the SECOND name -- a ray arriving from that face names it so.
const wrote = names[1]!;
store.write({ ...wrote, layer: LAYER }, packBlockState(BlockType.AIR, 0));
console.log(`broke it under ${wrote.face}:${wrote.i}:${wrote.j}, layer ${LAYER}`);

// Now sample points across the cell, the way the collision probe does.
const corners = cellCorners(cell.face, N, cell.i, cell.j);
const centre = corners
	.reduce((a, c) => a.add(c), new Vec3(0, 0, 0))
	.scale(1 / corners.length)
	.normalize();

let air = 0;
let solid = 0;
const byName = new Map<string, number>();
for (const corner of corners)
	for (let t = 0.05; t < 1; t += 0.05) {
		const dir = centre.scale(1 - t).add(corner.scale(t)).normalize();
		const named = positionToCell(dir.scale(1700), N);
		// Only points the lookup still puts in this cell.
		const inside = names.some(
			(nm) => nm.face === named.face && nm.i === named.i && nm.j === named.j,
		);
		if (!inside) continue;
		const tag = `${named.face}:${named.i}:${named.j}`;
		byName.set(tag, (byName.get(tag) ?? 0) + 1);
		const got = store.read({ ...named, layer: LAYER });
		if (got !== undefined && typeOf(got) === BlockType.AIR) air++;
		else solid++;
	}

console.log(`points sampled inside the cell: ${air + solid}`);
console.log(`  the store says AIR (the break is seen)   : ${air}`);
console.log(`  the store says nothing (seed block wins) : ${solid}`);
console.log(
	`  names positionToCell produced: ${[...byName].map(([k, v]) => `${k} x${v}`).join(", ")}`,
);
