import { describe, expect, it } from "vitest";
import type { RayWorld } from "chamfer/addressing";
import type { CellRef } from "chamfer/edit";
import { Mat4, Vec3 } from "chamfer/math";
import { latticePosition, rayWalk } from "chamfer/addressing";
import { WorldShape } from "chamfer/world";

/**
 * Where the crosshair points, and where the aiming walk goes.
 *
 * The crosshair is a fixed mark at the centre of the screen, so the cell the
 * outline stands on has to project there. The camera is not the player: it sits
 * `chase` metres behind the eye and above it, and it looks at a point ahead of
 * the *eye* rather than ahead of itself, so the line through screen centre is
 * neither the player's heading nor a line through the player's eye.
 *
 * The arithmetic here is the client's own, written out so a change to either
 * side shows up as a disagreement rather than as an outline in the wrong place.
 */
const FIELD_OF_VIEW = (65 * Math.PI) / 180;
const RADIUS = 1700;
const DEPTH = 11;
const CRUST = 64;
const REACH = 6;

/** A planet whose ground is a smooth ball, so the walk always meets it. */
function ballWorld(shape: WorldShape, groundRadius: number): RayWorld {
	return {
		n: shape.n,
		radiusOfLayer: (layer) => shape.radiusOfLayer(layer),
		layerOfRadius: (radius) => shape.layerOfRadius(radius),
		solidAt: (cell: CellRef) =>
			shape.radiusOfLayer(cell.layer) <= groundRadius,
	};
}

/** Where a world-space point lands in normalized device coordinates. */
function project(
	point: Vec3,
	from: Vec3,
	target: Vec3,
	up: Vec3,
): { x: number; y: number; w: number } {
	const view = Mat4.lookAt(
		[from.x, from.y, from.z],
		[target.x, target.y, target.z],
		[up.x, up.y, up.z],
	);
	const projection = Mat4.perspective(
		FIELD_OF_VIEW,
		1280 / 800,
		0.2,
		RADIUS * 20,
	);
	const m = projection.multiply(view).elements;
	const v = [point.x, point.y, point.z, 1];
	const out = [0, 0, 0, 0];
	for (let r = 0; r < 4; r++) {
		let sum = 0;
		for (let k = 0; k < 4; k++) sum += m[k * 4 + r]! * v[k]!;
		out[r] = sum;
	}
	return { x: out[0]! / out[3]!, y: out[1]! / out[3]!, w: out[3]! };
}

describe("what the crosshair points at", () => {
	const shape = new WorldShape(RADIUS, DEPTH, 150, CRUST);
	const ground = shape.radiusOfLayer(20);
	const world = ballWorld(shape, ground);

	/** The camera the client builds, for a player standing and looking down. */
	function camera(chase: number, pitch: number) {
		const up = new Vec3(0.31, 0.58, 0.75).normalize();
		const eye = up.scale(ground + 1.7);
		const east = new Vec3(0, 1, 0).cross(up).normalize();
		const heading = up.cross(east).normalize();
		const look = heading
			.scale(Math.cos(pitch))
			.add(up.scale(Math.sin(pitch)))
			.normalize();
		const from =
			chase < 0.5
				? eye
				: eye.sub(look.scale(chase)).add(up.scale(chase * 0.35));
		const target = eye.add(look.scale(50));
		return { up, eye, look, from, target };
	}

	/** The client's rule: the player's own ray, an arm's length of it. */
	function aimed(chase: number, pitch: number) {
		const { eye, look } = camera(chase, pitch);
		return rayWalk(eye, look, world, REACH * shape.blockSize);
	}

	/** Where the client puts the crosshair: the far end of that same ray. */
	function crosshair(chase: number, pitch: number) {
		const { eye, look } = camera(chase, pitch);
		return eye.add(look.scale(REACH * shape.blockSize));
	}

	for (const chase of [0, 6, 20]) {
		it(`draws the crosshair on the aimed cell with the camera ${chase} m back`, () => {
			const pitch = -0.45;
			const { up, from, target } = camera(chase, pitch);
			const hit = aimed(chase, pitch);
			expect(hit, "the ground was out of reach").not.toBeNull();

			const at = latticePosition(
				hit!.cell.face,
				shape.n,
				hit!.cell.i,
				hit!.cell.j,
			);
			const centre = new Vec3(at.x, at.y, at.z)
				.normalize()
				.scale(shape.radiusOfLayer(hit!.cell.layer));
			const cell = project(centre, from, target, up);
			const mark = project(crosshair(chase, pitch), from, target, up);

			expect(cell.w, "the hit is behind the camera").toBeGreaterThan(0);
			expect(mark.w, "the mark is behind the camera").toBeGreaterThan(0);
			// A cell is a hexagon a metre across and the mark is a point, so
			// the two agree to within about a cell as seen from here.
			const away = centre.sub(from).length();
			const slack =
				(2 * shape.blockSize) / (away * Math.tan(FIELD_OF_VIEW / 2));
			expect(Math.abs(cell.x - mark.x)).toBeLessThan(slack);
			expect(Math.abs(cell.y - mark.y)).toBeLessThan(slack);
		});
	}
});
