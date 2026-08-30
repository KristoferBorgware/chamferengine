import type { Chunk } from "../generation/chunk/Chunk.js";
import type { ChunkMesh } from "./ChunkMesh.js";
import type { ColumnSampler } from "../generation/chunk/ColumnSampler.js";
import type { MeshOptions } from "./MeshOptions.js";
import type { WorldShape } from "../world/WorldShape.js";
import type { Box } from "../math/Box.js";
import { ArrayMeshSink } from "./ArrayMeshSink.js";
import { Vec3 } from "../math/Vec3.js";
import { boxAxes } from "../math/boxAxes.js";
import { joinPath } from "../addressing/lattice/joinPath.js";
import { latticePosition } from "../addressing/lattice/latticePosition.js";
import { meshChunk } from "./meshChunk.js";

/**
 * Mesh a chunk into two array-backed buffers.
 *
 * The origin is the chunk's own first corner at sea level, which is inside the
 * chunk and fixed by its address, so it needs nothing beyond what the caller
 * already has.
 */
export function buildChunkMesh(
	chunk: Chunk,
	sampler: ColumnSampler,
	shape: WorldShape,
	seed: number,
	options: MeshOptions = {},
): ChunkMesh {
	const [i, j] = joinPath(chunk.address.path, 0, 0, chunk.depth);
	const origin = latticePosition(
		chunk.address.face,
		1 << chunk.depth,
		i,
		j,
	).scale(shape.seaLevelRadius);

	// Both sinks measure themselves along the chunk's own direction rather than
	// the world's axes, so a shaft dug straight down is one tall thin box
	// instead of a cube the length of the shaft on every side.
	const up = origin.normalize();
	const axes = boxAxes(up.x, up.y, up.z);
	const opaque = new ArrayMeshSink(4096, axes);
	const translucent = new ArrayMeshSink(256, axes);
	// A chunk with no plants in it never writes here, and most do not, so this
	// starts small and grows the way the water buffer does.
	const cutout = new ArrayMeshSink(256, axes);
	const tally = meshChunk(
		chunk,
		sampler,
		shape,
		seed,
		origin,
		opaque,
		translucent,
		cutout,
		options,
	);
	// The box everything drawn falls inside, over all three buffers, moved back
	// into world space from the origin the vertices are written against.
	const box = merge(merge(opaque.bounds(), cutout.bounds()), translucent.bounds());
	return {
		key: chunk.address.key,
		origin: new Vec3(origin.x, origin.y, origin.z),
		bound: {
			center: [
				box.center[0] + origin.x,
				box.center[1] + origin.y,
				box.center[2] + origin.z,
			],
			axes: box.axes,
			halves: box.halves,
		},
		opaque: opaque.build(tally.cells),
		cutout: cutout.build(tally.cells),
		translucent: translucent.build(tally.cells),
		tally,
	};
}

/**
 * One box around two, or around whichever of them holds anything.
 *
 * Both are measured along the same axes, so this is three pairs of intervals
 * merged and nothing turns.
 */
function merge(a: Box, b: Box): Box {
	const empty = (box: Box): boolean =>
		box.halves[0] === 0 && box.halves[1] === 0 && box.halves[2] === 0;
	if (empty(a)) return b;
	if (empty(b)) return a;
	const middle: [number, number, number] = [0, 0, 0];
	const halves: [number, number, number] = [0, 0, 0];
	const center: [number, number, number] = [0, 0, 0];
	for (let n = 0; n < 3; n++) {
		const axis = a.axes[n]!;
		const at = (box: Box): number =>
			box.center[0] * axis[0] +
			box.center[1] * axis[1] +
			box.center[2] * axis[2];
		const low = Math.min(at(a) - a.halves[n]!, at(b) - b.halves[n]!);
		const high = Math.max(at(a) + a.halves[n]!, at(b) + b.halves[n]!);
		middle[n] = (low + high) / 2;
		halves[n] = (high - low) / 2;
	}
	for (let n = 0; n < 3; n++) {
		const axis = a.axes[n]!;
		center[0] += axis[0] * middle[n]!;
		center[1] += axis[1] * middle[n]!;
		center[2] += axis[2] * middle[n]!;
	}
	return { center, axes: a.axes, halves };
}
