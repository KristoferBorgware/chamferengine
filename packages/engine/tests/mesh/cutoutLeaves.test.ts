import { describe, expect, it } from "vitest";
import { BlockType, Chunk, ChunkAddress, columnBand } from "chamfer/generation";
import {
	ArrayMeshSink,
	CHUNK_VERTEX_FLOATS,
	CUTOUT,
	meshChunk,
	opacityOf,
	showsFace,
} from "chamfer/mesh";
import { Vec3 } from "chamfer/math";
import { WorldShape, maxCrustDepth } from "chamfer/world";
import { joinPath, neighbour } from "chamfer/addressing";

const DEPTH = 5;
const CHUNK_LEVEL = 2;
const LAYERS = 32;
const shape = new WorldShape(1700, DEPTH, 60, maxCrustDepth(DEPTH));

describe("opacityOf under the cutout switch", () => {
	it("leaves a leaf as solid as stone by default", () => {
		expect(opacityOf(BlockType.PINE_LEAF)).toBe(2);
		expect(opacityOf(BlockType.PINE_WOOD)).toBe(2);
	});

	it("puts a leaf off the end of the scale when asked", () => {
		expect(opacityOf(BlockType.PINE_LEAF, true)).toBe(CUTOUT);
		// Only the leaves. A trunk has no holes in it.
		expect(opacityOf(BlockType.PINE_WOOD, true)).toBe(2);
		expect(opacityOf(BlockType.STONE, true)).toBe(2);
		expect(opacityOf(BlockType.WATER, true)).toBe(1);
		expect(opacityOf(BlockType.AIR, true)).toBe(0);
	});
});

describe("showsFace", () => {
	it("keeps the ordinary comparison where nothing is a cutout", () => {
		// Stone against water draws, water against stone does not, and water
		// against water is the 113,455 faces the ocean costs instead of 12.7M.
		expect(showsFace(2, 1)).toBe(true);
		expect(showsFace(1, 2)).toBe(false);
		expect(showsFace(1, 1)).toBe(false);
		expect(showsFace(2, 0)).toBe(true);
		expect(showsFace(0, 0)).toBe(false);
	});

	it("draws on both sides where either is a cutout", () => {
		// A look through a hole in the near leaf reaches the far one, so the
		// far one needs a face or the sky behind the tree shows through.
		expect(showsFace(CUTOUT, CUTOUT)).toBe(true);
		expect(showsFace(CUTOUT, 2)).toBe(true);
		expect(showsFace(2, CUTOUT)).toBe(true);
	});

	it("still draws nothing from air, whatever is next to it", () => {
		expect(showsFace(0, CUTOUT)).toBe(false);
	});
});

/**
 * A world of two neighbouring columns, each one block tall, in air.
 *
 * Everything else is empty, so every face either mesh emits belongs to one of
 * the two blocks and the counts are readable.
 */
function pair(
	chunk: Chunk,
	here: number,
	there: number,
	layer = 16,
): {
	columnAt: (
		face: number,
		i: number,
		j: number,
	) => ReturnType<typeof columnBand>;
} {
	const n = 1 << chunk.depth;
	const [i, j] = joinPath(chunk.address.path, 2, 2, chunk.depth);
	const beside = neighbour(chunk.address.face, n, i, j, 0)!;
	const one = (block: number) => {
		const blocks = new Uint16Array(LAYERS);
		blocks[layer] = block;
		return columnBand(blocks);
	};
	const air = columnBand(new Uint16Array(LAYERS));
	const first = one(here);
	const second = one(there);
	return {
		columnAt(face: number, ai: number, aj: number) {
			if (ai === i && aj === j) return first;
			if (face === beside.face && ai === beside.i && aj === beside.j)
				return second;
			return air;
		},
	};
}

/** Mesh the pair and report what each of the three sinks got. */
function meshPair(here: number, there: number, cutoutLeaves: boolean) {
	const chunk = new Chunk(
		ChunkAddress.fromKey(0, CHUNK_LEVEL),
		DEPTH,
		CHUNK_LEVEL,
		LAYERS,
	);
	const opaque = new ArrayMeshSink();
	const translucent = new ArrayMeshSink();
	const cutout = new ArrayMeshSink();
	const tally = meshChunk(
		chunk,
		pair(chunk, here, there),
		shape,
		1,
		new Vec3(0, 0, 0),
		opaque,
		translucent,
		cutout,
		{ cutoutLeaves },
	);
	return {
		tally,
		opaque: opaque.triangles,
		cutout: cutout.triangles,
		translucent: translucent.triangles,
	};
}

describe("a leaf drawn with holes in it", () => {
	it("draws no face where two leaves meet while they are solid", () => {
		const solid = meshPair(BlockType.PINE_LEAF, BlockType.PINE_LEAF, false);
		// Two hexagons, each a cap above and below plus five of its six walls:
		// the wall they share is drawn by neither.
		expect(solid.tally.faces).toBe(2 * (2 + 5));
		expect(solid.cutout).toBe(0);
	});

	it("draws it from both sides once they are cutouts", () => {
		const holed = meshPair(BlockType.PINE_LEAF, BlockType.PINE_LEAF, true);
		// The same faces plus one apiece: the shared wall, once from each
		// side, so a look through a hole in the near leaf finds the far one.
		expect(holed.tally.faces).toBe(2 * (2 + 6));
		// And all of it in the cutout buffer, none in the opaque one.
		expect(holed.opaque).toBe(0);
		expect(holed.translucent).toBe(0);
		expect(holed.cutout).toBeGreaterThan(0);
	});

	it("draws the trunk's own face behind a leaf as well", () => {
		const solid = meshPair(BlockType.PINE_LEAF, BlockType.PINE_WOOD, false);
		const holed = meshPair(BlockType.PINE_LEAF, BlockType.PINE_WOOD, true);
		expect(solid.tally.faces).toBe(2 * (2 + 5));
		expect(holed.tally.faces).toBe(2 * (2 + 6));
		// The wood is not a cutout, so its faces stay in the opaque buffer
		// and only the leaf's go to the one that throws pixels away.
		expect(holed.opaque).toBeGreaterThan(0);
		expect(holed.cutout).toBeGreaterThan(0);
	});

	it("leaves stone against stone exactly where it was", () => {
		const solid = meshPair(BlockType.STONE, BlockType.STONE, false);
		const holed = meshPair(BlockType.STONE, BlockType.STONE, true);
		expect(holed.tally.faces).toBe(solid.tally.faces);
		expect(holed.opaque).toBe(solid.opaque);
		expect(holed.cutout).toBe(0);
	});
});

describe("the band over a wall's brink", () => {
	/**
	 * A table naming a different picture for every slot of one block, so a
	 * vertex's own two layer indices say which face it came from.
	 */
	const TOP = 10;
	const SIDE = 11;
	const BOTTOM = 12;
	const BAND = 13;
	const textureLayers = (() => {
		const table = new Int32Array((BlockType.GRASS + 1) * 4).fill(-1);
		table[BlockType.GRASS * 4] = TOP;
		table[BlockType.GRASS * 4 + 1] = SIDE;
		table[BlockType.GRASS * 4 + 2] = BOTTOM;
		table[BlockType.GRASS * 4 + 3] = BAND;
		return table;
	})();

	/** Every vertex's layer and band, from one block standing alone. */
	function vertices() {
		const chunk = new Chunk(
			ChunkAddress.fromKey(0, CHUNK_LEVEL),
			DEPTH,
			CHUNK_LEVEL,
			LAYERS,
		);
		const sink = new ArrayMeshSink();
		meshChunk(
			chunk,
			pair(chunk, BlockType.GRASS, BlockType.AIR),
			shape,
			1,
			new Vec3(0, 0, 0),
			sink,
			new ArrayMeshSink(),
			new ArrayMeshSink(),
			{ textureLayers },
		);
		const built = sink.build(0);
		const out: { layer: number; band: number }[] = [];
		for (let v = 0; v < built.vertices.length; v += CHUNK_VERTEX_FLOATS)
			out.push({
				layer: built.vertices[v + 9]!,
				band: built.vertices[v + 10]!,
			});
		return out;
	}

	it("puts the band on the walls and nowhere else", () => {
		const all = vertices();
		expect(all.length).toBeGreaterThan(0);
		for (const { layer, band } of all) {
			// A cap wears its own picture and no band: the top of a grass
			// block is already grass, and its underside is dirt.
			if (layer === TOP || layer === BOTTOM) expect(band).toBe(-1);
			else expect(layer).toBe(SIDE);
			if (layer === SIDE) expect(band).toBe(BAND);
		}
		expect(all.some(({ layer }) => layer === TOP)).toBe(true);
		expect(all.some(({ layer }) => layer === BOTTOM)).toBe(true);
		expect(all.some(({ layer }) => layer === SIDE)).toBe(true);
	});

	it("carries no band at all where nothing has loaded a bake", () => {
		const chunk = new Chunk(
			ChunkAddress.fromKey(0, CHUNK_LEVEL),
			DEPTH,
			CHUNK_LEVEL,
			LAYERS,
		);
		const sink = new ArrayMeshSink();
		meshChunk(
			chunk,
			pair(chunk, BlockType.GRASS, BlockType.AIR),
			shape,
			1,
			new Vec3(0, 0, 0),
			sink,
			new ArrayMeshSink(),
			new ArrayMeshSink(),
		);
		const built = sink.build(0);
		for (let v = 0; v < built.vertices.length; v += CHUNK_VERTEX_FLOATS) {
			expect(built.vertices[v + 9]).toBe(-1);
			expect(built.vertices[v + 10]).toBe(-1);
		}
	});
});
