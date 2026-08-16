/**
 * A point or a direction in world space, held as three `float64` components.
 *
 * Instances are immutable: every operation returns a new vector. That suits
 * per-entity and per-frame work, which is what this class is for. Per-cell and
 * per-vertex data uses typed arrays and bare numbers instead — an array of
 * objects measures 15x slower on a mesh buffer build.
 */
export class Vec3 {
	readonly x: number;
	readonly y: number;
	readonly z: number;

	constructor(x: number, y: number, z: number) {
		this.x = x;
		this.y = y;
		this.z = z;
	}

	add(b: Vec3): Vec3 {
		return new Vec3(this.x + b.x, this.y + b.y, this.z + b.z);
	}

	sub(b: Vec3): Vec3 {
		return new Vec3(this.x - b.x, this.y - b.y, this.z - b.z);
	}

	scale(k: number): Vec3 {
		return new Vec3(this.x * k, this.y * k, this.z * k);
	}

	dot(b: Vec3): number {
		return this.x * b.x + this.y * b.y + this.z * b.z;
	}

	cross(b: Vec3): Vec3 {
		return new Vec3(
			this.y * b.z - this.z * b.y,
			this.z * b.x - this.x * b.z,
			this.x * b.y - this.y * b.x,
		);
	}

	/**
	 * The length of this vector.
	 *
	 * Written as `sqrt(x*x + y*y + z*z)`. `Math.hypot` is a library routine and
	 * returns a result one ULP apart between JavaScript runtimes, while `sqrt`
	 * is an IEEE 754 operation that produces the same bits everywhere. Two
	 * clients generating the same planet compare these results.
	 */
	length(): number {
		return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
	}

	/** This vector's direction, as a unit vector. */
	normalize(): Vec3 {
		const len = this.length();
		return new Vec3(this.x / len, this.y / len, this.z / len);
	}
}
