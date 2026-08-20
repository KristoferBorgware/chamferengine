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
		// A sphere at the origin this small is never reached by a 160 m
		// cone this far out -- these tests are about the un-clipped shape,
		// and clipping against nothing is how that shape stays visible.
		groundRadius: 0,
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

	it("sits the box on the position, reaching up to twice the size", () => {
		// Not centred on the eye: a box straddling it the ordinary way
		// sinks below the eye whenever its half-width passes the eye
		// height, which the shipped defaults did. The box's lowest point
		// is the eye itself now, and every other point is further from
		// the ground the eye already clears.
		const radial = AT.normalize();
		const marks = points(markerGeometry(MARKER).box);
		let lowest = Infinity;
		let highest = -Infinity;
		for (const p of marks) {
			const along = p.sub(AT).dot(radial);
			lowest = Math.min(lowest, along);
			highest = Math.max(highest, along);
			// Across the other two axes the box is still the ordinary
			// symmetric box, half-width `size` either way.
			const across = p.sub(AT).sub(radial.scale(along));
			expect(across.length()).toBeLessThanOrEqual(
				MARKER.size * Math.sqrt(2) + 1e-3,
			);
		}
		expect(lowest).toBeGreaterThanOrEqual(-1e-3);
		expect(lowest).toBeLessThan(1e-3);
		expect(highest).toBeCloseTo(2 * MARKER.size, 4);
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

	it("cuts a downward edge at the ground instead of running on underground", () => {
		// An eye at radius 20 looking straight down at a ground sphere of
		// radius 10, with a cone narrow enough (10 degrees) to sit well
		// inside that sphere's 30-degree silhouette from here -- every rim
		// ray genuinely meets the sphere, so every one should end exactly
		// on it rather than at the unclipped 15 m reach, which would leave
		// every point 5 m inside solid ground.
		const eye = new Vec3(0, 0, 20);
		const marker = {
			position: eye,
			direction: new Vec3(0, 0, -1),
			size: 1,
			spread: (10 * Math.PI) / 180,
			reach: 15,
			groundRadius: 10,
		};
		const rim = points(markerGeometry(marker).cone).filter(
			(p) => p.sub(eye).length() > 1e-3,
		);
		expect(rim.length).toBeGreaterThan(0);
		for (const p of rim) expect(p.length()).toBeCloseTo(10, 3);
	});

	it("leaves an edge that clears the ground at its own full reach", () => {
		// The same eye, but looking away from the sphere entirely: nothing
		// in the cone can meet a sphere behind the camera, so clipping must
		// leave every point exactly where the unclipped shape puts it.
		const eye = new Vec3(0, 0, 20);
		const marker = {
			position: eye,
			direction: new Vec3(0, 0, 1),
			size: 1,
			spread: (10 * Math.PI) / 180,
			reach: 15,
			groundRadius: 10,
		};
		const rim = points(markerGeometry(marker).cone).filter(
			(p) => p.sub(eye).length() > 1e-3,
		);
		for (const p of rim)
			expect(p.sub(eye).length()).toBeCloseTo(
				15 / Math.cos(marker.spread),
				4,
			);
	});
});
