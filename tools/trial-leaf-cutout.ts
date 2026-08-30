// What alpha-tested leaves cost, which is the geometry a solid canopy hides.
//
//   npx vite-node tools/trial-leaf-cutout.ts
//
// A face is drawn between two cells when the first is more opaque than the
// second, and a leaf is as opaque as stone -- so a leaf against a leaf draws
// nothing and a leaf against its own trunk draws nothing. That is right while
// a leaf is a solid green cube. It stops being right the moment the texture
// has holes in it: a look through a hole reaches cells whose faces were never
// emitted, and what shows there is the sky behind the tree.
//
// So cutout leaves have to stop occluding, and this is the bill for that --
// counted twice over. First from the blocks alone, which is what the question
// looked like before anything was built; then from the real mesher run over the
// same chunks with the switch off and on, which is what it actually costs.
import { PlanetSettings } from "../packages/client/src/PlanetSettings.js";
import { plantLayerOf } from "../packages/client/src/PlantDraft.js";
import { biomeFieldFor } from "../packages/client/src/biomeFieldFor.js";
import {
	BlockType,
	ChunkAddress,
	PlantTemplateStore,
	TerrainGenerator,
	buildCoarseMap,
	generateChunk,
	makeBiomeSample,
	plantChunk,
	seedFromString,
} from "chamfer/generation";
import {
	DIRECTIONS,
	canonicalCell,
	directionToCell,
	rank,
	splitPath,
} from "chamfer/addressing";
import { Vec3 } from "chamfer/math";
import { ChunkColumnSampler } from "chamfer/generation";
import { buildChunkMesh } from "chamfer/mesh";

const settings = new PlanetSettings({ plain: false });
const seed = seedFromString(settings.knobs.seed);
const map = buildCoarseMap(seed, settings.coarseOptions());
const shape = settings.shapeFor(map);
const field = biomeFieldFor(seed, shape, map, settings);
if (!field) throw new Error("this world has no biomes, so it has no forest");
const layers = settings.plantLayers.map(plantLayerOf);
const terrain = new TerrainGenerator(seed, shape, map, settings.terrainOptions());
const templates = new PlantTemplateStore(
	seed,
	shape.subdivisionDepth,
	shape.blockSize,
	shape.seaLevelRadius,
);

/**
 * Chunks standing in a biome one of the layers actually plants in.
 *
 * **Asked of the biome model rather than sampled blindly.** A forest is four
 * biomes out of twenty-one and the sea is 61% of the surface, so picking chunks
 * at random and hoping is a long wait for a tree.
 */
const wanted = new Set(layers.flatMap((l) => l.biomes ?? []));
const scratch = makeBiomeSample();
const n = shape.n;
const found: {
	chunk: ReturnType<typeof generateChunk>;
	grown: NonNullable<ReturnType<typeof plantChunk>>;
}[] = [];
let pick = 987654321;
for (let tries = 0; tries < 4000 && found.length < 4; tries++) {
	pick = (Math.imul(pick, 1664525) + 1013904223) >>> 0;
	const z = (pick / 2 ** 32) * 2 - 1;
	pick = (Math.imul(pick, 1664525) + 1013904223) >>> 0;
	const phi = (pick / 2 ** 32) * Math.PI * 2;
	const r = Math.sqrt(1 - z * z);
	const dir = new Vec3(r * Math.cos(phi), r * Math.sin(phi), z);
	const at = field.readAt(dir.x, dir.y, dir.z, scratch);
	if (!wanted.has(field.biomes[at]?.name ?? "")) continue;
	const cell = directionToCell(dir, n);
	const home = canonicalCell(cell.face, n, cell.i, cell.j);
	const split = splitPath(home.i, home.j, settings.depth, settings.chunkLevel);
	const chunk = generateChunk(
		terrain,
		new ChunkAddress(home.face, split.path),
		settings.chunkLevel,
		shape.crustDepth,
	);
	const grown = plantChunk(
		chunk,
		terrain,
		shape,
		layers,
		seed,
		settings.depth,
		templates,
		field,
	);
	if (grown && grown.leaf > 0) found.push({ chunk, grown });
}
if (found.length === 0) throw new Error("no chunk asked for grew a leaf");

console.log(
	`depth ${settings.depth}, ${settings.knobs.blockSize} m blocks, chunk level ` +
		`${settings.chunkLevel} -- ${settings.chunkSpan.toFixed(0)} m across`,
);
console.log(
	`${found.length} chunks with trees: ${found.reduce((s, f) => s + f.grown.plants, 0)} plants, ` +
		`${found.reduce((s, f) => s + f.grown.leaf, 0).toLocaleString("en-US")} leaf cells`,
);

const LEAVES = new Set(
	Object.entries(BlockType)
		.filter(([k]) => k.endsWith("_LEAF"))
		.map(([, v]) => v),
);

let drawn = 0; // a leaf face against air, which is emitted today
let hidden = 0; // a leaf face against another leaf, which is not
let atSolid = 0; // a leaf face against wood or ground, which is not either
let buried = 0; // leaf cells with no face at all today
let skipped = 0; // cells whose ring leaves the chunk, so cannot be counted

for (const { chunk } of found) {
	// Slot back to the `(q, r)` it ranks from, so a cell's six lateral
	// neighbours can be found without a table: `rank` is a bijection over the
	// triangle, so walking the triangle once inverts it.
	const m = chunk.m;
	const qr: [number, number][] = new Array(chunk.slots);
	for (let r = 0; r <= m; r++)
		for (let q = 0; q + r <= m; q++) qr[rank(q, r, m)] = [q, r];
	const { blocks, layerCount } = chunk;
	const at = (slot: number, layer: number): number =>
		blocks[slot * layerCount + layer] ?? 0;

	for (let slot = 0; slot < chunk.slots; slot++) {
		const [q, r] = qr[slot]!;
		const ring: number[] = [];
		let whole = true;
		for (const [dq, dr] of DIRECTIONS) {
			const nq = q + dq;
			const nr = r + dr;
			if (nq < 0 || nr < 0 || nq + nr > m) {
				whole = false;
				break;
			}
			ring.push(rank(nq, nr, m));
		}
		for (let layer = 1; layer + 1 < layerCount; layer++) {
			if (!LEAVES.has(at(slot, layer))) continue;
			if (!whole) {
				skipped++;
				continue;
			}
			let open = 0;
			for (const other of ring) {
				const b = at(other, layer);
				if (b === BlockType.AIR) open++;
				else if (LEAVES.has(b)) hidden++;
				else atSolid++;
			}
			for (const dl of [-1, 1]) {
				const b = at(slot, layer + dl);
				if (b === BlockType.AIR) open++;
				else if (LEAVES.has(b)) hidden++;
				else atSolid++;
			}
			drawn += open;
			if (open === 0) buried++;
		}
	}
}

const total = drawn + hidden + atSolid;
console.log(
	`\nleaf faces, over the cells whose whole ring a chunk holds ` +
		`(${skipped.toLocaleString("en-US")} on a rim not counted)`,
);
const row = (what: string, count: number) =>
	console.log(
		`  ${what.padEnd(34)}${count.toLocaleString("en-US").padStart(10)}` +
			`${`${((100 * count) / total).toFixed(1)}%`.padStart(8)}`,
	);
row("against air, drawn today", drawn);
row("against another leaf, culled", hidden);
row("against wood or ground, culled", atSolid);
console.log(
	`  ${"all eight neighbours".padEnd(34)}${total.toLocaleString("en-US").padStart(10)}`,
);
console.log(
	`\n  a canopy that stops occluding draws ${(total / drawn).toFixed(2)}x the leaf faces it draws now`,
);
console.log(
	`  ${buried.toLocaleString("en-US")} leaf cells have no face at all today, ` +
		`which is what a hole would look into`,
);

/**
 * The same chunks through the real mesher, both ways.
 *
 * The count above is over blocks and their neighbours; this is over what the
 * engine emits, which merges runs, draws an apron, and puts the cutout faces in
 * a buffer of their own. The two answer the same question and only the second
 * is the bill.
 */
function meshed(cutoutLeaves: boolean) {
	let faces = 0;
	let opaque = 0;
	let cutout = 0;
	let bytes = 0;
	for (const { chunk } of found) {
		const built = buildChunkMesh(
			chunk,
			new ChunkColumnSampler(chunk, terrain),
			shape,
			seed,
			{ apron: true, cutoutLeaves },
		);
		faces += built.tally.faces;
		opaque += built.opaque.triangleCount;
		cutout += built.cutout.triangleCount;
		bytes +=
			built.opaque.vertices.byteLength +
			built.cutout.vertices.byteLength +
			built.translucent.vertices.byteLength;
	}
	return { faces, opaque, cutout, bytes };
}

const solid = meshed(false);
const holed = meshed(true);
console.log(`\nthe same ${found.length} chunks through the mesher`);
const bill = (what: string, off: number, on: number) =>
	console.log(
		`  ${what.padEnd(24)}${off.toLocaleString("en-US").padStart(12)}` +
			`${on.toLocaleString("en-US").padStart(12)}` +
			`${`${(on / off).toFixed(2)}x`.padStart(9)}`,
	);
console.log(
	`  ${"".padEnd(24)}${"solid".padStart(12)}${"cutout".padStart(12)}`,
);
bill("faces emitted", solid.faces, holed.faces);
bill(
	"triangles",
	solid.opaque + solid.cutout,
	holed.opaque + holed.cutout,
);
bill("vertex bytes", solid.bytes, holed.bytes);
console.log(
	`  of which ${holed.cutout.toLocaleString("en-US")} triangles are in the ` +
		`cutout buffer, which is ` +
		`${((100 * holed.cutout) / (holed.opaque + holed.cutout)).toFixed(1)}% ` +
		`of the geometry and the only part that pays for a fragment stage`,
);
