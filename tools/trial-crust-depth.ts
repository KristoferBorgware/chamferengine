/**
 * What a shallower crust actually buys, and what it costs.
 *
 * The layer field allows 2,048 layers and the shipped world runs 1,232, so
 * asking for fewer looks like free speed. It is not one question but two, and
 * they have opposite answers.
 *
 * **A crust must span its own terrain**, peak to sea floor, or the deep ocean
 * has no bottom. So the first table holds one world and varies only the room
 * left under it -- which is digging depth and nothing else -- and the second
 * builds genuinely smaller worlds, relief and sea floor scaled to fit.
 *
 * Naively varying the crust alone under a tall world measures neither: the
 * crust top sits at the tallest ground, so a crust shorter than the terrain
 * puts every column's ground below the floor of the world and the chunk is
 * empty. That reads as a huge speed-up and builds nothing.
 */
import {
	CARVE_LAYER_DEFAULT,
	COARSE_MAP_DEFAULTS,
	ChunkAddress,
	ChunkColumnSampler,
	TerrainGenerator,
	buildCoarseMap,
	generateChunk,
	seedFromString,
} from "chamfer/generation";
import { buildChunkMesh } from "chamfer/mesh";
import { CELL_CONSTANT, WorldShape } from "chamfer/world";

const DEPTH = 13;
const CHUNK_LEVEL = 7;
const LEVEL = 8;
const BLOCK = 1;
const RUNS = 4;
const CHUNKS = 8;

const radius = (BLOCK * 2 ** DEPTH) / CELL_CONSTANT;

const addresses: ChunkAddress[] = [];
for (let face = 0; face < CHUNKS; face++)
	addresses.push(
		ChunkAddress.fromKey(face * 4 ** CHUNK_LEVEL + 500, CHUNK_LEVEL),
	);

/** The map's own extremes, which is what a crust has to hold. */
function spanOf(map: { count: number; height: Float32Array }) {
	let top = 0;
	let floor = 0;
	for (let c = 0; c < map.count; c++) {
		const h = map.height[c]!;
		if (h > top) top = h;
		if (h < floor) floor = h;
	}
	return { top: Math.ceil(top), floor: Math.ceil(-floor) };
}

function time(shape: WorldShape, map: Parameters<typeof buildChunkMesh>[0] extends never ? never : any) {
	const gen = new TerrainGenerator(map.seed, shape, map, {
		carveLayer: true,
		carve: CARVE_LAYER_DEFAULT,
		caves: true,
	});
	let build = 0;
	let mesh = 0;
	let bytes = 0;
	let solid = 0;
	for (let run = 0; run < RUNS; run++)
		for (const address of addresses) {
			const a = performance.now();
			const chunk = generateChunk(
				gen,
				address,
				CHUNK_LEVEL,
				shape.crustDepth,
			);
			const b = performance.now();
			buildChunkMesh(
				chunk,
				new ChunkColumnSampler(chunk, gen),
				shape,
				map.seed,
				{},
			);
			mesh += performance.now() - b;
			build += b - a;
			bytes = chunk.blocks.byteLength;
			if (run === 0) {
				let n = 0;
				for (let x = 0; x < chunk.blocks.length; x++)
					if (chunk.blocks[x] !== 0) n++;
				solid += n / chunk.blocks.length;
			}
		}
	const n = RUNS * addresses.length;
	return {
		build: build / n,
		mesh: mesh / n,
		kb: bytes / 1024,
		solid: solid / addresses.length,
	};
}

const shipped = buildCoarseMap(seedFromString("chamfer"), {
	level: LEVEL,
	cellMetres: 32,
});
const span = spanOf(shipped);
const need = span.top + span.floor;

console.log(
	`depth ${DEPTH}, ${BLOCK} m block, chunk level ${CHUNK_LEVEL}, ` +
		`${CHUNKS} chunks x ${RUNS} runs, carve and caves on\n`,
);
console.log(
	`The shipped map reaches ${span.top} m up and ${span.floor} m down, ` +
		`so its terrain spans ${need} m and a crust must hold at least that.\n`,
);

console.log("ONE WORLD, VARYING ROOM TO DIG UNDER IT");
console.log("  crust  spare      generate       mesh    blocks/chunk   solid");
for (const layers of [need + 8, 800, 1000, 1232, 1500, 2048]) {
	if (layers < need) continue;
	const shape = new WorldShape(radius, DEPTH, span.top, layers);
	const t = time(shape, shipped);
	console.log(
		`  ${String(layers).padStart(5)}  ${String(layers - need).padStart(5)}` +
			`  ${t.build.toFixed(2).padStart(9)} ms  ${t.mesh.toFixed(2).padStart(8)} ms` +
			`  ${t.kb.toFixed(0).padStart(9)} KB  ${(t.solid * 100).toFixed(1).padStart(5)}%`,
	);
}

console.log("\nGENUINELY SMALLER WORLDS, crust fitted to each");
console.log("  relief   sea   crust      generate       mesh    blocks/chunk");
for (const scale of [1, 0.5, 0.25, 0.125]) {
	const relief = Math.round(COARSE_MAP_DEFAULTS.relief * scale);
	const seaDepth = Math.round(COARSE_MAP_DEFAULTS.seaDepth * scale);
	const peakRelief = Math.round(COARSE_MAP_DEFAULTS.peakRelief * scale);
	const map = buildCoarseMap(seedFromString("chamfer"), {
		level: LEVEL,
		cellMetres: 32,
		relief,
		seaDepth,
		peakRelief,
	});
	const s = spanOf(map);
	const layers = s.top + s.floor + 8;
	const shape = new WorldShape(radius, DEPTH, s.top, layers);
	const t = time(shape, map);
	console.log(
		`  ${String(relief).padStart(6)}  ${String(seaDepth).padStart(4)}  ${String(layers).padStart(5)}` +
			`  ${t.build.toFixed(2).padStart(9)} ms  ${t.mesh.toFixed(2).padStart(8)} ms` +
			`  ${t.kb.toFixed(0).padStart(9)} KB`,
	);
}
