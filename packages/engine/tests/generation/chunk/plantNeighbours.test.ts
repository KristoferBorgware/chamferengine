import { beforeAll, describe, expect, it } from "vitest";
import type { CoarseMap } from "chamfer/generation";
import {
	ChunkAddress,
	PLANT_SPECIES,
	PlantTemplateStore,
	TerrainGenerator,
	buildCoarseMap,
	generateChunk,
	maxElevationFor,
	plantChunk,
	seedFromString,
} from "chamfer/generation";
import {
	canonicalCell,
	joinPath,
	neighbour,
	rank,
	splitPath,
} from "chamfer/addressing";
import { WorldShape, maxCrustDepth } from "chamfer/world";

const DEPTH = 8;
const CHUNK_LEVEL = 4;
const RADIUS = 1700;
const OPTIONS = { level: 6, cellMetres: 100, relief: 100 };
const N = 1 << DEPTH;
const M = 1 << (DEPTH - CHUNK_LEVEL);

let map: CoarseMap;
let shape: WorldShape;
let terrain: TerrainGenerator;
let templates: PlantTemplateStore;

const layer = {
	id: 1,
	species: "Pine",
	on: true,
	density: 40,
	feature: 300,
	featureScale: 4,
	octaves: 3,
	persistence: 0.5,
	lacunarity: 2,
	fold: 0,
	curve: [
		[-1, 1],
		[1, 1],
	] as [number, number][],
	shape: PLANT_SPECIES.Pine!,
};

beforeAll(() => {
	map = buildCoarseMap(seedFromString("chamfer"), OPTIONS);
	shape = new WorldShape(
		RADIUS,
		DEPTH,
		maxElevationFor(OPTIONS),
		maxCrustDepth(DEPTH),
	);
	terrain = new TerrainGenerator(map.seed, shape, map);
	templates = new PlantTemplateStore(
		map.seed,
		DEPTH,
		shape.blockSize,
		RADIUS,
	);
});

/** `(q, r)` back from a slot, which is what a chunk files its cells under. */
function qrOf(slot: number): [number, number] {
	for (let r = 0; r <= M; r++)
		for (let q = 0; q + r <= M; q++)
			if (rank(q, r, M) === slot) return [q, r];
	throw new Error(`no (q, r) for slot ${slot}`);
}

/** Every plant cell one chunk wrote, by the cell's own name in the world. */
function plantsOf(address: ChunkAddress): Map<string, number> {
	const chunk = generateChunk(
		terrain,
		address,
		CHUNK_LEVEL,
		shape.crustDepth,
	);
	const grown = plantChunk(
		chunk,
		terrain,
		shape,
		[layer],
		map.seed,
		DEPTH,
		templates,
	);
	const out = new Map<string, number>();
	if (!grown) return out;
	for (let at = 0; at < grown.where.length; at++) {
		const slot = Math.floor(grown.where[at]! / chunk.layerCount);
		const inLayer = grown.where[at]! - slot * chunk.layerCount;
		const [q, r] = qrOf(slot);
		const [i, j] = joinPath(address.path, q, r, DEPTH);
		const cell = canonicalCell(address.face, N, i, j);
		out.set(`${cell.face},${cell.i},${cell.j},${inLayer}`, grown.what[at]!);
	}
	return out;
}

/**
 * The chunk over an edge of this one, found through a cell just past its rim.
 *
 * **Every direction from every rim point is tried**, because which way leaves
 * the triangle depends on which of its edges the point is on and on whether the
 * middle-child descent has turned it.
 */
function beside(address: ChunkAddress): ChunkAddress | null {
	for (let along = 1; along < M; along++)
		for (const [q, r] of [
			[along, 0],
			[0, along],
			[along, M - along],
		]) {
			const [i, j] = joinPath(address.path, q!, r!, DEPTH);
			for (let d = 0; d < 6; d++) {
				const out = neighbour(address.face, N, i, j, d);
				if (!out) continue;
				const cell = canonicalCell(out.face, N, out.i, out.j);
				const split = splitPath(cell.i, cell.j, DEPTH, CHUNK_LEVEL);
				const one = new ChunkAddress(cell.face, split.path);
				if (one.key !== address.key) return one;
			}
		}
	return null;
}

describe("two chunks that hold one plant", () => {
	// **The whole scheme rests on this.** A chunk grows every plant within
	// reach of its own rim and writes only the cells of its own triangle, and a
	// cell on a shared edge is in two triangles at once -- so both write it,
	// neither is consulted, and the two have to agree. The bench's audit
	// compares one patch cut into chunks; this is the world's own path, which
	// converts roots, levels and layers on the way and is covered by none of
	// it.
	it("writes the same block in every cell they both hold", () => {
		let pairs = 0;
		let shared = 0;
		let differ = "";
		for (let face = 0; face < 20 && pairs < 6; face++) {
			const address = new ChunkAddress(
				face,
				splitPath(
					1 << (DEPTH - 2),
					1 << (DEPTH - 2),
					DEPTH,
					CHUNK_LEVEL,
				).path,
			);
			const other = beside(address);
			if (!other) continue;
			const mine = plantsOf(address);
			const theirs = plantsOf(other);
			if (mine.size === 0 && theirs.size === 0) continue;
			pairs++;
			for (const [where, what] of mine) {
				const said = theirs.get(where);
				if (said === undefined) continue;
				shared++;
				if (said !== what) {
					differ = `${where}: ${what} against ${said}`;
					break;
				}
			}
			if (differ) break;
		}
		expect(differ).toBe("");
		expect(pairs).toBeGreaterThan(0);
		// A pair that shares no plant cell proves nothing, so say when it did.
		// Six pairs of chunks share 124 cells on this world. Well clear of
		// zero, so a run that compared almost nothing would say so.
		expect(shared).toBeGreaterThan(50);
	});

	// **A chunk is grown from its address and the seed and nothing else**, so
	// building one twice, from two stores, has to give the same forest -- the
	// second store stands in for a second worker, which builds its own.
	it("grows the same forest from a second store", () => {
		const address = new ChunkAddress(
			3,
			splitPath(1 << (DEPTH - 2), 1 << (DEPTH - 2), DEPTH, CHUNK_LEVEL)
				.path,
		);
		const once = plantsOf(address);
		templates = new PlantTemplateStore(
			map.seed,
			DEPTH,
			shape.blockSize,
			RADIUS,
		);
		const twice = plantsOf(address);
		expect(twice.size).toBe(once.size);
		let differ = "";
		for (const [where, what] of once)
			if (twice.get(where) !== what) {
				differ = `${where}: ${what} against ${twice.get(where)}`;
				break;
			}
		expect(differ).toBe("");
		expect(once.size).toBeGreaterThan(0);
	});
});
