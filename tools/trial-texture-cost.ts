// What the pictures and the holes cost, on the half of a frame a CPU owns.
//
//   npx vite-node tools/trial-texture-cost.ts
//
// Three changes landed together -- a picture on every block, a second picture
// over the side of a ground block, and a canopy drawn with the holes its
// picture has in it -- and "it feels slower" cannot tell them apart. This
// separates them, over the chunks a standing player actually holds, and
// measures the part that is countable: how long a worker spends building a
// chunk, how many triangles come out, and how many bytes the GPU is handed.
//
// **It does not measure the draw.** That needs an adapter, and the one in this
// container is a software rasteriser -- a frame here settles what is drawn and
// never how fast (`HOW-TO-TAKE-A-FRAME.md`). The draw's own costs are named in
// the notes beside this trial's output and have to be read off a real machine.
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
	plantChunk,
	seedFromString,
	selectChunks,
} from "chamfer/generation";
import { CUTOUT_REACH, buildChunkMesh } from "chamfer/mesh";
import { directionToCell } from "chamfer/addressing";
import { Vec3 } from "chamfer/math";

const settings = new PlanetSettings({ plain: false });
const seed = seedFromString(settings.knobs.seed);
const map = buildCoarseMap(seed, settings.coarseOptions());
const shape = settings.shapeFor(map);
const field = biomeFieldFor(seed, shape, map, settings);
const plants = settings.plantLayers.map(plantLayerOf);

/** A table wide enough for every block, which is what a real bake hands over. */
const textureLayers = (() => {
	const table = new Int32Array(4096 * 4);
	for (let block = 0; block < 4096; block++) {
		table[block * 4] = block % 110;
		table[block * 4 + 1] = (block + 1) % 110;
		table[block * 4 + 2] = (block + 2) % 110;
		// A band on rather fewer than a third of them, which is the share the
		// shipped bake files: 31 of 110 pictures are an overlay.
		table[block * 4 + 3] = block % 4 === 0 ? (block + 3) % 110 : -1;
	}
	return table;
})();

const generators = new Map<number, TerrainGenerator>();
const stores = new Map<number, PlantTemplateStore>();
const generatorAt = (lod: number): TerrainGenerator => {
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
};
const storeAt = (lod: number): PlantTemplateStore => {
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
};

/** The selection a player standing on forested ground actually holds. */
const eye = (() => {
	let pick = 987654321;
	const wanted = new Set(plants.flatMap((l) => l.biomes ?? []));
	for (let tries = 0; tries < 20000; tries++) {
		pick = (Math.imul(pick, 1664525) + 1013904223) >>> 0;
		const z = (pick / 2 ** 32) * 2 - 1;
		pick = (Math.imul(pick, 1664525) + 1013904223) >>> 0;
		const phi = (pick / 2 ** 32) * Math.PI * 2;
		const r = Math.sqrt(1 - z * z);
		const dir = new Vec3(r * Math.cos(phi), r * Math.sin(phi), z);
		if (!field) return dir;
		const at = field.readAt(dir.x, dir.y, dir.z, {} as never);
		if (wanted.has(field.biomes[at]?.name ?? "")) return dir;
	}
	throw new Error("no forested ground found");
})().normalize();

const cell = directionToCell(eye, shape.n);
const eyeRadius =
	Math.max(
		generatorAt(0).columnAt(cell.face, cell.i, cell.j).groundRadius,
		shape.seaLevelRadius,
	) + 1.7;
const peaks = new ChunkPeaks(map, settings.knobs.blockSize, settings.chunkLevel);
const selection = selectChunks(
	settings.depth,
	settings.chunkLevel,
	eye,
	eyeRadius,
	shape.seaLevelRadius,
	settings.knobs.detail,
	shape.maxElevation,
	peaks,
);

/**
 * A sample of the selection, weighted the way the selection itself is.
 *
 * Building every chunk of a 300-chunk view three ways is minutes of work for a
 * number a tenth of it settles, so this takes every `stride`-th chunk in
 * distance order -- which keeps the mix of levels rather than favouring the
 * near field or the far one.
 */
const STRIDE = 4;
const sample = selection.filter((_, at) => at % STRIDE === 0);

interface Bill {
	buildMs: number;
	triangles: number;
	bytes: number;
	cutoutTris: number;
	solidCanopy: number;
	draws: number;
	cutoutDraws: number;
}

function run(pictures: boolean, holes: boolean, reach = CUTOUT_REACH): Bill {
	const bill: Bill = {
		buildMs: 0,
		triangles: 0,
		bytes: 0,
		cutoutTris: 0,
		solidCanopy: 0,
		draws: 0,
		cutoutDraws: 0,
	};
	for (const one of sample) {
		const level = shape.atLod(one.lod);
		const chunk = generateChunk(
			generatorAt(one.lod),
			ChunkAddress.fromKey(one.key, one.chunkLevel),
			one.chunkLevel,
			level.crustDepth,
		);
		const grown =
			plants.length > 0
				? plantChunk(
						chunk,
						generatorAt(one.lod),
						level,
						plants,
						seed,
						shape.subdivisionDepth,
						storeAt(one.lod),
						field,
					)
				: null;
		const sampler = new ChunkColumnSampler(chunk, generatorAt(one.lod));
		const start = performance.now();
		const mesh = buildChunkMesh(chunk, sampler, level, seed, {
			apron: true,
			surfaceGrid: shape.blockSize,
			cutoutLeaves: holes && one.lod <= reach,
			cover: grown?.cover ?? null,
			...(pictures ? { textureLayers } : {}),
		});
		bill.buildMs += performance.now() - start;
		bill.triangles +=
			mesh.opaque.triangleCount +
			mesh.cutout.triangleCount +
			mesh.translucent.triangleCount;
		bill.cutoutTris += mesh.cutout.triangleCount;
		if (mesh.opaque.triangleCount > 0) bill.draws++;
		if (mesh.cutout.triangleCount > 0) {
			bill.draws++;
			bill.cutoutDraws++;
		}
		if (mesh.translucent.triangleCount > 0) bill.draws++;
		// What the renderer uploads. The vertex is the same width whether or
		// not a bake has loaded -- a layer of `-1` is still a float -- so this
		// is the geometry moving, not the picture.
		bill.bytes +=
			mesh.opaque.vertices.byteLength +
			mesh.cutout.vertices.byteLength +
			mesh.translucent.vertices.byteLength +
			mesh.opaque.indices.byteLength +
			mesh.cutout.indices.byteLength +
			mesh.translucent.indices.byteLength;
	}
	return bill;
}

// One pass thrown away: the first chunk built pays for every lazy cache in the
// generator, and it lands wherever it lands.
run(false, false);

const cases: [string, Bill][] = [
	["no pictures, solid leaves", run(false, false)],
	["pictures, solid leaves", run(true, false)],
	["pictures, holes at the finest", run(true, true)],
	["pictures, holes at every level", run(true, true, 99)],
];

console.log(
	`depth ${settings.depth}, ${settings.knobs.blockSize} m blocks, chunk level ` +
		`${settings.chunkLevel}, detail ${settings.knobs.detail}`,
);
console.log(
	`${selection.length} chunks in the selection, every ${STRIDE}th built ` +
		`(${sample.length} of them), four ways`,
);
console.log(
	`\n  ${"".padEnd(30)}${"build".padStart(10)}${"triangles".padStart(12)}` +
		`${"uploaded".padStart(12)}`,
);
const base = cases[0]![1];
for (const [what, bill] of cases)
	console.log(
		`  ${what.padEnd(30)}${`${bill.buildMs.toFixed(0)} ms`.padStart(10)}` +
			`${bill.triangles.toLocaleString("en-US").padStart(12)}` +
			`${`${(bill.bytes / 1048576).toFixed(1)} MB`.padStart(12)}` +
			(bill === base
				? ""
				: `   ${(bill.buildMs / base.buildMs).toFixed(2)}x build, ` +
					`${(bill.triangles / base.triangles).toFixed(2)}x tris, ` +
					`${(bill.bytes / base.bytes).toFixed(2)}x bytes`),
	);
const holed = cases[2]![1];
const solid = cases[1]![1];
const every = cases[3]![1];
console.log(
	`\n  of the last row, ${holed.cutoutTris.toLocaleString("en-US")} triangles ` +
		`(${((100 * holed.cutoutTris) / holed.triangles).toFixed(1)}%) ` +
		`are the canopy, drawn by a pipeline that discards`,
);
console.log(
	`  the canopy's own geometry is ${(holed.cutoutTris / (holed.cutoutTris - (holed.triangles - solid.triangles))).toFixed(2)}x ` +
		`what a solid one draws, and all of the new part stands behind the old`,
);
console.log(
	`  draw calls a frame: ${solid.draws} solid, ${holed.draws} with holes ` +
		`(${holed.cutoutDraws} of them the canopy), and the shadow pass repeats ` +
		`the canopy's ${holed.cutoutDraws} once per cascade`,
);
console.log(
	`  holding the holes to the finest level keeps ` +
		`${((100 * (holed.triangles - solid.triangles)) / (every.triangles - solid.triangles)).toFixed(1)}% ` +
		`of what they cost everywhere, for ` +
		`${((100 * (every.triangles - holed.triangles)) / every.triangles).toFixed(1)}% ` +
		`fewer triangles in view`,
);
console.log(
	`  a vertex is ${11 * 4} bytes now against ${7 * 4} before any of this: ` +
		`${((11 * 4) / (7 * 4)).toFixed(2)}x, on every chunk in the world`,
);
