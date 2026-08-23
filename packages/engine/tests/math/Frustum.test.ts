import { describe, expect, it } from "vitest";
import { Frustum, Mat4, Vec3, boxAxes, type Box } from "chamfer/math";

/** A camera sixty metres above the surface, looking down at it. */
const EYE: [number, number, number] = [0, 0, 1760];
const AT: [number, number, number] = [0, 0, 1700];
const VIEW_PROJ = Mat4.perspective(
	(65 * Math.PI) / 180,
	1.6,
	0.2,
	4000,
).multiply(Mat4.lookAt(EYE, AT, [0, 1, 0]));

describe("the six planes a view bounds space with", () => {
	const view = new Frustum(VIEW_PROJ);

	it("holds what the camera is pointed at", () => {
		expect(view.holds(0, 0, 1700, 20)).toBe(true);
		expect(view.holds(0, 0, 1000, 20)).toBe(true);
	});

	it("drops what is behind the camera", () => {
		expect(view.holds(0, 0, 2400, 20)).toBe(false);
		expect(view.holds(0, 0, 1800, 5)).toBe(false);
	});

	it("drops what is beside the view and keeps what is near the edge", () => {
		// The view opens 65 degrees vertically, so 60 m along it reaches about
		// 38 m up and down, and rather further across.
		expect(view.holds(0, 400, 1700, 1)).toBe(false);
		expect(view.holds(0, 20, 1700, 1)).toBe(true);
	});

	it("keeps a ball that only overlaps the edge", () => {
		// A false yes costs a wasted draw. A false no costs a hole in the
		// world, so the test is against the ball rather than its centre.
		expect(view.holds(0, 400, 1700, 1)).toBe(false);
		expect(view.holds(0, 400, 1700, 400)).toBe(true);
	});

	it("drops what is past the far plane", () => {
		expect(view.holds(0, 0, -3000, 10)).toBe(false);
	});

	it("keeps every direction when the camera turns to face it", () => {
		// There is no global north to measure a heading against, so a camera
		// on a sphere looks along whatever tangent it is given. The frustum
		// has to follow it rather than assuming an axis.
		for (const at of [
			new Vec3(1, 0, 0),
			new Vec3(0, 1, 0),
			new Vec3(-1, -1, 0).normalize(),
			new Vec3(0.3, -0.5, 0.81).normalize(),
		]) {
			const eye = at.scale(1760);
			const target = at.scale(1700);
			const up =
				Math.abs(at.y) > 0.9 ? new Vec3(1, 0, 0) : new Vec3(0, 1, 0);
			const turned = new Frustum(
				Mat4.perspective((65 * Math.PI) / 180, 1.6, 0.2, 4000).multiply(
					Mat4.lookAt(
						[eye.x, eye.y, eye.z],
						[target.x, target.y, target.z],
						[up.x, up.y, up.z],
					),
				),
			);
			expect(turned.holds(target.x, target.y, target.z, 20)).toBe(true);
			expect(
				turned.holds(eye.x * 1.4, eye.y * 1.4, eye.z * 1.4, 20),
			).toBe(false);
		}
	});
});

describe("Frustum.holdsBox", () => {
	const view = new Frustum(VIEW_PROJ);

	/** A box of the given half-widths, turned so its long axis points up. */
	const box = (
		center: [number, number, number],
		halves: [number, number, number],
	): Box => {
		const length = Math.sqrt(
			center[0] * center[0] +
				center[1] * center[1] +
				center[2] * center[2],
		);
		return {
			center,
			axes: boxAxes(
				center[0] / length,
				center[1] / length,
				center[2] / length,
			),
			halves,
		};
	};

	it("keeps what is looked at and refuses what is behind", () => {
		expect(view.holdsBox(box([0, 0, 1700], [10, 10, 10]))).toBe(true);
		expect(view.holdsBox(box([0, 0, 2400], [10, 10, 10]))).toBe(false);
	});

	// The whole reason for the box. A shaft dug straight down is long along
	// its own axis and a few metres across, and a ball around it is as wide as
	// it is deep -- so a player looking along the ground keeps every shaft for
	// 300 m either side of what they can actually see.
	it("refuses a deep shaft off to the side that a ball around it keeps", () => {
		const along = new Frustum(
			Mat4.perspective((65 * Math.PI) / 180, 1.6, 0.2, 4000).multiply(
				Mat4.lookAt([0, 0, 1701], [300, 0, 1701], [0, 0, 1]),
			),
		);
		const aside: [number, number, number] = [300, 400, 1600];
		const shaft = box(aside, [300, 8, 8]);
		expect(along.holdsBox(shaft)).toBe(false);
		expect(
			along.holds(aside[0], aside[1], aside[2], Math.hypot(300, 8, 8)),
		).toBe(true);
	});

	it("keeps a box whose centre is outside but whose corner is not", () => {
		// The centre is off past the left plane; the box is wide enough that
		// its near side is still in shot, and a cull that only tested centres
		// would take a strip off the edge of the screen every frame.
		const wide = box([0, 0, 1700], [10, 4000, 10]);
		expect(view.holdsBox(wide)).toBe(true);
	});
});
