import type { Geometry } from "./Geometry.js";
import type { MeshSink } from "./MeshSink.js";

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

	/** The box every vertex written so far falls inside. */
	private readonly low = [Infinity, Infinity, Infinity];
	private readonly high = [-Infinity, -Infinity, -Infinity];

	constructor(vertexCapacity = 4096) {
		this.positions = new Float32Array(vertexCapacity * 6);
		this.indices = new Uint32Array(vertexCapacity * 3);
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
	): number {
		if ((this.vertexCount + 1) * 6 > this.positions.length)
			this.positions = grow(this.positions, Float32Array);
		if (x < this.low[0]!) this.low[0] = x;
		if (y < this.low[1]!) this.low[1] = y;
		if (z < this.low[2]!) this.low[2] = z;
		if (x > this.high[0]!) this.high[0] = x;
		if (y > this.high[1]!) this.high[1] = y;
		if (z > this.high[2]!) this.high[2] = z;

		const at = this.vertexCount * 6;
		this.positions[at] = x;
		this.positions[at + 1] = y;
		this.positions[at + 2] = z;
		this.positions[at + 3] = r;
		this.positions[at + 4] = g;
		this.positions[at + 5] = b;
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
	 * The middle of everything written and how far it reaches, in the same
	 * frame the vertices are in.
	 *
	 * A renderer needs this to decide whether a chunk is in view at all, and
	 * the mesher is the only thing that knows where the geometry actually
	 * ended up: a chunk's triangle bounds its cells horizontally and says
	 * nothing about how tall the ground under them is.
	 */
	bounds(): { center: [number, number, number]; radius: number } {
		if (this.vertexCount === 0) return { center: [0, 0, 0], radius: 0 };
		const center: [number, number, number] = [
			(this.low[0]! + this.high[0]!) / 2,
			(this.low[1]! + this.high[1]!) / 2,
			(this.low[2]! + this.high[2]!) / 2,
		];
		const dx = this.high[0]! - center[0];
		const dy = this.high[1]! - center[1];
		const dz = this.high[2]! - center[2];
		return { center, radius: Math.sqrt(dx * dx + dy * dy + dz * dz) };
	}

	/** The finished geometry, trimmed to what was written. */
	build(cellCount: number): Geometry {
		return {
			vertices: this.positions.slice(0, this.vertexCount * 6),
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
