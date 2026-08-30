// Does a see-through canopy have to be see-through at every level of detail?
//
//   npx vite-node tools/trial-cutout-lod.ts
//
// A cutout leaf draws a face against another leaf and against its own trunk,
// which a solid one does not, and that is what makes a canopy geometry all the
// way through rather than a hollow shell. It is also what it costs. The holes
// it costs that for are texels: a leaf drawn two levels out is a block four
// times wider on a picture the same size, and the question is whether anybody
// can see through one.
//
// So this meshes the same forested ground at every level a selection draws it
// at, both ways, and weighs the bill by how many chunks a standing player
// actually holds at each. It is what chose `CUTOUT_REACH`.
import { PlanetSettings } from "../packages/client/src/PlanetSettings.js";
import { plantLayerOf } from "../packages/client/src/PlantDraft.js";
import { biomeFieldFor } from "../packages/client/src/biomeFieldFor.js";
import {
	ChunkAddress,
	ChunkColumnSampler,
	ChunkPeaks,
	PlantTemplateStore,
	TerrainGenerator,
	buildCoarseMap,
	generateChunk,
	makeBiomeSample,
	plantChunk,
	seedFromString,
	selectChunks,
} from "chamfer/generation";
import { canonicalCell, directionToCell, splitPath } from "chamfer/addressing";
import { buildChunkMesh } from "chamfer/mesh";
import { Vec3 } from "chamfer/math";

const settings = new PlanetSettings({ plain: false });
const seed = seedFromString(settings.knobs.seed);
const map = buildCoarseMap(seed, settings.coarseOptions());
const shape = settings.shapeFor(map);
const field = biomeFieldFor(seed, shape, map, settings);
if (!field) throw new Error("this world has no biomes, so it has no forest");
const plants = settings.plantLayers.map(plantLayerOf);
const wanted = new Set(plants.flatMap((l) => l.biomes ?? []));
const scratch = makeBiomeSample();

/** How coarse a level a selection ever reaches, so the sweep stops there. */
const LEVELS = 6;

/** Ground in a biome the shipped layers plant in, found the way F-123 did. */
function forested(): Vec3 {
	let pick = 987654321;
	for (let tries = 0; tries < 20000; tries++) {
		pick = (Math.imul(pick, 1664525) + 1013904223) >>> 0;
		const z = (pick / 2 ** 32) * 2 - 1;
		pick = (Math.imul(pick, 1664525) + 1013904223) >>> 0;
		const phi = (pick / 2 ** 32) * Math.PI * 2;
		const r = Math.sqrt(1 - z * z);
		const dir = new Vec3(r * Math.cos(phi), r * Math.sin(phi), z);
		const at = field!.readAt(dir.x, dir.y, dir.z, scratch);
		if (wanted.has(field!.biomes[at]?.name ?? "")) return dir;
	}
	throw new Error("no forested ground found");
}

const generators = new Map<number, TerrainGenerator>();
const stores = new Map<number, PlantTemplateStore>();
function generatorAt(lod: number): TerrainGenerator {
	const already = generators.get(lod);
	if (already) return already;
	const made = new TerrainGenerator(
		seed,
		shape.atLod(lod),
		map,
		settings.terrainOptions(),
	);
	generators.set(lod, made);
	return made;
}
function storeAt(lod: number): PlantTemplateStore {
	const already = stores.get(lod);
	if (already) return already;
	const level = shape.atLod(lod);
	const made = new PlantTemplateStore(
		seed,
		level.subdivisionDepth,
		level.blockSize,
		level.seaLevelRadius,
	);
	stores.set(lod, made);
	return made;
}

/** Mesh one patch of ground at one level, both ways. */
function measure(dir: Vec3, lod: number) {
	const level = shape.atLod(lod);
	const chunkLevel = settings.chunkLevel - lod;
	const n = level.n;
	const cell = directionToCell(dir, n);
	const home = canonicalCell(cell.face, n, cell.i, cell.j);
	const split = splitPath(
		home.i,
		home.j,
		level.subdivisionDepth,
		chunkLevel,
	);
	const chunk = generateChunk(
		generatorAt(lod),
		new ChunkAddress(home.face, split.path),
		chunkLevel,
		level.crustDepth,
	);
	const grown = plantChunk(
		chunk,
		generatorAt(lod),
		level,
		plants,
		seed,
		shape.subdivisionDepth,
		storeAt(lod),
		field!,
	);
	const build = (cutoutLeaves: boolean) =>
		buildChunkMesh(chunk, new ChunkColumnSampler(chunk, generatorAt(lod)), level, seed, {
			apron: true,
			surfaceGrid: shape.blockSize,
			cutoutLeaves,
			cover: grown?.cover ?? null,
		});
	const solid = build(false);
	const holed = build(true);
	return {
		block: level.blockSize,
		leaf: grown?.leaf ?? 0,
		solidFaces: solid.tally.faces,
		holedFaces: holed.tally.faces,
		solidTris: solid.opaque.triangleCount + solid.cutout.triangleCount,
		holedTris: holed.opaque.triangleCount + holed.cutout.triangleCount,
	};
}

const spots = [forested(), forested(), forested()];
console.log(
	`depth ${settings.depth}, ${settings.knobs.blockSize} m blocks, chunk level ` +
		`${settings.chunkLevel}; ${spots.length} patches of forested ground`,
);
console.log(
	`\n  ${"lod".padEnd(5)}${"block".padStart(8)}${"leaf cells".padStart(12)}` +
		`${"solid".padStart(11)}${"cutout".padStart(11)}${"".padStart(9)}`,
);
const extra: number[] = [];
const solidAt: number[] = [];
for (let lod = 0; lod < LEVELS; lod++) {
	let leaf = 0;
	let solid = 0;
	let holed = 0;
	let block = 0;
	for (const dir of spots) {
		const one = measure(dir, lod);
		leaf += one.leaf;
		solid += one.solidTris;
		holed += one.holedTris;
		block = one.block;
	}
	extra.push(holed - solid);
	solidAt.push(solid);
	console.log(
		`  ${String(lod).padEnd(5)}${`${block.toFixed(0)} m`.padStart(8)}` +
			`${leaf.toLocaleString("en-US").padStart(12)}` +
			`${solid.toLocaleString("en-US").padStart(11)}` +
			`${holed.toLocaleString("en-US").padStart(11)}` +
			`${`${(holed / solid).toFixed(2)}x`.padStart(9)}`,
	);
}

/**
 * How many chunks a standing player holds at each level.
 *
 * The table above is the same ground at every level, which is what says how a
 * hole's cost changes with the block it is drawn on. It is **not** a view:
 * these are three patches chosen for having trees in them, and weighting them
 * by the chunks at each level would model a planet that is forest everywhere.
 * `tools/trial-texture-cost.ts` builds the real chunks of a real selection and
 * owns the per-view figures.
 */
const eye = forested().normalize();
const peaks = new ChunkPeaks(map, settings.knobs.blockSize, settings.chunkLevel);
const selection = selectChunks(
	settings.depth,
	settings.chunkLevel,
	eye,
	generatorAt(0).columnAt(
		directionToCell(eye, shape.n).face,
		directionToCell(eye, shape.n).i,
		directionToCell(eye, shape.n).j,
	).groundRadius + 1.7,
	shape.seaLevelRadius,
	settings.knobs.detail,
	shape.maxElevation,
	peaks,
);
const perLod = new Map<number, number>();
for (const one of selection)
	perLod.set(one.lod, (perLod.get(one.lod) ?? 0) + 1);
console.log(
	`\na standing player holds ${selection.length.toLocaleString("en-US")} chunks:`,
);
for (const [lod, count] of [...perLod].sort((a, b) => a[0] - b[0]))
	console.log(
		`  lod ${lod}: ${String(count).padStart(4)} chunks` +
			`${`${((100 * count) / selection.length).toFixed(1)}%`.padStart(8)}` +
			`  a block is ${(settings.knobs.blockSize * 2 ** lod).toFixed(0)} m there`,
	);
console.log(
	`\nwhat that costs over a real view -- forest, rock, ocean and all --` +
		` is tools/trial-texture-cost.ts`,
);
