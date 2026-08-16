import type { Vec3 } from "../math/Vec3.js";

/** A place on the planet worth going to by name. */
export interface Landmark {
	readonly name: string;

	/** Unit direction from the planet's centre. */
	readonly direction: Vec3;

	/** Which of the twelve icosahedron vertices this is. */
	readonly vertex: number;
}
