// Seed-vs-patched probe 4: an edit two cells past a chunk's rim.
// The store never hands that chunk a row, so its apron reads the SEED there,
// while the chunk that owns the cell reads it patched. Mesh both ways.
import {
	BlockType,
	ChunkAddress,
	ChunkColumnSampler,
	TerrainGenerator,
	buildCoarseMap,
	generateChunk,
	seedFromString,
	applyDeltas,
} from "chamfer/generation";
import { DeltaStore, chunksReading, packBlockState } from "chamfer/edit";
import { meshChunk } from "chamfer/mesh";
import { WorldShape, maxCrustDepth } from "chamfer/world";
import { Vec3 } from "chamfer/math";
import { joinPath, latticePosition, neighbour } from "chamfer/addressing";

const DEPTH = 8;
const CHUNK_LEVEL = 4;
const seed = seedFromString("chamfer");
const map = buildCoarseMap(seed, { level: 6, cellMetres: 100, relief: 300 });
const shape = new WorldShape(1700, DEPTH, 300, maxCrustDepth(DEPTH));
const terrain = new TerrainGenerator(seed, shape, map);
const n = 1 << DEPTH;

const KEY = 0;
const address = ChunkAddress.fromKey(KEY, CHUNK_LEVEL);
const chunk0 = generateChunk(terrain, address, CHUNK_LEVEL, shape.crustDepth);
const base = new ChunkColumnSampler(chunk0, terrain, null);
const asked: { face: number; i: number; j: number }[] = [];
const spy = {
	columnAt(face: number, i: number, j: number) {
		asked.push({ face, i, j });
		return base.columnAt(face, i, j);
	},
};
const [oi, oj] = joinPath(address.path, 0, 0, DEPTH);
const origin = new Vec3(
	...(() => {
		const p = latticePosition(address.face, n, oi, oj).scale(
			shape.seaLevelRadius,
		);
		return [p.x, p.y, p.z] as [number, number, number];
	})(),
);
const noop = { vertex: () => 0, triangle: () => {} };
meshChunk(chunk0, spy, shape, seed, origin, noop, noop, {
	apron: true,
	surfaceGrid: shape.blockSize,
	speckle: 0,
});

// A sampled column no edit can reach, on land.
let victim: { face: number; i: number; j: number } | null = null;
for (const c of asked) {
	if (chunksReading({ ...c, layer: 0 }, DEPTH, CHUNK_LEVEL).includes(KEY))
		continue;
	const col = terrain.columnAt(c.face, c.i, c.j);
	if (col.groundRadius > shape.seaLevelRadius + 30) {
		victim = c;
		break;
	}
}
if (!victim) throw new Error("no land victim");
const col = terrain.columnAt(victim.face, victim.i, victim.j);
const top = shape.layerOfSurface(col.groundRadius);
console.log(
	`victim ${victim.face}:${victim.i}:${victim.j}  ground layer ${top}`,
);
console.log(
	`  distance from the chunk: ${
		asked.some(
			(a) =>
				chunksReading({ ...a, layer: 0 }, DEPTH, CHUNK_LEVEL).includes(
					KEY,
				) &&
				[0, 1, 2, 3, 4, 5].some((k) => {
					const nb = neighbour(a.face, n, a.i, a.j, k);
					return (
						nb &&
						nb.face === victim!.face &&
						nb.i === victim!.i &&
						nb.j === victim!.j
					);
				}),
		)
			? "2 cells past the rim"
			: "further"
	}`,
);

const store = new DeltaStore({
	version: 1,
	subdivisionDepth: DEPTH,
	chunkLevel: CHUNK_LEVEL,
	registry: [],
});
// A 12-block tower.
for (let d = 1; d <= 12; d++)
	store.write(
		{ face: victim.face, i: victim.i, j: victim.j, layer: top - d },
		packBlockState(BlockType.SNOW),
	);
const production = store.rowsUnder(KEY, CHUNK_LEVEL);
const everything = [...store.entries()].map(([chunkKey, deltas]) => ({
	chunkKey,
	deltas,
}));
console.log(
	`rows the store hands chunk ${KEY}: ${production.length}; rows that exist: ${everything.length}`,
);

function mesh(rows: typeof everything) {
	const chunk = generateChunk(terrain, address, CHUNK_LEVEL, shape.crustDepth);
	const outside = applyDeltas(chunk, rows, DEPTH, 0);
	const sampler = new ChunkColumnSampler(chunk, terrain, outside);
	const verts: number[] = [];
	let tris = 0;
	const sink = {
		vertex(
			x: number,
			y: number,
			z: number,
			r: number,
			g: number,
			b: number,
		) {
			verts.push(x, y, z, r, g, b);
			return verts.length / 6 - 1;
		},
		triangle() {
			tris++;
		},
	};
	meshChunk(chunk, sampler, shape, seed, origin, sink, sink, {
		apron: true,
		surfaceGrid: shape.blockSize,
		speckle: 0,
	});
	return { verts, tris };
}

const a = mesh(production);
const b = mesh(everything);
console.log(`production: ${a.verts.length / 6} verts, ${a.tris} tris`);
console.log(`all rows  : ${b.verts.length / 6} verts, ${b.tris} tris`);
let posDiff = 0;
let colDiff = 0;
let worst = 0;
const len = Math.min(a.verts.length, b.verts.length);
for (let x = 0; x < len; x++) {
	const d = Math.abs(a.verts[x]! - b.verts[x]!);
	if (d < 1e-9) continue;
	if (x % 6 < 3) posDiff++;
	else {
		colDiff++;
		worst = Math.max(worst, d / Math.max(1e-6, Math.abs(b.verts[x]!)));
	}
}
console.log(
	`differing position components ${posDiff}, colour components ${colDiff}, worst colour error ${(worst * 100).toFixed(1)}%`,
);
