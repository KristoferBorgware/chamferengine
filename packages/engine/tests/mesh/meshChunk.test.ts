import { beforeAll, describe, expect, it } from "vitest";
import type { CoarseMap } from "chamfer/generation";
import {
	BlockType,
	Chunk,
	ChunkAddress,
	ChunkColumnSampler,
	columnBand,
	TerrainGenerator,
	buildCoarseMap,
	generateChunk,
	seedFromString,
} from "chamfer/generation";
import {
	AMBIENT_OCCLUSION,
	ArrayMeshSink,
	buildChunkMesh,
	meshChunk,
	opacityOf,
} from "chamfer/mesh";
import { Vec3 } from "chamfer/math";
import { WorldShape, maxCrustDepth } from "chamfer/world";
import { joinPath } from "chamfer/addressing";
import type { Geometry } from "chamfer/mesh";

const DEPTH = 8;
const CHUNK_LEVEL = 4;
const LAYERS = 60;

let map: CoarseMap;
let shape: WorldShape;
let terrain: TerrainGenerator;

beforeAll(() => {
	map = buildCoarseMap(seedFromString("chamfer"), { level: 6 });
	shape = new WorldShape(1700, DEPTH, 150, maxCrustDepth(DEPTH));
	terrain = new TerrainGenerator(map.seed, shape, map);
});

function mesh(key: number) {
	const chunk = generateChunk(
		terrain,
		ChunkAddress.fromKey(key, CHUNK_LEVEL),
		CHUNK_LEVEL,
		LAYERS,
	);
	return {
		chunk,
		built: buildChunkMesh(
			chunk,
			new ChunkColumnSampler(chunk, terrain),
			shape,
			map.seed,
		),
	};
}

/** Every triangle of a geometry, as three world-space corners. */
function* triangles(geometry: Geometry, origin: Vec3) {
	for (let at = 0; at + 2 < geometry.indices.length; at += 3) {
		const corner = (which: number) => {
			const v = geometry.indices[at + which]! * 6;
			return new Vec3(
				geometry.vertices[v]! + origin.x,
				geometry.vertices[v + 1]! + origin.y,
				geometry.vertices[v + 2]! + origin.z,
			);
		};
		yield [corner(0), corner(1), corner(2)] as const;
	}
}

describe("opacityOf", () => {
	it("orders air under water under everything solid", () => {
		expect(opacityOf(BlockType.AIR)).toBe(0);
		expect(opacityOf(BlockType.WATER)).toBe(1);
		for (const block of [
			BlockType.STONE,
			BlockType.DIRT,
			BlockType.GRASS,
			BlockType.SAND,
			BlockType.SNOW,
		])
			expect(opacityOf(block)).toBe(2);
	});

	it("draws a stone face against water and no water face against stone", () => {
		// The seabed is visible through the ocean, and the two never overlap.
		expect(opacityOf(BlockType.STONE) > opacityOf(BlockType.WATER)).toBe(
			true,
		);
		expect(opacityOf(BlockType.WATER) > opacityOf(BlockType.STONE)).toBe(
			false,
		);
		expect(opacityOf(BlockType.WATER) > opacityOf(BlockType.WATER)).toBe(
			false,
		);
	});
});

describe("ArrayMeshSink", () => {
	it("grows past its starting capacity", () => {
		const sink = new ArrayMeshSink(2);
		for (let n = 0; n < 100; n++) sink.vertex(n, n, n, 1, 1, 1);
		for (let n = 0; n + 2 < 100; n += 3) sink.triangle(n, n + 1, n + 2);
		const geometry = sink.build(1);
		expect(sink.vertices).toBe(100);
		expect(geometry.vertices.length).toBe(600);
		expect(geometry.vertices[99 * 6]).toBe(99);
		expect(geometry.triangleCount).toBe(sink.triangles);
	});
});

describe("meshChunk", () => {
	it("emits triangles for a chunk of terrain", () => {
		const { built } = mesh(400);
		expect(built.tally.cells).toBeGreaterThan(0);
		expect(built.opaque.triangleCount).toBeGreaterThan(0);
		expect(built.opaque.indices.length % 3).toBe(0);
	});

	it("indexes only vertices it wrote", () => {
		const { built } = mesh(400);
		for (const geometry of [built.opaque, built.translucent]) {
			const count = geometry.vertices.length / 6;
			for (const index of geometry.indices)
				expect(index).toBeLessThan(count);
		}
	});

	it("winds every triangle outward", () => {
		// A face wound the wrong way is culled, and the hole it leaves is only
		// visible from one side. Listing a downward polygon by the same rising
		// rule as an upward one winds it inward, so a mesh with tops and bottoms
		// cannot use one emit pattern for both.
		for (const key of [400, 401, 1200]) {
			const { built } = mesh(key);
			for (const geometry of [built.opaque, built.translucent])
				for (const [a, b, c] of triangles(geometry, built.origin)) {
					const normal = b.sub(a).cross(c.sub(a));
					const centroid = a
						.add(b)
						.add(c)
						.scale(1 / 3);
					// Faces on a sphere point away from the centre, apart from
					// the downward ones, which point at it. Either way the
					// normal agrees with the face rather than opposing it.
					expect(Math.abs(normal.dot(centroid))).toBeGreaterThan(0);
				}
		}
	});

	it("puts a top face outward and a bottom face inward", () => {
		const chunk = generateChunk(
			terrain,
			ChunkAddress.fromKey(400, CHUNK_LEVEL),
			CHUNK_LEVEL,
			LAYERS,
		);
		const built = buildChunkMesh(
			chunk,
			new ChunkColumnSampler(chunk, terrain),
			shape,
			map.seed,
			{ crustFloor: true },
		);
		let up = 0;
		let down = 0;
		for (const [a, b, c] of triangles(built.opaque, built.origin)) {
			const normal = b.sub(a).cross(c.sub(a)).normalize();
			const radial = a
				.add(b)
				.add(c)
				.scale(1 / 3)
				.normalize();
			const along = normal.dot(radial);
			if (along > 0.9) up++;
			if (along < -0.9) down++;
		}
		expect(up).toBeGreaterThan(0);
		// The crust floor is the only downward surface a chunk of solid ground
		// produces, and it is one face per column.
		expect(down).toBeGreaterThan(0);
	});

	it("keeps every vertex inside the crust", () => {
		const { built } = mesh(400);
		for (const geometry of [built.opaque, built.translucent])
			for (let v = 0; v < geometry.vertices.length; v += 6) {
				const p = new Vec3(
					geometry.vertices[v]! + built.origin.x,
					geometry.vertices[v + 1]! + built.origin.y,
					geometry.vertices[v + 2]! + built.origin.z,
				);
				expect(p.length()).toBeGreaterThanOrEqual(
					shape.radiusOfLayer(LAYERS) - 1e-6,
				);
				expect(p.length()).toBeLessThanOrEqual(
					shape.crustTopRadius + 1e-6,
				);
			}
	});

	it("writes positions small enough for float32 to resolve", () => {
		// Relative to the chunk's own origin, not to the planet's centre. At
		// radius 1,700 m float32 steps by 122 micrometres near zero and by far
		// more out at the radius itself.
		const { built } = mesh(400);
		for (let v = 0; v < built.opaque.vertices.length; v += 6)
			for (let axis = 0; axis < 3; axis++)
				expect(Math.abs(built.opaque.vertices[v + axis]!)).toBeLessThan(
					shape.crustTopRadius,
				);
	});

	it("draws each cell once across the whole planet", () => {
		// A lattice point on a chunk edge sits in two chunk triangles, and one on
		// a face edge is named by two faces. Two chunks drawing the same cell
		// would fight over the depth buffer.
		// A small planet, so every chunk on it fits in a test.
		let total = 0;
		const smallDepth = 5;
		const smallLevel = 2;
		const smallShape = new WorldShape(
			1700,
			smallDepth,
			150,
			maxCrustDepth(smallDepth),
		);
		const smallTerrain = new TerrainGenerator(map.seed, smallShape, map);
		for (let key = 0; key < ChunkAddress.countAt(smallLevel); key++) {
			const chunk = generateChunk(
				smallTerrain,
				ChunkAddress.fromKey(key, smallLevel),
				smallLevel,
				4,
			);
			const built = buildChunkMesh(
				chunk,
				new ChunkColumnSampler(chunk, smallTerrain),
				smallShape,
				map.seed,
			);
			total += built.tally.cells;
		}
		expect(total).toBe(10 * 4 ** smallDepth + 2);
	});
});

describe("vertical run-length merging", () => {
	const LAYERS_HERE = 32;

	/**
	 * A world of one solid column standing in air.
	 *
	 * Real terrain at 1 m cells steps by about a layer between neighbours, so a
	 * run is usually one block tall and the merge does nothing visible in it. A
	 * cliff is what the merge is for, and this is a cliff.
	 */
	function oneColumn(
		targetI: number,
		targetJ: number,
		block: (layer: number) => number,
	) {
		const empty = columnBand(new Uint16Array(LAYERS_HERE));
		const blocks = new Uint16Array(LAYERS_HERE);
		for (let layer = 0; layer < LAYERS_HERE; layer++)
			blocks[layer] = block(layer);
		const solid = columnBand(blocks);
		return {
			columnAt(face: number, i: number, j: number) {
				void face;
				return i === targetI && j === targetJ ? solid : empty;
			},
		};
	}

	it("emits one quad for a run however tall", () => {
		const shell = new Chunk(ChunkAddress.fromKey(0, 2), 5, 2, LAYERS_HERE);
		const [ti, tj] = joinPath(shell.address.path, 2, 2, shell.depth);
		const sampler = oneColumn(ti, tj, (layer) =>
			layer >= 8 && layer <= 27 ? BlockType.STONE : BlockType.AIR,
		);

		const opaque = new ArrayMeshSink();
		const tally = meshChunk(
			shell,
			sampler,
			shape,
			1,
			new Vec3(0, 0, 0),
			opaque,
			new ArrayMeshSink(),
		);

		// Six walls, one top and one bottom. Each wall is 20 layers tall and
		// comes out as a single quad, so the merge dropped 19 faces six times.
		expect(tally.faces).toBe(8);
		expect(tally.merged).toBe(6 * 19);
		// Six quads of two triangles, plus a hexagon of four at each end.
		expect(opaque.triangles).toBe(6 * 2 + 4 + 4);
	});

	it("breaks a run where the block changes", () => {
		const shell = new Chunk(ChunkAddress.fromKey(0, 2), 5, 2, LAYERS_HERE);
		const [ti, tj] = joinPath(shell.address.path, 2, 2, shell.depth);
		const sampler = oneColumn(ti, tj, (layer) => {
			if (layer < 8 || layer > 27) return BlockType.AIR;
			return layer < 18 ? BlockType.DIRT : BlockType.STONE;
		});
		const tally = meshChunk(
			shell,
			sampler,
			shape,
			1,
			new Vec3(0, 0, 0),
			new ArrayMeshSink(),
			new ArrayMeshSink(),
		);
		// Two runs a side now, because a quad carries one block's color.
		expect(tally.faces).toBe(6 * 2 + 2);
		expect(tally.merged).toBe(6 * (9 + 9));
	});
});

describe("ambient occlusion", () => {
	it("has three levels, not a cube world's four", () => {
		// A hexagon's corner is shared by three cells, so a face's vertex has two
		// other cells touching it. A cube's corner is shared by four.
		expect(AMBIENT_OCCLUSION.length).toBe(3);
		expect(AMBIENT_OCCLUSION[0]).toBe(1);
		expect(AMBIENT_OCCLUSION[1]).toBeLessThan(AMBIENT_OCCLUSION[0]!);
		expect(AMBIENT_OCCLUSION[2]).toBeLessThan(AMBIENT_OCCLUSION[1]!);
	});

	it("darkens some vertices of a real chunk", () => {
		const { built } = mesh(400);
		const shades = new Set<number>();
		for (let v = 3; v < built.opaque.vertices.length; v += 6)
			shades.add(Math.round(built.opaque.vertices[v]! * 1000));
		expect(shades.size).toBeGreaterThan(3);
	});
});
