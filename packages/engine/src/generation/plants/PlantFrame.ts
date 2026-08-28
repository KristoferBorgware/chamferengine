import { NORTH } from "../../addressing/solid/polarAxis.js";

/** Three perpendicular unit axes around one direction. */
export interface PlantFrame {
	readonly east: readonly [number, number, number];
	readonly up: readonly [number, number, number];
	readonly north: readonly [number, number, number];
}

/**
 * A frame around a unit direction, with that direction as its up.
 *
 * The planet's own axis picks the other two, so a plant standing anywhere takes
 * the same frame every time it is grown -- which is half of what makes it a
 * pure function of its address. Where the direction is the axis itself the
 * cross product vanishes and one of the icosahedron's own edges stands in.
 */
export function plantFrame(x: number, y: number, z: number): PlantFrame {
	let ex = NORTH.y * z - NORTH.z * y;
	let ey = NORTH.z * x - NORTH.x * z;
	let ez = NORTH.x * y - NORTH.y * x;
	let len = Math.sqrt(ex * ex + ey * ey + ez * ez);
	if (len < 1e-9) {
		ex = y;
		ey = -x;
		ez = 0;
		len = Math.sqrt(ex * ex + ey * ey + ez * ez) || 1;
	}
	ex /= len;
	ey /= len;
	ez /= len;
	return {
		east: [ex, ey, ez],
		up: [x, y, z],
		north: [y * ez - z * ey, z * ex - x * ez, x * ey - y * ex],
	};
}
