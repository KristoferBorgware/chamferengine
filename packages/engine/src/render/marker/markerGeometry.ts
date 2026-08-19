import type { ViewMarker } from "./ViewMarker.js";
import { Vec3 } from "../../math/Vec3.js";

/** Position and color, in both buffers. */
export const MARKER_STRIDE = 6;

/** How many sides the cone's rim is drawn with. */
const SEGMENTS = 32;

/** How many lines run from the apex to the rim. */
const SPOKES = 8;

/** The box, and the cone that says what the camera could see. */
const BOX_COLOR = [0.949, 0.757, 0.306] as const;
const CONE_COLOR = [1, 0.365, 0.278] as const;

/** The box as its six quads, each a loop of four corners. */
const BOX_FACES: readonly (readonly [number, number, number])[][] = [
	[
		[1, -1, -1],
		[1, 1, -1],
		[1, 1, 1],
		[1, -1, 1],
	],
	[
		[-1, -1, -1],
		[-1, -1, 1],
		[-1, 1, 1],
		[-1, 1, -1],
	],
	[
		[-1, 1, -1],
		[-1, 1, 1],
		[1, 1, 1],
		[1, 1, -1],
	],
	[
		[-1, -1, -1],
		[1, -1, -1],
		[1, -1, 1],
		[-1, -1, 1],
	],
	[
		[-1, -1, 1],
		[1, -1, 1],
		[1, 1, 1],
		[-1, 1, 1],
	],
	[
		[-1, -1, -1],
		[-1, 1, -1],
		[1, 1, -1],
		[1, -1, -1],
	],
];

/**
 * How much darker each of the six box faces is drawn.
 *
 * Baked in rather than lit: a marker lit by the scene's sun goes dark with the
 * scene, and the one thing it must never do is disappear.
 */
const BOX_SHADE = [1, 0.62, 0.86, 0.5, 0.74, 0.74];

/** Solid triangles for the box, and lines for the cone. */
export interface MarkerGeometry {
	readonly box: Float32Array<ArrayBuffer>;
	readonly cone: Float32Array<ArrayBuffer>;
}

/**
 * A camera as geometry: a solid box where it stands, a wire cone over what it
 * sees.
 *
 * **The cone is lines and not a surface.** A solid one would hide the ground
 * inside it, which is the whole of what the marker was put there to show. A
 * wire one is read through.
 *
 * Built on the CPU and rebuilt whenever the marker moves. Under three hundred
 * vertices, so there is nothing here worth keeping between frames.
 */
export function markerGeometry(marker: ViewMarker): MarkerGeometry {
	const forward = marker.direction.normalize();
	// Any two vectors across the direction. The cross with whichever world axis
	// the direction leans on least is never near zero, so this needs no case
	// for a camera looking straight along one of them.
	const seed =
		Math.abs(forward.x) < 0.9 ? new Vec3(1, 0, 0) : new Vec3(0, 1, 0);
	const right = forward.cross(seed).normalize();
	const up = right.cross(forward).normalize();

	// A point in the marker's own frame: across, up, and along the direction.
	const at = (a: number, b: number, c: number): Vec3 =>
		marker.position
			.add(right.scale(a))
			.add(up.scale(b))
			.add(forward.scale(c));

	const box: number[] = [];
	BOX_FACES.forEach((face, index) => {
		const shade = BOX_SHADE[index]!;
		const corner = (k: number): Vec3 => {
			const [a, b, c] = face[k]!;
			return at(a * marker.size, b * marker.size, c * marker.size);
		};
		for (const k of [0, 1, 2, 0, 2, 3])
			put(box, corner(k), BOX_COLOR, shade);
	});

	// The cone: apex on the box, rim at the reach, opening at the camera's own
	// field of view. Everything the frozen camera could see is inside it.
	const cone: number[] = [];
	const radius = marker.reach * Math.tan(marker.spread);
	const rim = (k: number): Vec3 =>
		at(
			Math.cos((2 * Math.PI * k) / SEGMENTS) * radius,
			Math.sin((2 * Math.PI * k) / SEGMENTS) * radius,
			marker.reach,
		);
	for (let k = 0; k < SEGMENTS; k++) {
		put(cone, rim(k), CONE_COLOR, 1);
		put(cone, rim(k + 1), CONE_COLOR, 1);
	}
	for (let k = 0; k < SPOKES; k++) {
		put(cone, marker.position, CONE_COLOR, 1);
		put(cone, rim((k * SEGMENTS) / SPOKES), CONE_COLOR, 0.75);
	}

	return { box: new Float32Array(box), cone: new Float32Array(cone) };
}

/** One vertex: where it is and what color it is drawn in. */
function put(
	into: number[],
	at: Vec3,
	color: readonly number[],
	shade: number,
): void {
	into.push(
		at.x,
		at.y,
		at.z,
		color[0]! * shade,
		color[1]! * shade,
		color[2]! * shade,
	);
}
