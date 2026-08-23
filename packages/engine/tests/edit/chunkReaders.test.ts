import { describe, expect, it } from "vitest";
import {
	DeltaStore,
	STORE_VERSION,
	chunkReaders,
	packBlockState,
} from "chamfer/edit";
import { ChunkAddress, coarseChunkKey } from "chamfer/generation";
import { FACES } from "chamfer/addressing";

const DEPTH = 6;
const DEPTH_8 = 8;

describe("chunkReaders", () => {
	it("includes the chunk itself", () => {
		expect(chunkReaders(9, DEPTH, 3)).toContain(9);
	});

	// A whole face is a chunk at level 0, and its rim is the whole triangle --
	// three corners, each shared with every other face touching that vertex
	// (five at a normal vertex, fewer at a pentagon). Built here from the
	// icosahedron's own vertex table, {@link FACES}, rather than from anything
	// chunkReaders is made of: a face g is a reader of face `f` exactly when
	// FACES[g] shares one of f's three vertices.
	it("reaches every face sharing a vertex, at chunk level 0", () => {
		for (let face = 0; face < 20; face++) {
			const vertices = new Set(FACES[face]!);
			const want = new Set<number>();
			for (let g = 0; g < 20; g++)
				if (FACES[g]!.some((v) => vertices.has(v))) want.add(g);
			const got = new Set(chunkReaders(face, DEPTH, 0));
			expect(got, `face ${face}`).toEqual(want);
		}
	});

	// **The whole reason it exists.** A chunk drawn `lod` levels coarse
	// generates at a reduced depth, so its own outside ring is one *coarse*
	// cell -- roughly `4 ^ lod` fine cells, not the one fine cell a chunk at
	// the store's own level reads. A record whose fine cell coarsens into that
	// ring has to be found, and a fine-to-fine adjacency chase can only ever
	// see one fine cell past a boundary.
	//
	// Measured (`tools/probe-coarse-reach.ts`): over every outside-ring cell of
	// one chunk at lod 1 through 3, a one-hop fine-adjacency chase never
	// reaches **47%** of them.
	it("reaches records a fine-to-fine chase cannot, once drawn coarse", () => {
		// One verified failing case from `tools/probe-coarse-reach.ts`: a fine
		// cell that coarsens into chunk 216's own outside ring at lod 1, more
		// than one fine cell past the boundary it shares with 216.
		const address = new ChunkAddress(3, [1, 2, 0, 3]); // key 867, ancestor 216
		const level = 3; // lod 1
		const ancestorKey = coarseChunkKey(address.key, 4, level);
		expect(ancestorKey).toBe(216);

		const store = new DeltaStore({
			version: STORE_VERSION,
			subdivisionDepth: DEPTH_8,
			chunkLevel: 4,
			registry: ["a", "b"],
		});
		store.write({ face: 3, i: 125, j: 67, layer: 20 }, packBlockState(0));
		expect(store.rowsUnder(ancestorKey, level).length).toBeGreaterThan(0);
	});
});
