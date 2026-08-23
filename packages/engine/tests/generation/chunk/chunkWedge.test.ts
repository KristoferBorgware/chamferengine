import { describe, expect, it } from "vitest";
import { ChunkAddress, chunkCenter, chunkWedge } from "chamfer/generation";
import { joinPath, latticePosition } from "chamfer/addressing";
import { Vec3 } from "chamfer/math";

const DEPTH = 11;
const CHUNK_LEVEL = 6;
const RADIUS = 1700;

/** Every lattice point of one chunk's triangle, on the unit sphere. */
function corners(address: ChunkAddress): Vec3[] {
	const n = 1 << DEPTH;
	const m = 1 << (DEPTH - CHUNK_LEVEL);
	const out: Vec3[] = [];
	for (let a = 0; a <= m; a++)
		for (let b = 0; a + b <= m; b++) {
			// Through `joinPath` rather than by adding an offset: the middle
			// child is a half turn, so where a point of the chunk lands on the
			// face depends on the route taken to it.
			const [i, j] = joinPath(address.path, a, b, DEPTH);
			out.push(latticePosition(address.face, n, i, j));
		}
	return out;
}

/** Where a point sits inside a box, as a fraction of each half-width. */
function inside(
	box: ReturnType<typeof chunkWedge>,
	at: Vec3,
	slack = 1e-9,
): boolean {
	for (let n = 0; n < 3; n++) {
		const axis = box.axes[n]!;
		const along =
			(at.x - box.center[0]) * axis[0] +
			(at.y - box.center[1]) * axis[1] +
			(at.z - box.center[2]) * axis[2];
		if (Math.abs(along) > box.halves[n]! + slack) return false;
	}
	return true;
}

describe("chunkWedge", () => {
	// The one thing a cull volume must never get wrong. A point of the chunk
	// outside the box is a face the frustum may refuse, and what that draws is
	// a hole in the world that lasts until the player moves far enough to be
	// asked again.
	it("holds every lattice point of its chunk, at both ends of the crust", () => {
		const inner = RADIUS - 300;
		const outer = RADIUS + 120;
		for (const face of [0, 4, 11, 19])
			for (const path of [
				[0, 0, 0, 0, 0, 0],
				[3, 3, 3, 3, 3, 3],
				[1, 2, 0, 3, 1, 2],
			]) {
				const address = new ChunkAddress(face, path);
				const box = chunkWedge(
					chunkCenter(address, DEPTH, CHUNK_LEVEL),
					inner,
					outer,
				);
				for (const direction of corners(address))
					for (const radius of [inner, RADIUS, outer])
						expect(
							inside(box, direction.scale(radius)),
							`face ${face} at ${radius}`,
						).toBe(true);
			}
	});

	// What the box is for. A chunk is a triangle a few tens of metres across
	// and a shaft under it can be the whole crust deep, so the shape has to be
	// allowed to grow downward without growing sideways.
	it("grows down the crust without growing across it", () => {
		const extent = chunkCenter(
			new ChunkAddress(0, [1, 2, 0, 3, 1, 2]),
			DEPTH,
			CHUNK_LEVEL,
		);
		const shallow = chunkWedge(extent, RADIUS - 4, RADIUS + 4);
		const dug = chunkWedge(extent, RADIUS - 1200, RADIUS + 4);
		expect(dug.halves[0]).toBeGreaterThan(shallow.halves[0]! * 50);
		expect(dug.halves[1]).toBeCloseTo(shallow.halves[1]!, 6);
		expect(dug.halves[2]).toBeCloseTo(shallow.halves[2]!, 6);

		// And what the ball it replaces would have cost: a radius set by the
		// depth of the shaft in every direction, not just down it.
		const ball = Math.hypot(...dug.halves);
		expect(ball / dug.halves[1]!).toBeGreaterThan(5);
	});
});
