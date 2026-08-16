/** A point or direction in world space. Positions are float64 throughout. */
export interface Vec3 {
	readonly x: number;
	readonly y: number;
	readonly z: number;
}

export function vec3(x: number, y: number, z: number): Vec3 {
	return { x, y, z };
}

export function add(a: Vec3, b: Vec3): Vec3 {
	return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub(a: Vec3, b: Vec3): Vec3 {
	return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(a: Vec3, k: number): Vec3 {
	return { x: a.x * k, y: a.y * k, z: a.z * k };
}

export function dot(a: Vec3, b: Vec3): number {
	return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: Vec3, b: Vec3): Vec3 {
	return {
		x: a.y * b.z - a.z * b.y,
		y: a.z * b.x - a.x * b.z,
		z: a.x * b.y - a.y * b.x,
	};
}
