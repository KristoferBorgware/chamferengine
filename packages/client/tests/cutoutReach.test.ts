import { beforeAll, describe, expect, it } from "vitest";
import {
	ChunkAddress,
	buildCoarseMap,
	seedFromString,
	selectionId,
} from "chamfer/generation";
import type { CoarseMap } from "chamfer/generation";
import { CUTOUT_REACH, MeshWorkerCore } from "chamfer/mesh";
import { PlanetSettings } from "../src/PlanetSettings.js";
import { plantLayerOf } from "../src/PlantDraft.js";

/**
 * The world a fresh page opens with, cut down to a planet a test can afford.
 *
 * Nothing here is a fixture: the layers, the biome table and the terrain all
 * come from the same draft `planet.ts` hands a worker. Only the size is this
 * file's -- the shipped depth is 13, where one chunk's crust is a thousand
 * layers and finding a forest takes fifteen seconds. **Deep enough for
 * biomes**, which are a property of the whole sphere rather than of the patch
 * a chunk stands on: a smaller planet reads fewer of the table's own biomes
 * and can miss the ones the forest layers name.
 */
const settings = new PlanetSettings({
	plain: false,
	subdivisionDepth: 10,
	blockSize: 2,
});
const seed = seedFromString(settings.knobs.seed);
let map: CoarseMap;
let core: MeshWorkerCore;

beforeAll(() => {
	map = buildCoarseMap(seed, settings.coarseOptions());
	const shape = settings.shapeFor(map);
	core = new MeshWorkerCore({
		kind: "setup",
		map: map.toSnapshot(),
		seaLevelRadius: shape.seaLevelRadius,
		subdivisionDepth: shape.subdivisionDepth,
		maxElevation: shape.maxElevation,
		crustDepth: shape.crustDepth,
		apron: true,
		terrain: settings.terrainOptions(),
		cutoutLeaves: true,
		plants: settings.plantLayers.map(plantLayerOf),
		biomes: {
			biomes: settings.biomeTable.biomes,
			grid: settings.biomeTable.grid,
			settings: settings.biomeOptions(),
			continent: settings.layerFor("continent"),
			erosion: settings.layerFor("erosion"),
			peaks: settings.layerFor("peaks"),
		},
	});
});

/**
 * The same ground at one level, as the worker meshes it.
 *
 * A coarse chunk keeps its path and drops both its depth and its chunk level,
 * so the key of the ground under one finest chunk is that chunk's key divided
 * down -- which is what {@link ChunkAddress} does by construction.
 */
function meshAt(finestKey: number, lod: number) {
	const chunkLevel = settings.chunkLevel - lod;
	const key = Math.floor(finestKey / 4 ** lod);
	return core.run({
		kind: "chunk",
		id: selectionId(chunkLevel, key),
		key,
		chunkLevel,
		lod,
	});
}

/** A finest-level chunk whose canopy the cutout has something to do to. */
function withLeaves(): number {
	for (let key = 0; key < 400; key++) {
		const at = key * 977 + 11;
		const most = ChunkAddress.countAt(settings.chunkLevel);
		const finest = at % most;
		if (meshAt(finest, 0).cutout.triangleCount > 0) return finest;
	}
	throw new Error("no chunk sampled grew a leaf");
}

describe("how far out a leaf keeps its holes", () => {
	it("stops at the level the measurement chose", () => {
		// The constant is what the trial priced, and a change to it is a
		// change to the picture and to a seventh of the selection's triangles.
		expect(CUTOUT_REACH).toBe(0);
	});

	it("cuts the canopy out at the finest level and not past it", () => {
		const finest = withLeaves();
		const near = meshAt(finest, CUTOUT_REACH);
		expect(near.cutout.triangleCount).toBeGreaterThan(0);

		// One level coarser the leaves are still there and still drawn --
		// they are solid blocks wearing the leaf picture, so the geometry
		// goes to the opaque buffer and the cutout one is empty.
		const far = meshAt(finest, CUTOUT_REACH + 1);
		expect(far.cutout.triangleCount).toBe(0);
		expect(far.opaque.triangleCount).toBeGreaterThan(0);
	});
});
