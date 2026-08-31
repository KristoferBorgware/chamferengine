// Does a cave have to be carved at every level of detail?
//
//   npx vite-node tools/trial-cave-lod.ts
//
// The cave field is read once a block down the whole reach, and nothing
// between the chunk selection and the generator gates that by level -- so a
// chunk drawn coarse pays the same walk as the one underfoot, over cells
// wider than the passages it is looking for. This generates and meshes the
// same land at every level a selection draws, with caves and without, and
// then weighs the two bills by the chunks a standing player actually holds
// at each level. It is what chooses `CAVE_DETAIL_REACH`.
import { PlanetSettings } from "../packages/client/src/PlanetSettings.js";
import {
	ChunkAddress,
	ChunkColumnSampler,
	ChunkPeaks,
	TerrainGenerator,
	buildCoarseMap,
	generateChunk,
	seedFromString,
	selectChunks,
} from "chamfer/generation";
import { canonicalCell, directionToCell, splitPath } from "chamfer/addressing";
import { buildChunkMesh } from "chamfer/mesh";
import { Vec3 } from "chamfer/math";

/** The deep setting the whole question is about, not the shallow default. */
const REACH = 200;

const settings = new PlanetSettings({
	plain: false,
	caves: true,
	caveDepth: REACH,
});
const seed = seedFromString(settings.knobs.seed);
const map = buildCoarseMap(seed, settings.coarseOptions());
const shape = settings.shapeFor(map);

/** How coarse a level a selection ever reaches, so the sweep stops there. */
const LEVELS = 6;

/** Land, because the sheet is held off under the sea and the shore. */
function landward(): Vec3 {
	let pick = 123456789;
	for (let tries = 0; tries < 20000; tries++) {
		pick = (Math.imul(pick, 1664525) + 1013904223) >>> 0;
		const z = (pick / 2 ** 32) * 2 - 1;
		pick = (Math.imul(pick, 1664525) + 1013904223) >>> 0;
		const phi = (pick / 2 ** 32) * Math.PI * 2;
		const r = Math.sqrt(1 - z * z);
		const dir = new Vec3(r * Math.cos(phi), r * Math.sin(phi), z);
		const cell = directionToCell(dir, map.n);
		if (map.heightAt(cell.face, cell.i, cell.j, shape.subdivisionDepth) > 60)
			return dir;
	}
	throw new Error("no land found");
}

const withCaves = new Map<number, TerrainGenerator>();
const without = new Map<number, TerrainGenerator>();
function generatorAt(lod: number, caves: boolean): TerrainGenerator {
	const cache = caves ? withCaves : without;
	const already = cache.get(lod);
	if (already) return already;
	const made = new TerrainGenerator(seed, shape.atLod(lod), map, {
		...settings.terrainOptions(),
		caves,
	});
	cache.set(lod, made);
	return made;
}

/** Generate and mesh one patch of land at one level, both ways. */
function measure(dir: Vec3, lod: number) {
	const level = shape.atLod(lod);
	const chunkLevel = settings.chunkLevel - lod;
	const n = level.n;
	const cell = directionToCell(dir, n);
	const home = canonicalCell(cell.face, n, cell.i, cell.j);
	const split = splitPath(home.i, home.j, level.subdivisionDepth, chunkLevel);
	const build = (caves: boolean) => {
		const generator = generatorAt(lod, caves);
		const at = performance.now();
		const chunk = generateChunk(
			generator,
			new ChunkAddress(home.face, split.path),
			chunkLevel,
			level.crustDepth,
		);
		const generated = performance.now() - at;
		const mesh = buildChunkMesh(
			chunk,
			new ChunkColumnSampler(chunk, generator),
			level,
			seed,
			{ apron: true, surfaceGrid: shape.blockSize },
		);
		return {
			generated,
			triangles: mesh.opaque.triangleCount + mesh.cutout.triangleCount,
		};
	};
	return { block: level.blockSize, on: build(true), off: build(false) };
}

const spots = [landward(), landward(), landward()];
console.log(
	`depth ${settings.depth}, ${settings.knobs.blockSize} m blocks, caves to ` +
		`${REACH} m; ${spots.length} patches of land, generation + mesh per level`,
);
console.log(
	`\n  ${"lod".padEnd(5)}${"block".padStart(7)}` +
		`${"gen off".padStart(10)}${"gen on".padStart(10)}${"".padStart(7)}` +
		`${"tris off".padStart(11)}${"tris on".padStart(11)}${"".padStart(7)}`,
);
const genOn: number[] = [];
const genOff: number[] = [];
const triOn: number[] = [];
const triOff: number[] = [];
for (let lod = 0; lod < LEVELS; lod++) {
	let on = { generated: 0, triangles: 0 };
	let off = { generated: 0, triangles: 0 };
	let block = 0;
	for (const dir of spots) {
		const one = measure(dir, lod);
		on = {
			generated: on.generated + one.on.generated,
			triangles: on.triangles + one.on.triangles,
		};
		off = {
			generated: off.generated + one.off.generated,
			triangles: off.triangles + one.off.triangles,
		};
		block = one.block;
	}
	genOn.push(on.generated);
	genOff.push(off.generated);
	triOn.push(on.triangles);
	triOff.push(off.triangles);
	console.log(
		`  ${String(lod).padEnd(5)}${`${block.toFixed(0)} m`.padStart(7)}` +
			`${`${off.generated.toFixed(0)} ms`.padStart(10)}` +
			`${`${on.generated.toFixed(0)} ms`.padStart(10)}` +
			`${`${(on.generated / Math.max(1e-9, off.generated)).toFixed(2)}x`.padStart(7)}` +
			`${off.triangles.toLocaleString("en-US").padStart(11)}` +
			`${on.triangles.toLocaleString("en-US").padStart(11)}` +
			`${`${(on.triangles / Math.max(1, off.triangles)).toFixed(2)}x`.padStart(7)}`,
	);
}

// **The bill is per view, not per chunk**, so weigh each level's figures by
// the chunks a standing player holds there. The per-chunk table is the same
// ground re-drawn coarser; this is what a gate at each level would save.
const eye = landward().normalize();
const peaks = new ChunkPeaks(map, settings.knobs.blockSize, settings.chunkLevel);
const at = directionToCell(eye, shape.n);
const selection = selectChunks(
	settings.depth,
	settings.chunkLevel,
	eye,
	generatorAt(0, true).columnAt(at.face, at.i, at.j).groundRadius + 1.7,
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
			`${`${((100 * count) / selection.length).toFixed(1)}%`.padStart(8)}`,
	);

// One patch's cost at a level stands in for every chunk at that level, which
// is land everywhere -- an over-count for a shore view and honest inland.
console.log(`\nthe view's whole generation bill, by where the gate stands:`);
for (const reach of [0, 1, 2, LEVELS - 1]) {
	let ms = 0;
	for (const [lod, count] of perLod) {
		const per = (lod <= reach ? genOn : genOff)[Math.min(lod, LEVELS - 1)]!;
		ms += (per / spots.length) * count;
	}
	console.log(
		`  caves ${reach >= LEVELS - 1 ? "at every level  " : `to lod ${reach} inclusive`}` +
			`  ${ms.toFixed(0).padStart(7)} ms of generation`,
	);
}
