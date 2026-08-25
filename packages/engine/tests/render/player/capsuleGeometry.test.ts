import { describe, expect, it } from "vitest";
import { Vec3 } from "chamfer/math";
import { CAPSULE_STRIDE, capsuleGeometry } from "chamfer/render";

const RADIUS = 1700;
const HEIGHT = 1.8;
const WIDE = 0.3;

/**
 * How far a vertex may sit from where the arithmetic put it, in metres.
 *
 * The buffer is `float32` in absolute world coordinates, the same as every
 * other marker here, and 1,700 m falls in the binade whose step is `2^-12` --
 * so a vertex lands within `0.25 mm` of its own place and no closer. The shape
 * is exact in the `float64` it is computed in; this is what survives being
 * written down for the GPU.
 */
const STEP = 2 ** Math.ceil(Math.log2(RADIUS)) * 2 ** -23;

/** A player standing somewhere off every axis, facing along the ground. */
function standing(at: Vec3) {
	const up = at.normalize();
	const seed = Math.abs(up.x) < 0.9 ? new Vec3(1, 0, 0) : new Vec3(0, 1, 0);
	const heading = up.cross(seed).normalize();
	return {
		position: up.scale(RADIUS),
		heading,
		height: HEIGHT,
		radius: WIDE,
	};
}

/** Every vertex position, in order. */
function points(data: Float32Array): Vec3[] {
	const out: Vec3[] = [];
	for (let at = 0; at < data.length; at += CAPSULE_STRIDE)
		out.push(new Vec3(data[at]!, data[at + 1]!, data[at + 2]!));
	return out;
}

/** Every vertex color, in order. */
function colors(data: Float32Array): Vec3[] {
	const out: Vec3[] = [];
	for (let at = 0; at < data.length; at += CAPSULE_STRIDE)
		out.push(new Vec3(data[at + 3]!, data[at + 4]!, data[at + 5]!));
	return out;
}

/**
 * How far a point stands from the capsule's own axis, and how far up it.
 *
 * The axis runs from the feet to the top of the head, so `along` is metres up
 * from the feet and `across` is metres out from the line.
 */
function against(body: ReturnType<typeof standing>, at: Vec3) {
	const up = body.position.normalize();
	const offset = at.sub(body.position);
	const along = offset.dot(up);
	return { along, across: offset.sub(up.scale(along)).length() };
}

describe("a player drawn as a capsule", () => {
	const PLACES = [
		new Vec3(0, 0, 1),
		new Vec3(1, 0, 0),
		new Vec3(0.31, 0.58, 0.75),
		new Vec3(-0.4, -0.9, 0.2),
	];

	it("is whole triangles, and finite everywhere", () => {
		const data = capsuleGeometry(standing(PLACES[0]!));
		expect(data.length % CAPSULE_STRIDE).toBe(0);
		expect(points(data).length % 3).toBe(0);
		expect(points(data).length).toBeGreaterThan(100);
		for (const value of data) expect(Number.isFinite(value)).toBe(true);
	});

	it("stays inside the body it stands for, wherever that is", () => {
		for (const place of PLACES) {
			const body = standing(place);
			for (const at of points(capsuleGeometry(body))) {
				const { along, across } = against(body, at);
				// Between the feet and the top of the head, and never wider
				// than the width collision holds the player to.
				expect(along).toBeGreaterThanOrEqual(-STEP);
				expect(along).toBeLessThanOrEqual(HEIGHT + STEP);
				expect(across).toBeLessThanOrEqual(WIDE + STEP);
			}
		}
	});

	it("fills that body rather than sitting inside it", () => {
		const body = standing(PLACES[2]!);
		let lowest = Infinity;
		let highest = -Infinity;
		let widest = 0;
		for (const at of points(capsuleGeometry(body))) {
			const { along, across } = against(body, at);
			lowest = Math.min(lowest, along);
			highest = Math.max(highest, along);
			widest = Math.max(widest, across);
		}
		// The rounded ends are pushed a radius inward rather than added to
		// the ends, so the drawn shape is the height the collision measures.
		expect(Math.abs(lowest)).toBeLessThan(STEP);
		expect(Math.abs(highest - HEIGHT)).toBeLessThan(STEP);
		expect(Math.abs(widest - WIDE)).toBeLessThan(STEP);
	});

	it("winds every triangle outward, so the far side is what gets culled", () => {
		// Drawn with `cullMode: back` and the default counter-clockwise front
		// face, so a triangle wound the other way is a hole in the body from
		// the side you are looking at.
		for (const place of PLACES) {
			const body = standing(place);
			const at = points(capsuleGeometry(body));
			const up = body.position.normalize();
			let checked = 0;
			for (let t = 0; t < at.length; t += 3) {
				const a = at[t]!;
				const b = at[t + 1]!;
				const c = at[t + 2]!;
				const normal = b.sub(a).cross(c.sub(a));
				// A ring at a pole has no width, so its quad is two slivers
				// with no facing to test.
				if (normal.length() < 1e-12) continue;
				checked++;

				// Out of the capsule at the triangle's own middle: away from
				// the nearest point on the axis, which is the axis itself
				// beside the cylinder and an end's centre beyond it.
				const middle = a
					.add(b)
					.add(c)
					.scale(1 / 3);
				const offset = middle.sub(body.position);
				const along = Math.min(
					Math.max(offset.dot(up), WIDE),
					HEIGHT - WIDE,
				);
				const outward = offset.sub(up.scale(along)).normalize();
				expect(normal.normalize().dot(outward)).toBeGreaterThan(0);
			}
			expect(checked).toBeGreaterThan(100);
		}
	});

	it("shades it without ever going dark or blowing out", () => {
		const body = standing(PLACES[1]!);
		const shades = colors(capsuleGeometry(body));
		let darkest = Infinity;
		let brightest = 0;
		for (const color of shades)
			for (const channel of [color.x, color.y, color.z]) {
				expect(channel).toBeGreaterThan(0);
				expect(channel).toBeLessThanOrEqual(1);
				darkest = Math.min(darkest, channel);
				brightest = Math.max(brightest, channel);
			}
		// Baked rather than lit, so it never goes dark with the scene -- and
		// it is a range rather than one flat value, or the capsule is a
		// silhouette instead of a body.
		expect(darkest).toBeGreaterThan(0.1);
		expect(brightest / darkest).toBeGreaterThan(1.3);
	});

	it("faces where the player faces", () => {
		// A capsule is the same shape from every side, so the heading can only
		// show in the shading: the front is lighter than the back.
		const body = standing(PLACES[0]!);
		const data = capsuleGeometry(body);
		const at = points(data);
		const shade = colors(data);
		const up = body.position.normalize();
		const forward = body.heading;

		let front = 0;
		let back = 0;
		for (let k = 0; k < at.length; k++) {
			const offset = at[k]!.sub(body.position);
			const across = offset.sub(up.scale(offset.dot(up)));
			if (across.length() < WIDE * 0.5) continue;
			const facing = across.normalize().dot(forward);
			if (facing > 0.7) front = Math.max(front, shade[k]!.x);
			if (facing < -0.7) back = Math.max(back, shade[k]!.x);
		}
		expect(front).toBeGreaterThan(back);
	});
});
