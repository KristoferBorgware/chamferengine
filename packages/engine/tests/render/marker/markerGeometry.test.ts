import { describe, expect, it } from "vitest";
import { Vec3 } from "chamfer/math";
import { markerGeometry } from "chamfer/render";

const STRIDE = 6;

/** Every vertex position in one of the two buffers. */
function points(data: Float32Array): Vec3[] {
	const out: Vec3[] = [];
	for (let at = 0; at < data.length; at += STRIDE)
		out.push(new Vec3(data[at]!, data[at + 1]!, data[at + 2]!));
	return out;
}

describe("a camera drawn as a box and a wire cone", () => {
	const AT = new Vec3(0, 0, 1700);
	const LOOK = new Vec3(1, 0, 0);
	const SPREAD = (32.5 * Math.PI) / 180;
	const MARKER = {
		position: AT,
		direction: LOOK,
		size: 2,
		spread: SPREAD,
		reach: 160,
	};

	it("is whole triangles and whole lines, and finite everywhere", () => {
		const { box, cone } = markerGeometry(MARKER);
		expect(box.length % STRIDE).toBe(0);
		expect(cone.length % STRIDE).toBe(0);
		// Six quads as two triangles each, and pairs of ends for the lines.
		expect(points(box).length).toBe(36);
		expect(points(cone).length % 2).toBe(0);
		for (const value of [...box, ...cone])
			expect(Number.isFinite(value)).toBe(true);
	});

	it("puts the box on the position, at the size it is given", () => {
		const marks = points(markerGeometry(MARKER).box);
		for (const p of marks) {
			const off = p.sub(AT);
			// A box of half-width `size` reaches `size` along each of its own
			// three axes and no further.
			expect(off.length()).toBeLessThanOrEqual(
				MARKER.size * Math.sqrt(3) + 1e-3,
			);
			expect(Math.abs(off.dot(LOOK))).toBeCloseTo(MARKER.size, 4);
		}
	});

	it("opens the cone at the camera's own angle, out to its reach", () => {
		// The two things the cone has to say, and both are read off the
		// picture: how far this camera could see, and how wide.
		const marks = points(markerGeometry(MARKER).cone);
		const apex = marks.filter((p) => p.sub(AT).length() < 1e-3);
		expect(apex.length).toBe(8);

		const rim = marks.filter((p) => p.sub(AT).length() > 1e-3);
		const wanted = MARKER.reach * Math.tan(SPREAD);
		for (const p of rim) {
			const along = p.sub(AT).dot(LOOK);
			expect(along).toBeCloseTo(MARKER.reach, 3);
			const across = p.sub(AT).sub(LOOK.scale(along)).length();
			expect(across).toBeCloseTo(wanted, 3);
		}
	});

	it("faces the direction it is given, whichever way that is", () => {
		// The frame across the direction comes from a cross product, which is
		// undefined when the two vectors line up. A camera looking along a
		// world axis is not a special case anywhere else and must not become
		// one here.
		for (const look of [
			new Vec3(1, 0, 0),
			new Vec3(0, 1, 0),
			new Vec3(0, 0, 1),
			new Vec3(-1, 0, 0),
			new Vec3(0, -1, 0),
			new Vec3(0.3, -0.5, 0.81).normalize(),
		]) {
			const { box, cone } = markerGeometry({
				...MARKER,
				direction: look,
			});
			for (const value of [...box, ...cone])
				expect(Number.isFinite(value)).toBe(true);
			const centre = AT.add(look.scale(MARKER.reach));
			const rim = points(cone).filter((p) => p.sub(AT).length() > 1e-3);
			for (const p of rim)
				expect(p.sub(centre).dot(look)).toBeCloseTo(0, 3);
		}
	});
});
