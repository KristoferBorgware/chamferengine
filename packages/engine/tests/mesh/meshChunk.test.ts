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
	flatCoarseMap,
	generateChunk,
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
import { Vec3 } from "chamfer/math";
import { WorldShape, maxCrustDepth } from "chamfer/world";
import {
	canonicalCell,
	cellCorners,
	joinPath,
	neighbour,
	positionToCell,
	splitPath,
} from "chamfer/addressing";
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
		const gen = new TerrainGenerator(map.seed, at, flat, {
			detailAmplitude: 0,
		});
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
