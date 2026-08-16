import { describe, expect, it } from "vitest";
import {
	geographicOf,
	landmarks,
	placeFromShareCode,
	positionOf,
	shareCode,
	shareCodeLength,
} from "chamfer/coordinates";
import {
	MERIDIAN_VERTEX,
	NORTH,
	NORTH_VERTEX,
	RING_LATITUDE,
	SOUTH,
	SOUTH_VERTEX,
	VERTICES,
	decodeCell,
	positionToCell,
} from "chamfer/addressing";
import { Vec3 } from "chamfer/math";

const RADIUS = 1700;

describe("reading a place off the planet", () => {
	it("puts the poles at the two ends of the axis", () => {
		expect(geographicOf(NORTH.scale(RADIUS), RADIUS).latitude).toBeCloseTo(
			90,
			9,
		);
		expect(geographicOf(SOUTH.scale(RADIUS), RADIUS).latitude).toBeCloseTo(
			-90,
			9,
		);
	});

	it("puts the prime meridian through the vertex that defines it", () => {
		const place = geographicOf(
			VERTICES[MERIDIAN_VERTEX]!.scale(RADIUS),
			RADIUS,
		);
		expect(place.longitude).toBeCloseTo(0, 9);
	});

	it("reports altitude above sea level, not from the centre", () => {
		const place = geographicOf(NORTH.scale(RADIUS + 42), RADIUS);
		expect(place.altitude).toBeCloseTo(42, 9);
		expect(
			geographicOf(NORTH.scale(RADIUS - 5), RADIUS).altitude,
		).toBeCloseTo(-5, 9);
	});

	it("round-trips a place through its coordinates", () => {
		for (const place of [
			{ latitude: 0, longitude: 0, altitude: 0 },
			{ latitude: 45, longitude: 90, altitude: 120 },
			{ latitude: -26.565, longitude: -144, altitude: -30 },
			{ latitude: 12.5, longitude: 179.5, altitude: 3 },
		]) {
			const back = geographicOf(positionOf(place, RADIUS), RADIUS);
			expect(back.latitude).toBeCloseTo(place.latitude, 9);
			expect(back.longitude).toBeCloseTo(place.longitude, 9);
			expect(back.altitude).toBeCloseTo(place.altitude, 9);
		}
	});

	it("round-trips a position through its coordinates", () => {
		let s = 13579;
		const rnd = () => {
			s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
			return s / 2 ** 32;
		};
		for (let n = 0; n < 2000; n++) {
			const z = 2 * rnd() - 1;
			const phi = 2 * Math.PI * rnd();
			const r = Math.sqrt(1 - z * z);
			const at = new Vec3(r * Math.cos(phi), r * Math.sin(phi), z).scale(
				RADIUS + rnd() * 200 - 100,
			);
			const back = positionOf(geographicOf(at, RADIUS), RADIUS);
			expect(back.sub(at).length()).toBeLessThan(1e-6);
		}
	});
});

describe("the twelve pentagons", () => {
	const places = landmarks();

	it("names one per icosahedron vertex, and no more", () => {
		// Twelve, at every subdivision level, in every world. The count is
		// forced by the total turning a closed surface has to add up to.
		expect(places.length).toBe(12);
		expect(new Set(places.map((p) => p.name)).size).toBe(12);
	});

	it("includes both coordinate poles", () => {
		const north = places.find((p) => p.vertex === NORTH_VERTEX)!;
		const south = places.find((p) => p.vertex === SOUTH_VERTEX)!;
		expect(north.name).toBe("north pole");
		expect(south.name).toBe("south pole");
		expect(north.direction.dot(south.direction)).toBeCloseTo(-1, 9);
	});

	it("puts the other ten on two rings at atan(1/2)", () => {
		const rings = places
			.filter(
				(p) => p.vertex !== NORTH_VERTEX && p.vertex !== SOUTH_VERTEX,
			)
			.map((p) => geographicOf(p.direction.scale(RADIUS), RADIUS));
		expect(rings.length).toBe(10);
		expect(RING_LATITUDE).toBeCloseTo(26.565, 3);
		for (const place of rings)
			expect(Math.abs(place.latitude)).toBeCloseTo(RING_LATITUDE, 6);
		expect(rings.filter((p) => p.latitude > 0).length).toBe(5);
		expect(rings.filter((p) => p.latitude < 0).length).toBe(5);
	});

	it("lands every one on an exact multiple of 36 degrees of longitude", () => {
		for (const place of places) {
			const at = geographicOf(place.direction.scale(RADIUS), RADIUS);
			if (Math.abs(at.latitude) > 89) continue;
			const steps = at.longitude / 36;
			expect(steps).toBeCloseTo(Math.round(steps), 6);
		}
	});

	it("keeps them about a kilometre apart on the worked planet", () => {
		// Far enough to be a journey and close enough to be a network. Nobody is
		// ever far from one, and no two are within sight of each other.
		let closest = Infinity;
		for (let a = 0; a < places.length; a++)
			for (let b = a + 1; b < places.length; b++) {
				const angle = Math.acos(
					Math.min(1, places[a]!.direction.dot(places[b]!.direction)),
				);
				closest = Math.min(closest, angle * RADIUS);
			}
		expect(closest).toBeCloseTo(1882, -2);
	});

	it("sits on a cell that really is a pentagon", () => {
		// The named place has to be the cell with five neighbours, not a cell
		// beside it.
		for (const place of places) {
			const cell = positionToCell(place.direction, 1 << 8);
			// A pentagon carries all its weight on one face vertex, which is
			// what puts it at (0,0), (n,0) or (0,n).
			const n = 1 << 8;
			const corner =
				(cell.i === 0 && cell.j === 0) ||
				(cell.i === n && cell.j === 0) ||
				(cell.i === 0 && cell.j === n);
			expect(corner).toBe(true);
		}
	});
});

describe("share codes", () => {
	const DEPTH = 11;

	it("takes eight characters at the worked planet's depth", () => {
		// 29 bits of address and 10 of layer. The planet field is left off;
		// putting it back takes the code to ten.
		expect(shareCodeLength(DEPTH)).toBe(8);
		expect(shareCodeLength(DEPTH, true)).toBe(10);
	});

	it("names a cell, so two players stand in the same block", () => {
		const fields = { planet: 0, face: 7, i: 913, j: 244, layer: 150 };
		const code = shareCode(fields, DEPTH);
		expect(code.length).toBe(8);

		const back = placeFromShareCode(code, DEPTH)!;
		expect(back.layer).toBe(fields.layer);
		// The address is canonicalised, so a cell on a face edge comes back
		// under one name rather than whichever one was typed in.
		const again = shareCode(back, DEPTH);
		expect(again).toBe(code);
	});

	it("round-trips a spread of places", () => {
		let s = 24680;
		const rnd = () => {
			s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
			return s / 2 ** 32;
		};
		for (let n = 0; n < 500; n++) {
			const face = Math.floor(rnd() * 20);
			const i = Math.floor(rnd() * (1 << DEPTH));
			const j = Math.floor(rnd() * ((1 << DEPTH) - i));
			const layer = Math.floor(rnd() * 435);
			const code = shareCode({ planet: 0, face, i, j, layer }, DEPTH);
			const back = placeFromShareCode(code, DEPTH)!;
			expect(back.layer).toBe(layer);
			expect(shareCode(back, DEPTH)).toBe(code);
		}
	});

	it("refuses something that is not a code", () => {
		expect(placeFromShareCode("", DEPTH)).toBeNull();
		expect(placeFromShareCode("!!!!", DEPTH)).toBeNull();
	});

	it("agrees with the packed cell it came from", () => {
		const fields = { planet: 0, face: 3, i: 100, j: 200, layer: 12 };
		const code = shareCode(fields, DEPTH);
		const value = Number.parseInt(code, 36);
		expect(decodeCell(value, DEPTH).layer).toBe(12);
	});
});
