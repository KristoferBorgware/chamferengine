import type { Box } from "../math/Box.js";
import type { Geometry } from "./Geometry.js";
import type { MeshSink } from "./MeshSink.js";
import { CHUNK_VERTEX_FLOATS } from "./CHUNK_VERTEX_FLOATS.js";

/** The world axes, which is what a caller naming none gets. */
const WORLD_AXES: Box["axes"] = [
	[1, 0, 0],
	[0, 1, 0],
	[0, 0, 1],
];

/**
 * A sink that collects into growable typed arrays.
 *
 * Doubling a typed array and copying beats an array of vertex objects by 15x on
 * a buffer build, and the copies are a handful of times over a chunk.
 */
export class ArrayMeshSink implements MeshSink {
	private positions: Float32Array<ArrayBuffer>;
	private indices: Uint32Array<ArrayBuffer>;
	private vertexCount = 0;
	private indexCount = 0;

	/**
	 * How far every vertex written so far reaches along each of the axes.
	 *
	 * **Along the axes given, not along the world's.** A chunk is a wedge into
	 * the planet -- a small triangle extruded down through whatever has been
	 * dug -- and a shape that is deep in one direction and narrow in the other
	 * two is only cheap to bound if the box is allowed to point the same way.
	 * Three dot products a vertex against three comparisons, and what it buys
	 * on a chunk dug to the bottom of the crust is a volume some thousands of
	 * times smaller.
	 */
	private readonly axes: Box["axes"];
	private readonly low = [Infinity, Infinity, Infinity];
	private readonly high = [-Infinity, -Infinity, -Infinity];

	constructor(vertexCapacity = 4096, axes: Box["axes"] = WORLD_AXES) {
		this.positions = new Float32Array(vertexCapacity * CHUNK_VERTEX_FLOATS);
		this.indices = new Uint32Array(vertexCapacity * 3);
		this.axes = axes;
	}

	get vertices(): number {
		return this.vertexCount;
	}

	get triangles(): number {
		return this.indexCount / 3;
	}

	vertex(
		x: number,
		y: number,
		z: number,
		r: number,
		g: number,
		b: number,
		sky: number,
		u: number,
		v: number,
		layer: number,
		overlay: number,
	): number {
		if (
			(this.vertexCount + 1) * CHUNK_VERTEX_FLOATS >
			this.positions.length
		)
			this.positions = grow(this.positions, Float32Array);
		for (let n = 0; n < 3; n++) {
			const axis = this.axes[n]!;
			const along = x * axis[0] + y * axis[1] + z * axis[2];
			if (along < this.low[n]!) this.low[n] = along;
			if (along > this.high[n]!) this.high[n] = along;
		}

		const at = this.vertexCount * CHUNK_VERTEX_FLOATS;
		this.positions[at] = x;
		this.positions[at + 1] = y;
		this.positions[at + 2] = z;
		this.positions[at + 3] = r;
		this.positions[at + 4] = g;
		this.positions[at + 5] = b;
		this.positions[at + 6] = sky;
		this.positions[at + 7] = u;
		this.positions[at + 8] = v;
		this.positions[at + 9] = layer;
		this.positions[at + 10] = overlay;
		return this.vertexCount++;
	}

	triangle(a: number, b: number, c: number): void {
		if (this.indexCount + 3 > this.indices.length)
			this.indices = grow(this.indices, Uint32Array);
		this.indices[this.indexCount] = a;
		this.indices[this.indexCount + 1] = b;
		this.indices[this.indexCount + 2] = c;
		this.indexCount += 3;
	}

	/**
	 * The box everything written falls inside, in the same frame the vertices
	 * are in and turned to the axes this sink was given.
	 *
	 * A renderer needs this to decide whether a chunk is in view at all, and
	 * the mesher is the only thing that knows where the geometry actually
	 * ended up: a chunk's triangle bounds its cells horizontally and says
	 * nothing about how tall the ground under them is, nor how deep.
	 *
	 * Empty comes back as a box with no width, which every test refuses the
	 * same way a ball of no radius did.
	 */
	bounds(): Box {
		if (this.vertexCount === 0)
			return { center: [0, 0, 0], axes: this.axes, halves: [0, 0, 0] };
		const middle = [0, 1, 2].map(
			(n) => (this.low[n]! + this.high[n]!) / 2,
		) as [number, number, number];
		const halves = [0, 1, 2].map(
			(n) => (this.high[n]! - this.low[n]!) / 2,
		) as [number, number, number];
		// The centre is named along the axes and wanted in the frame the
		// vertices are in, so it is the three coordinates put back on them.
		const center: [number, number, number] = [0, 0, 0];
		for (let n = 0; n < 3; n++) {
			const axis = this.axes[n]!;
			center[0] += axis[0] * middle[n]!;
			center[1] += axis[1] * middle[n]!;
			center[2] += axis[2] * middle[n]!;
		}
		return { center, axes: this.axes, halves };
	}

	/** The finished geometry, trimmed to what was written. */
	build(cellCount: number): Geometry {
		return {
			vertices: this.positions.slice(
				0,
				this.vertexCount * CHUNK_VERTEX_FLOATS,
			),
			indices: this.indices.slice(0, this.indexCount),
			cellCount,
			triangleCount: this.indexCount / 3,
		};
	}
}

/** Double a typed array, keeping what it holds. */
function grow<T extends Float32Array<ArrayBuffer> | Uint32Array<ArrayBuffer>>(
	array: T,
	kind: { new (length: number): T },
): T {
	const bigger = new kind(array.length * 2);
	bigger.set(array);
	return bigger;
}
