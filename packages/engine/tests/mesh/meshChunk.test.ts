import { beforeAll, describe, expect, it } from "vitest";
import type { CoarseMap } from "chamfer/generation";
import {
	BLOCK_COLORS,
	BlockType,
	Chunk,
	ChunkAddress,
	ChunkColumnSampler,
	columnBand,
	TerrainGenerator,
	buildCoarseMap,
	flatCoarseMap,
	generateChunk,
	blockColor,
	SPECKLE,
	seedFromString,
	selectChunks,
} from "chamfer/generation";
import {
	AMBIENT_OCCLUSION,
	ArrayMeshSink,
	buildChunkMesh,
	meshChunk,
	opacityOf,
} from "chamfer/mesh";
import type { MeshOptions } from "chamfer/mesh";
import { Vec3 } from "chamfer/math";
import { WorldShape, maxCrustDepth } from "chamfer/world";
import {
	canonicalCell,
	cellCorners,
	joinPath,
	latticePosition,
	neighbour,
	positionToCell,
	splitPath,
} from "chamfer/addressing";
import { coarseCell } from "chamfer/edit";
import type { Geometry } from "chamfer/mesh";

const DEPTH = 8;
const CHUNK_LEVEL = 4;
const LAYERS = 60;

let map: CoarseMap;
let shape: WorldShape;
let terrain: TerrainGenerator;

beforeAll(() => {
	map = buildCoarseMap(seedFromString("chamfer"), {
		level: 6,
		cellMetres: 100,
		relief: 100,
	});
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

/** A repeatable spread of directions over the sphere. */
function* spread(count: number) {
	let s = 24680;
	const rnd = () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 2 ** 32;
	};
	for (let n = 0; n < count; n++) {
		const z = 2 * rnd() - 1;
		const phi = 2 * Math.PI * rnd();
		const r = Math.sqrt(1 - z * z);
		yield new Vec3(r * Math.cos(phi), r * Math.sin(phi), z).normalize();
	}
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

/** Whether a segment meets any triangle of a soup. Möller-Trumbore. */
function meets(
	from: Vec3,
	direction: Vec3,
	limit: number,
	soup: readonly (readonly [Vec3, Vec3, Vec3])[],
): boolean {
	for (const [a, b, c] of soup) {
		const e1 = b.sub(a);
		const e2 = c.sub(a);
		const p = direction.cross(e2);
		const det = e1.dot(p);
		if (Math.abs(det) < 1e-12) continue;
		const t = from.sub(a);
		const u = t.dot(p) / det;
		if (u < 0 || u > 1) continue;
		const q = t.cross(e1);
		const v = direction.dot(q) / det;
		if (v < 0 || u + v > 1) continue;
		const hit = e2.dot(q) / det;
		if (hit > 0 && hit < limit) return true;
	}
	return false;
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

describe("merging at a level seam", () => {
	/** The largest radius any vertex of a mesh reaches. */
	function crest(built: { origin: Vec3; opaque: Geometry }): number {
		const v = built.opaque.vertices;
		let highest = 0;
		for (let at = 0; at < v.length; at += 6) {
			const x = v[at]! + built.origin.x;
			const y = v[at + 1]! + built.origin.y;
			const z = v[at + 2]! + built.origin.z;
			highest = Math.max(highest, Math.sqrt(x * x + y * y + z * z));
		}
		return highest;
	}

	function flatMesh(lod: number, grid: number) {
		const flat = flatCoarseMap(map.seed, 2);
		const base = new WorldShape(1700, DEPTH, 1, maxCrustDepth(DEPTH));
		const at = base.atLod(lod);
		const gen = new TerrainGenerator(map.seed, at, flat, {});
		const chunk = generateChunk(
			gen,
			ChunkAddress.fromKey(0, CHUNK_LEVEL - lod),
			CHUNK_LEVEL - lod,
			at.crustDepth,
		);
		return buildChunkMesh(
			chunk,
			new ChunkColumnSampler(chunk, gen),
			at,
			map.seed,
			{ apron: true, surfaceGrid: grid },
		);
	}

	it("puts every level's surface of a flat world at one radius", () => {
		// A chunk drawn coarser rounds its surfaces to its own coarser layer
		// grid, so on a world with no relief each level's whole surface sat a
		// different number of metres down and every level join was a cliff.
		// Snapped to the shared fine grid, levels agree wherever the terrain
		// does -- on a flat world, everywhere.
		const base = new WorldShape(1700, DEPTH, 1, maxCrustDepth(DEPTH));
		const fine = crest(flatMesh(0, base.blockSize));
		const coarse = crest(flatMesh(1, base.blockSize));
		expect(Math.abs(fine - coarse)).toBeLessThan(0.02);

		// Without the shared grid the coarser level rounds a whole coarse
		// block further down, which is the seam the merge removes. Zero asks
		// for the chunk's own grid, which is what an unmerged level used.
		const unmerged = crest(flatMesh(1, 0));
		expect(fine - unmerged).toBeGreaterThan(base.blockSize * 0.9);
	});

	it("draws the apron with the skirt, and not without", () => {
		const chunk = generateChunk(
			terrain,
			ChunkAddress.fromKey(9, CHUNK_LEVEL),
			CHUNK_LEVEL,
			LAYERS,
		);
		const bare = buildChunkMesh(
			chunk,
			new ChunkColumnSampler(chunk, terrain),
			shape,
			map.seed,
		);
		const skirted = buildChunkMesh(
			chunk,
			new ChunkColumnSampler(chunk, terrain),
			shape,
			map.seed,
			{ apron: true },
		);
		expect(bare.tally.apron).toBe(0);
		const m = 1 << (DEPTH - CHUNK_LEVEL);
		expect(skirted.tally.apron).toBeGreaterThan(m);
		expect(skirted.tally.apron).toBeLessThan(4 * (m + 2));
	});

	it("draws exactly the apron ring, on chunks that cross a face edge too", () => {
		// The apron set has one correct definition: the canonicalised outward
		// neighbours of the cells the chunk draws, minus the ones it draws
		// itself. A neighbour across a face edge carries the other face's
		// coordinates, and testing those against this chunk's triangle without
		// checking the face lets a path-match drop a cell — a sparse dotted
		// line of holes along exactly the boundaries that follow face edges.
		const level = 2;
		const m = 1 << (DEPTH - level);
		const n = 1 << DEPTH;
		for (let key = 0; key < 4 ** level; key++) {
			const address = ChunkAddress.fromKey(key, level);
			const face = address.face;

			const draws = (cell: {
				face: number;
				i: number;
				j: number;
			}): boolean => {
				const canon = canonicalCell(cell.face, n, cell.i, cell.j);
				if (canon.face !== face) return false;
				const split = splitPath(canon.i, canon.j, DEPTH, level);
				for (let at = 0; at < split.path.length; at++)
					if (split.path[at] !== address.path[at]) return false;
				return true;
			};

			const expected = new Set<number>();
			const put = (cell: { face: number; i: number; j: number }) => {
				const canon = canonicalCell(cell.face, n, cell.i, cell.j);
				if (draws(canon)) return;
				expected.add(
					(canon.face * 262144 + canon.i) * 262144 + canon.j,
				);
			};
			for (let q = 0; q <= m; q++)
				for (let r = 0; q + r <= m; r++) {
					const [i, j] = joinPath(address.path, q, r, DEPTH);
					if (!draws({ face, i, j })) continue;
					for (let k = 0; k < 6; k++) {
						const nb = neighbour(face, n, i, j, k);
						if (!nb || draws(nb)) continue;
						put(nb);
					}
				}
			// The three corner cells and their rings go in outright.
			for (const [cq, cr] of [
				[0, 0],
				[m, 0],
				[0, m],
			] as const) {
				const [ci, cj] = joinPath(address.path, cq, cr, DEPTH);
				const corner = canonicalCell(face, n, ci, cj);
				put(corner);
				const degree = cellCorners(
					corner.face,
					n,
					corner.i,
					corner.j,
				).length;
				for (let k = 0; k < degree; k++) {
					const nb = neighbour(corner.face, n, corner.i, corner.j, k);
					if (nb) put(nb);
				}
			}

			const chunk = generateChunk(terrain, address, level, LAYERS);
			const built = buildChunkMesh(
				chunk,
				new ChunkColumnSampler(chunk, terrain),
				shape,
				map.seed,
				{ apron: true },
			);
			expect(built.tally.apron).toBe(expected.size);
		}
	});

	it("walls the band a coarser neighbour's ground leaves under the apron", () => {
		// The apron is a lid: caps, and a wall wherever a cell in the ring
		// stands over another cell the same chunk drew. At the ring's OUTER
		// edge there is no such cell -- what is over there belongs to a
		// neighbouring chunk, which may be drawing it a level coarser, and a
		// level draws the ground at the points it kept rather than at the
		// points between them. The two surfaces then stand apart with nothing
		// between them, which reads as a bite out of the hillside with ground
		// several metres lower showing through it.
		//
		// The wall is computable from one side because a point's height does
		// not depend on who asks: the ground a coarser neighbour puts over a
		// cell is this chunk's own reading of the coarse lattice point that
		// cell falls into.
		const rough = buildCoarseMap(seedFromString("seam-band"), {
			level: 6,
			cellMetres: 100,
			relief: 200,
		});
		const steep = new WorldShape(1700, DEPTH, 260, maxCrustDepth(DEPTH));
		const gen = new TerrainGenerator(rough.seed, steep, rough);
		const n = 1 << DEPTH;
		const m = 1 << (DEPTH - CHUNK_LEVEL);

		/** Where a cell's ground cap is drawn, on the shared fine grid. */
		const capOf = (cell: {
			face: number;
			i: number;
			j: number;
		}): number => {
			const ground = gen.columnAt(cell.face, cell.i, cell.j).groundRadius;
			return ground > 0
				? steep.radiusOfLayer(steep.layerOfSurface(ground))
				: 0;
		};

		let bands = 0;
		let bare = 0;
		for (const key of [5, 37, 96, 141, 202]) {
			const address = ChunkAddress.fromKey(key, CHUNK_LEVEL);
			const face = address.face;
			const draws = (cell: {
				face: number;
				i: number;
				j: number;
			}): boolean => {
				const canon = canonicalCell(cell.face, n, cell.i, cell.j);
				if (canon.face !== face) return false;
				const split = splitPath(canon.i, canon.j, DEPTH, CHUNK_LEVEL);
				for (let at = 0; at < split.path.length; at++)
					if (split.path[at] !== address.path[at]) return false;
				return true;
			};

			// The apron: the canonicalised outward neighbours of the cells the
			// chunk draws, plus the three corners and their rings.
			const apron = new Map<
				number,
				{ face: number; i: number; j: number }
			>();
			const put = (cell: { face: number; i: number; j: number }) => {
				const canon = canonicalCell(cell.face, n, cell.i, cell.j);
				if (draws(canon)) return;
				apron.set(
					(canon.face * 262144 + canon.i) * 262144 + canon.j,
					canon,
				);
			};
			for (let q = 0; q <= m; q++)
				for (let r = 0; q + r <= m; r++) {
					const [i, j] = joinPath(address.path, q, r, DEPTH);
					if (!draws({ face, i, j })) continue;
					for (let k = 0; k < 6; k++) {
						const nb = neighbour(face, n, i, j, k);
						if (nb) put(nb);
					}
				}
			for (const [cq, cr] of [
				[0, 0],
				[m, 0],
				[0, m],
			] as const) {
				const [ci, cj] = joinPath(address.path, cq, cr, DEPTH);
				const corner = canonicalCell(face, n, ci, cj);
				put(corner);
				for (
					let k = 0;
					k < cellCorners(corner.face, n, corner.i, corner.j).length;
					k++
				) {
					const nb = neighbour(corner.face, n, corner.i, corner.j, k);
					if (nb) put(nb);
				}
			}
			const drawn = (cell: { face: number; i: number; j: number }) => {
				if (draws(cell)) return true;
				const canon = canonicalCell(cell.face, n, cell.i, cell.j);
				return apron.has(
					(canon.face * 262144 + canon.i) * 262144 + canon.j,
				);
			};

			const chunk = generateChunk(
				gen,
				address,
				CHUNK_LEVEL,
				steep.crustDepth,
			);
			const built = buildChunkMesh(
				chunk,
				new ChunkColumnSampler(chunk, gen),
				steep,
				rough.seed,
				{ apron: true, surfaceGrid: steep.blockSize },
			);
			const soup = [...triangles(built.opaque, built.origin)];

			for (const cell of apron.values()) {
				const corners = cellCorners(cell.face, n, cell.i, cell.j);
				const mine = capOf(cell);
				if (mine <= 0) continue;
				for (let k = 0; k < corners.length; k++) {
					const nb = neighbour(cell.face, n, cell.i, cell.j, k);
					if (!nb) continue;
					if (drawn(nb)) {
						// A step between two cells this chunk itself draws.
						// The chunk over there draws coarse cells, never
						// these, so the wall between the ring's own heights
						// is this chunk's job as much as the outer edges
						// are -- the slits between ring cells showed the sea
						// through every step the gate left out.
						const theirsFine = capOf(nb);
						if (theirsFine <= 0) continue;
						const high = Math.max(mine, theirsFine);
						const low = Math.min(mine, theirsFine);
						if (high - low <= 1e-6) continue;
						bands++;
						const left =
							corners[(k + corners.length - 1) % corners.length]!;
						const middle = left.add(corners[k]!).normalize();
						const step = latticePosition(nb.face, n, nb.i, nb.j)
							.sub(latticePosition(cell.face, n, cell.i, cell.j))
							.normalize();
						let holed = false;
						for (const f of [0.15, 0.4, 0.65, 0.9]) {
							const from = middle
								.scale(low + (high - low) * f)
								.sub(step.scale(steep.blockSize));
							if (!meets(from, step, 2 * steep.blockSize, soup)) {
								holed = true;
								break;
							}
						}
						if (holed) bare++;
						continue;
					}
					const coarse = coarseCell(
						{ face: nb.face, i: nb.i, j: nb.j, layer: 0 },
						DEPTH,
						1,
					);
					const theirs = capOf({
						face: coarse.face,
						i: coarse.i << 1,
						j: coarse.j << 1,
					});
					// The whole frontier face: from this chunk's own cap down
					// to the ground the coarser level draws. Measuring from
					// the lower of the two own-level caps instead is how the
					// step walls between two fine cells across the boundary
					// went unmeasured -- and on a slope they are most of it.
					if (theirs <= 0 || mine - theirs <= 1e-6) continue;
					bands++;

					// A wall there stands on the edge shared with the cell
					// beyond, which runs between corners `k - 1` and `k`.
					// Short segments crossing that edge at several heights
					// meet it if it exists -- several, because different
					// pieces close the band at different depths and one
					// mid-height probe misses a hole above or below it.
					const left =
						corners[(k + corners.length - 1) % corners.length]!;
					const middle = left.add(corners[k]!).normalize();
					const step = latticePosition(nb.face, n, nb.i, nb.j)
						.sub(latticePosition(cell.face, n, cell.i, cell.j))
						.normalize();
					let holed = false;
					for (const f of [0.15, 0.4, 0.65, 0.9]) {
						const from = middle
							.scale(theirs + (mine - theirs) * f)
							.sub(step.scale(steep.blockSize));
						if (!meets(from, step, 2 * steep.blockSize, soup)) {
							holed = true;
							break;
						}
					}
					if (holed) bare++;
				}
			}
		}
		// The test has to bite: a world with no relief leaves no band at all.
		expect(bands).toBeGreaterThan(20);
		expect(bare).toBe(0);
	});

	it("walls the step between neighbours level at the coarse grid", () => {
		// Two neighbours in one coarse layer can stand several fine layers
		// apart once their caps snap to the shared fine grid, and the side
		// runs never cover that span: at the chunk's own resolution the two
		// columns are the same height, so no run exists there at all. The
		// terrace brinks of a coarse chunk showed the missing walls as slits.
		const lod = 2;
		const at2 = shape.atLod(lod);
		const gen = new TerrainGenerator(map.seed, at2, map);
		const level = CHUNK_LEVEL - lod;
		const address = ChunkAddress.fromKey(2, level);
		const chunk = generateChunk(gen, address, level, at2.crustDepth);
		const built = buildChunkMesh(
			chunk,
			new ChunkColumnSampler(chunk, gen),
			at2,
			map.seed,
			{ apron: true, surfaceGrid: shape.blockSize },
		);

		// Find an interior pair of solid neighbours sharing a coarse layer
		// whose snapped caps differ, and demand the wall's four corners among
		// the vertices.
		const n2 = 1 << at2.subdivisionDepth;
		const snapped = (radius: number) =>
			at2.crustTopRadius -
			Math.ceil((at2.crustTopRadius - radius) / shape.blockSize - 1e-9) *
				shape.blockSize;
		const sampler = new ChunkColumnSampler(chunk, gen);
		let checked = 0;
		for (let q = 1; q < chunk.m && checked < 3; q++)
			for (let r = 1; q + r < chunk.m && checked < 3; r++) {
				const [i, j] = joinPath(
					address.path,
					q,
					r,
					at2.subdivisionDepth,
				);
				const own = sampler.columnAt(address.face, i, j);
				const ownCap = at2.layerOfSurface(own.groundRadius);
				const ownTop = snapped(own.groundRadius);
				for (let k = 0; k < 6 && checked < 3; k++) {
					const nb = neighbour(address.face, n2, i, j, k);
					if (!nb || nb.face !== address.face) continue;
					const other = sampler.columnAt(nb.face, nb.i, nb.j);
					if (at2.layerOfSurface(other.groundRadius) !== ownCap)
						continue;
					const otherTop = snapped(other.groundRadius);
					if (ownTop - otherTop < shape.blockSize * 0.5) continue;

					const corners = cellCorners(address.face, n2, i, j);
					const degree = corners.length;
					const left = corners[(k + degree - 1) % degree]!;
					const right = corners[k]!;
					// A cap is horizontal, so only a wall face mixes the two
					// radii: demand a triangle with a corner on each.
					const near = (
						v: Vec3,
						p: Vec3,
						radius: number,
					): boolean => {
						const dx = v.x - p.x * radius;
						const dy = v.y - p.y * radius;
						const dz = v.z - p.z * radius;
						return dx * dx + dy * dy + dz * dz < 1e-2;
					};
					let wall = false;
					for (const [a, b, c] of triangles(
						built.opaque,
						built.origin,
					)) {
						let tops = 0;
						let bottoms = 0;
						for (const v of [a, b, c]) {
							if (near(v, left, ownTop) || near(v, right, ownTop))
								tops++;
							if (
								near(v, left, otherTop) ||
								near(v, right, otherTop)
							)
								bottoms++;
						}
						if (tops > 0 && bottoms > 0) {
							wall = true;
							break;
						}
					}
					expect(wall).toBe(true);
					checked++;
				}
			}
		expect(checked).toBeGreaterThan(0);
	});

	it("has an apron cell for every hole two levels leave between them", () => {
		// Two levels tile a shared boundary with hexagons of two sizes, and
		// those do not interlock: some ground's containing cell is centred in
		// the chunk across the line, at a lattice that chunk does not use, so
		// nobody's own cells draw it. The apron ring is exactly what covers
		// it, and this is the check that it always does.
		const viewer = new Vec3(0.3, 0.7, 0.5).normalize();
		const chosen = selectChunks(DEPTH, CHUNK_LEVEL, viewer, 2100, 1700);
		const lods = new Set(chosen.map((sel) => sel.lod));
		expect(lods.size).toBeGreaterThan(1);

		const parsed = chosen.map((sel) => ({
			lod: sel.lod,
			n: 1 << (DEPTH - sel.lod),
			depth: DEPTH - sel.lod,
			address: ChunkAddress.fromKey(sel.key, sel.chunkLevel),
			chunkLevel: sel.chunkLevel,
		}));
		type Parsed = (typeof parsed)[number];

		const drawn = (
			chunk: Parsed,
			cell: { face: number; i: number; j: number },
		): boolean => {
			if (cell.face !== chunk.address.face) return false;
			const split = splitPath(
				cell.i,
				cell.j,
				chunk.depth,
				chunk.chunkLevel,
			);
			for (let level = 0; level < split.path.length; level++)
				if (split.path[level] !== chunk.address.path[level])
					return false;
			return true;
		};
		const owned = (chunk: Parsed, direction: Vec3): boolean => {
			const cell = positionToCell(direction, chunk.n);
			return drawn(
				chunk,
				canonicalCell(cell.face, chunk.n, cell.i, cell.j),
			);
		};
		const aproned = (chunk: Parsed, direction: Vec3): boolean => {
			const cell = positionToCell(direction, chunk.n);
			const canon = canonicalCell(cell.face, chunk.n, cell.i, cell.j);
			for (let k = 0; k < 6; k++) {
				const nb = neighbour(canon.face, chunk.n, canon.i, canon.j, k);
				if (!nb) continue;
				if (drawn(chunk, canonicalCell(nb.face, chunk.n, nb.i, nb.j)))
					return true;
			}
			return false;
		};

		const east = viewer.cross(new Vec3(0, 1, 0)).normalize();
		const north = viewer.cross(east).normalize();
		let s = 13579;
		const rnd = () => {
			s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
			return s / 2 ** 32;
		};
		let inside = 0;
		let bare = 0;
		let uncovered = 0;
		for (let t = 0; t < 6000; t++) {
			const direction = viewer
				.add(east.scale((rnd() - 0.5) * 1.2))
				.add(north.scale((rnd() - 0.5) * 1.2))
				.normalize();
			if (!parsed.some((chunk) => owned(chunk, direction))) {
				// Inside the selection at all?
				const base = positionToCell(direction, 1 << DEPTH);
				const canon = canonicalCell(
					base.face,
					1 << DEPTH,
					base.i,
					base.j,
				);
				const home = parsed.find((chunk) =>
					drawn({ ...chunk, depth: DEPTH } as Parsed, {
						face: canon.face,
						i: canon.i,
						j: canon.j,
					}),
				);
				if (!home) continue;
				inside++;
				bare++;
				if (!parsed.some((chunk) => aproned(chunk, direction)))
					uncovered++;
			} else inside++;
		}
		expect(inside).toBeGreaterThan(1000);
		// The gap is real -- some ground is nobody's own cell...
		expect(bare).toBeGreaterThan(0);
		// ...and the apron reaches all of it.
		expect(uncovered).toBe(0);
	});
});

describe("the wall weld", () => {
	// The vertical line where two walls meet holds vertices from both sides,
	// and the two sets rarely agree -- runs merge over different spans, and
	// across a chunk boundary one corner is computed against two origins. The
	// rasterizer then leaves pinprick holes along the line, bright wherever
	// the unlit inside of the planet is behind them. Every side face runs a
	// few millimetres past its own corners so whatever meets it on that line
	// is overlapped, never abutted.
	it("reaches past its corner, into the rock around it", () => {
		// A flat world with one three-layer pit dug into it, so every height
		// is exact by construction: the pit's neighbour A draws a wall toward
		// the pit B, and the third cell C at their shared corner is solid at
		// the wall's mid-height. The weld must reach past the corner into C's
		// rock; before it, the probe segment there met nothing at all.
		const flat = flatCoarseMap(map.seed, 2);
		const flatShape = new WorldShape(1700, DEPTH, 1, maxCrustDepth(DEPTH));
		const gen = new TerrainGenerator(map.seed, flatShape, flat);
		const n = 1 << DEPTH;
		const m = 1 << (DEPTH - CHUNK_LEVEL);
		const address = ChunkAddress.fromKey(0, CHUNK_LEVEL);
		const [bi, bj] = joinPath(address.path, m >> 1, m >> 2, DEPTH);

		const chunk = generateChunk(
			gen,
			address,
			CHUNK_LEVEL,
			flatShape.crustDepth,
		);
		const real = new ChunkColumnSampler(chunk, gen);
		const dug = 3;
		const sampler = {
			columnAt(f: number, i: number, j: number) {
				const col = real.columnAt(f, i, j);
				const c = canonicalCell(f, n, i, j);
				if (c.face !== 0 || c.i !== bi || c.j !== bj) return col;
				const blocks = col.blocks.slice();
				for (let l = col.first; l < col.first + dug; l++)
					blocks[l] = BlockType.AIR;
				return {
					...col,
					blocks,
					first: col.first + dug,
					// The dug layers are the lowest air the column has now.
					last: col.first + dug - 1,
					groundRadius: col.groundRadius - dug * flatShape.blockSize,
				};
			},
		};
		const built = buildChunkMesh(chunk, sampler, flatShape, map.seed, {});
		const soup = [...triangles(built.opaque, built.origin)];

		// A is the pit's neighbour toward direction 3, seen from the pit; k
		// is the direction that leads back from A to the pit.
		const a = neighbour(0, n, bi, bj, 3)!;
		const corners = cellCorners(a.face, n, a.i, a.j);
		const degree = corners.length;
		let k = -1;
		for (let d = 0; d < degree; d++) {
			const nb = neighbour(a.face, n, a.i, a.j, d)!;
			if (nb.i === bi && nb.j === bj) k = d;
		}
		expect(k).toBeGreaterThanOrEqual(0);

		const ground = real.columnAt(a.face, a.i, a.j).groundRadius;
		const capA = flatShape.radiusOfLayer(flatShape.layerOfSurface(ground));
		const rMid = capA - 1.5 * flatShape.blockSize;

		// The wall runs between corners k - 1 and k; its plane's normal is
		// across the edge. Probe through the wall proper, then through the
		// zone past corner k, where only the weld can be.
		const left = corners[(k + degree - 1) % degree]!;
		const right = corners[k]!;
		const edge = right.sub(left).normalize();
		const normal = edge.cross(right).normalize();
		const probe = (past: number, r: number): boolean => {
			const at = right.scale(r).add(edge.scale(past));
			return meets(at.sub(normal.scale(0.0015)), normal, 0.003, soup);
		};
		// 2 mm inside its own edge: the wall itself.
		expect(probe(-0.002, rMid)).toBe(true);
		// 3 mm past the corner: the weld, inside cell C's rock.
		expect(probe(0.003, rMid)).toBe(true);

		// The wall must also run past its own ends, or the junction with the
		// caps is two edges meeting on one line and the rasterizer dots it.
		// 2 mm above A's cap, and 2 mm below the pit's floor -- both inside
		// the zone only the end weld can occupy.
		const floorR = flatShape.radiusOfLayer(
			flatShape.layerOfSurface(ground) + dug,
		);
		expect(probe(-0.002, capA + 0.002)).toBe(true);
		expect(probe(-0.002, floorR - 0.002)).toBe(true);
	});
});

describe("a surface exactly on a layer boundary", () => {
	// The paused world puts the ground at sea level everywhere, and sea level
	// is a radius, so every column on the planet tops a layer exactly. That is
	// the worst case for the ceil that turns a radius into a layer: any two
	// readings of one surface that do not agree to the bit land on different
	// layers, and a wall stands between them.
	const boundary = () => {
		const first = new WorldShape(6800.648485818399, 10, 1, 24);
		return new WorldShape(6800.648485818399, 10, 3 * first.blockSize, 24);
	};

	it("meshes to caps, with no wall anywhere", () => {
		const flat = flatCoarseMap(seedFromString("chamfer"), 2);
		const world = boundary();
		const generator = new TerrainGenerator(flat.seed, world, flat, {});
		const chunk = generateChunk(
			generator,
			ChunkAddress.fromKey(3, 6),
			6,
			24,
		);
		const built = buildChunkMesh(
			chunk,
			new ChunkColumnSampler(chunk, generator),
			world,
			flat.seed,
			{ apron: true, surfaceGrid: world.blockSize },
		);

		const vertices = built.opaque.vertices;
		const indices = built.opaque.indices;
		const origin = built.origin;
		const radiusOf = (index: number) =>
			Math.hypot(
				vertices[index * 6]! + origin.x,
				vertices[index * 6 + 1]! + origin.y,
				vertices[index * 6 + 2]! + origin.z,
			);
		let walls = 0;
		for (let t = 0; t + 2 < indices.length; t += 3) {
			const radii = [0, 1, 2].map((corner) =>
				radiusOf(indices[t + corner]!),
			);
			if (Math.max(...radii) - Math.min(...radii) > 0.05) walls++;
		}
		expect(indices.length).toBeGreaterThan(0);
		expect(built.tally.apron).toBeGreaterThan(0);
		expect(walls).toBe(0);
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

	it("gives one triangle's three corners the same colour when it is off", () => {
		// A single face is one call to `paint` and `shade`, so within one
		// triangle the only thing that can move a vertex's colour is which of
		// its own two neighbours are solid -- flip the switch and every corner
		// of that face has to read as the one thing left to say about it: full
		// light. Checking the whole buffer for "one shade" would also catch a
		// sky-exposure or speckle difference between two different faces,
		// which this switch does not touch and must not flatten.
		const { chunk } = mesh(400);
		const built = buildChunkMesh(
			chunk,
			new ChunkColumnSampler(chunk, terrain),
			shape,
			map.seed,
			{ ambientOcclusion: false },
		);
		const { vertices, indices } = built.opaque;
		let checked = 0;
		for (let t = 0; t + 2 < indices.length; t += 3) {
			const at = (corner: number) => indices[t + corner]! * 6;
			const [a, b, c] = [0, 1, 2].map(at);
			for (let ch = 3; ch < 6; ch++) {
				expect(vertices[a! + ch]).toBe(vertices[b! + ch]);
				expect(vertices[a! + ch]).toBe(vertices[c! + ch]);
			}
			checked++;
		}
		expect(checked).toBeGreaterThan(0);
	});

	it("lets a triangle's own corners differ when it is on", () => {
		// The property the off case removes: a real chunk has at least one
		// face where two corners see a different number of solid neighbours,
		// so their colours are not the same triangle-by-triangle -- not just
		// somewhere in the whole buffer, which a sky-exposure difference
		// between unrelated faces could also produce.
		const { built } = mesh(400);
		const { vertices, indices } = built.opaque;
		let differs = false;
		for (let t = 0; t + 2 < indices.length && !differs; t += 3) {
			const at = (corner: number) => indices[t + corner]! * 6;
			const [a, b, c] = [0, 1, 2].map(at);
			if (
				vertices[a! + 3] !== vertices[b! + 3] ||
				vertices[a! + 3] !== vertices[c! + 3]
			)
				differs = true;
		}
		expect(differs).toBe(true);
	});

	it("changes nothing about the geometry, only the vertex colour", () => {
		// The same corner and the same triangles either way: turning this off
		// is a lighting choice, not a different mesh.
		const { chunk } = mesh(400);
		const lit = buildChunkMesh(
			chunk,
			new ChunkColumnSampler(chunk, terrain),
			shape,
			map.seed,
		);
		const flat = buildChunkMesh(
			chunk,
			new ChunkColumnSampler(chunk, terrain),
			shape,
			map.seed,
			{ ambientOcclusion: false },
		);
		expect(flat.opaque.indices).toEqual(lit.opaque.indices);
		expect(flat.opaque.vertices.length).toBe(lit.opaque.vertices.length);
		for (let v = 0; v < lit.opaque.vertices.length; v += 6)
			for (let c = 0; c < 3; c++)
				expect(flat.opaque.vertices[v + c]).toBeCloseTo(
					lit.opaque.vertices[v + c]!,
					5,
				);
	});
});

describe("the speckle", () => {
	/**
	 * **Zero is the flat block colour and nothing else.** Not a hash multiplied
	 * by nothing: a cell that took no speckle has to be the number in the
	 * registry to the bit, because the state of the switch is what makes a
	 * picture of the world comparable with a picture of the map.
	 */
	it("gives the registry's own colour when it is off", () => {
		const out = new Float32Array(3);
		for (const block of [
			BlockType.GRASS,
			BlockType.STONE,
			BlockType.SNOW,
		]) {
			const want = BLOCK_COLORS[block]!;
			for (const [face, i, j] of [
				[0, 0, 0],
				[7, 13, 5],
				[19, 100, 3],
			] as const) {
				blockColor(block, face, i, j, 12345, out, 0, 0);
				// Through `float32`, which is what a vertex buffer holds: the
				// claim is that nothing multiplied it, not that a vertex can
				// carry a `float64`.
				expect([...out]).toEqual(want.map((v) => Math.fround(v)));
			}
		}
	});

	it("moves a cell either way, and never by more than it is asked for", () => {
		const out = new Float32Array(3);
		const base = BLOCK_COLORS[BlockType.GRASS]!;
		let up = 0;
		let down = 0;
		let worst = 0;
		for (let i = 0; i < 400; i++) {
			blockColor(BlockType.GRASS, 3, i, 7, 99, out, 0);
			const by = out[1]! / base[1]! - 1;
			if (by > 0) up++;
			if (by < 0) down++;
			worst = Math.max(worst, Math.abs(by));
		}
		expect(up).toBeGreaterThan(100);
		expect(down).toBeGreaterThan(100);
		expect(worst).toBeLessThanOrEqual(SPECKLE);
		expect(worst).toBeGreaterThan(SPECKLE * 0.9);
	});

	/**
	 * The switch, end to end: the option a panel sets reaches the colours in a
	 * vertex buffer. Off, a chunk of one block type holds a handful of colours
	 * -- one per material, times the corner occlusion and the column's own sky
	 * -- and on, it holds hundreds, because every cell took its own.
	 */
	it("reaches the vertex buffer a chunk hands over", () => {
		const chunk = generateChunk(
			terrain,
			ChunkAddress.fromKey(700, CHUNK_LEVEL),
			CHUNK_LEVEL,
			LAYERS,
		);
		const greens = (speckle: number): number => {
			const sink = new ArrayMeshSink();
			meshChunk(
				chunk,
				new ChunkColumnSampler(chunk, terrain),
				shape,
				map.seed,
				new Vec3(0, 0, 0),
				sink,
				new ArrayMeshSink(),
				{ speckle },
			);
			const seen = new Set<number>();
			const { vertices } = sink.build(0);
			for (let v = 3; v < vertices.length; v += 6)
				seen.add(Math.round(vertices[v + 1]! * 100000));
			return seen.size;
		};
		const off = greens(0);
		const on = greens(SPECKLE);
		expect(off).toBeGreaterThan(0);
		expect(on).toBeGreaterThan(off * 10);
	});

	it("is the same cell every time, on any machine", () => {
		const one = new Float32Array(3);
		const two = new Float32Array(3);
		blockColor(BlockType.GRASS, 5, 31, 12, 7, one, 0);
		blockColor(BlockType.GRASS, 5, 31, 12, 7, two, 0);
		expect([...one]).toEqual([...two]);
	});
});

describe("sky exposure", () => {
	/**
	 * A flat world with one deep shaft dug into it, and what sky factor every
	 * vertex came out with, gathered by how far below the surface it sits.
	 *
	 * With the speckle and the corner shading off, a vertex colour is exactly
	 * the registry's colour for its block times the sky exposure -- so
	 * dividing one out recovers the other, and nothing else is in the number.
	 */
	function shaftSky(
		options: MeshOptions,
	): { depth: number; lo: number; hi: number }[] {
		const flat = flatCoarseMap(map.seed, 2);
		const flatShape = new WorldShape(1700, DEPTH, 1, maxCrustDepth(DEPTH));
		const gen = new TerrainGenerator(map.seed, flatShape, flat);
		const n = 1 << DEPTH;
		const m = 1 << (DEPTH - CHUNK_LEVEL);
		const address = ChunkAddress.fromKey(0, CHUNK_LEVEL);
		const [bi, bj] = joinPath(address.path, m >> 1, m >> 2, DEPTH);

		const chunk = generateChunk(
			gen,
			address,
			CHUNK_LEVEL,
			flatShape.crustDepth,
		);
		const real = new ChunkColumnSampler(chunk, gen);
		const dug = 12;
		const sampler = {
			columnAt(f: number, i: number, j: number) {
				const col = real.columnAt(f, i, j);
				const c = canonicalCell(f, n, i, j);
				if (c.face !== 0 || c.i !== bi || c.j !== bj) return col;
				const blocks = col.blocks.slice();
				for (let l = col.first; l < col.first + dug; l++)
					blocks[l] = BlockType.AIR;
				return {
					...col,
					blocks,
					first: col.first + dug,
					last: col.first + dug - 1,
					groundRadius: col.groundRadius - dug * flatShape.blockSize,
				};
			},
		};
		const built = buildChunkMesh(chunk, sampler, flatShape, map.seed, {
			ambientOcclusion: false,
			speckle: 0,
			...options,
		});

		const palette = Object.values(BLOCK_COLORS) as readonly (
			| readonly [number, number, number]
			| undefined
		)[];
		const skyOf = (r: number, g: number, b: number): number | null => {
			for (const c of palette) {
				if (!c || !c[0]) continue;
				const k = r / c[0];
				if (
					Math.abs(g - c[1] * k) < 1e-4 &&
					Math.abs(b - c[2] * k) < 1e-4
				)
					return k;
			}
			return null;
		};

		const surface = real.columnAt(0, bi, bj).groundRadius;
		const o = built.origin;
		const v = built.opaque.vertices;
		const found = new Map<number, { lo: number; hi: number }>();
		for (let at = 0; at < v.length; at += 6) {
			const radius = Math.hypot(
				v[at]! + o.x,
				v[at + 1]! + o.y,
				v[at + 2]! + o.z,
			);
			const below = Math.round((surface - radius) / flatShape.blockSize);
			if (below < 0 || below > dug + 1) continue;
			const sky = skyOf(v[at + 3]!, v[at + 4]!, v[at + 5]!);
			if (sky === null) continue;
			const cell = found.get(below) ?? { lo: Infinity, hi: -Infinity };
			cell.lo = Math.min(cell.lo, sky);
			cell.hi = Math.max(cell.hi, sky);
			found.set(below, cell);
		}
		return [...found.entries()]
			.sort((a, b) => a[0] - b[0])
			.map(([depth, c]) => ({ depth, ...c }));
	}

	it("darkens a wall the deeper down the shaft it runs", () => {
		// **The bug this pins.** The exposure used to be read once per cell at
		// its column's own top, and a wall belongs to the solid side -- so the
		// whole wall of a shaft took the reading of the surface it was dug
		// from. Measured before the fix: 1.000 at every depth, top to bottom,
		// and only the floor cap at the bottom darkened at all.
		const bands = shaftSky({});
		expect(bands.length).toBeGreaterThan(2);

		// Brightest first and dimmest last, with nothing rising on the way
		// down: a wall's top vertex sits at the surface and its bottom one at
		// the floor, so one run carries the whole gradient.
		for (let b = 1; b < bands.length; b++)
			expect(bands[b]!.hi).toBeLessThanOrEqual(bands[b - 1]!.hi + 1e-6);
		expect(bands[bands.length - 1]!.hi).toBeLessThan(0.5);
	});

	it("leaves ground under the open sky at the full reading", () => {
		// The fix must not move the surface: a cap sitting on its column's own
		// top is read at that same layer, which is the number it always had.
		const bands = shaftSky({});
		expect(bands[0]!.lo).toBeCloseTo(1, 5);
		expect(bands[0]!.hi).toBeCloseTo(1, 5);
	});

	it("gives every face the open sky when it is switched off", () => {
		// There is no torch in this world, so off has to be a way to see what
		// you dug -- every face at the open-sky reading, nothing darkened.
		for (const band of shaftSky({ skyExposure: false })) {
			expect(band.lo).toBeCloseTo(1, 5);
			expect(band.hi).toBeCloseTo(1, 5);
		}
	});
});
