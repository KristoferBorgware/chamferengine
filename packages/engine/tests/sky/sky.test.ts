import { describe, expect, it } from "vitest";
import {
	ATMOSPHERE,
	WIND_AXIS,
	WIND_RATE,
	planetAtmosphere,
	scaledScaleHeight,
	windRotation,
	windSpeed,
	zenithOpticalDepth,
} from "chamfer/sky";
import { Vec3 } from "chamfer/math";

const RADIUS = 1700;

describe("the atmosphere does not survive scaling", () => {
	it("comes out 3,748 times too thin on this planet", () => {
		// Optical depth is a property of air times a path length through it, and
		// shrinking a planet shrinks only the path. Scaled air is a black sky at
		// noon, so the scattering runs on Earth's numbers whatever the planet is.
		const coefficient = ATMOSPHERE.rayleigh[1] + ATMOSPHERE.mie;
		const earth = zenithOpticalDepth(
			coefficient,
			ATMOSPHERE.rayleighScaleHeight,
		);
		const here = zenithOpticalDepth(
			coefficient,
			scaledScaleHeight(
				ATMOSPHERE.rayleighScaleHeight,
				ATMOSPHERE.planetRadius,
				RADIUS,
			),
		);
		expect(earth / here).toBeCloseTo(3748, -1);
		expect(here).toBeLessThan(1e-4);
	});

	it("scales the same way whatever the coefficient is", () => {
		// The ratio is the two radii and nothing else, which is why no choice of
		// air makes a small planet's sky work.
		for (const coefficient of ATMOSPHERE.rayleigh) {
			const earth = zenithOpticalDepth(coefficient, 8000);
			const here = zenithOpticalDepth(
				coefficient,
				scaledScaleHeight(8000, ATMOSPHERE.planetRadius, RADIUS),
			);
			expect(earth / here).toBeCloseTo(
				ATMOSPHERE.planetRadius / RADIUS,
				0,
			);
		}
	});

	it("keeps a grazing path far shorter than Earth's", () => {
		// Earth's is hundreds of kilometres of air. Here it is under a hundred
		// metres, which is about where the horizon is.
		const graze = (radius: number, scale: number) =>
			Math.sqrt(2 * radius * scale);
		const earth = graze(
			ATMOSPHERE.planetRadius,
			ATMOSPHERE.rayleighScaleHeight,
		);
		const here = graze(
			RADIUS,
			scaledScaleHeight(
				ATMOSPHERE.rayleighScaleHeight,
				ATMOSPHERE.planetRadius,
				RADIUS,
			),
		);
		expect(earth).toBeGreaterThan(300000);
		expect(here).toBeLessThan(100);

		// The air a scaled sky would look through sideways is about as far as
		// the ground a standing player can see. There is no horizon glow to be
		// had from that, and none of the geometry a sunset needs.
		const horizon = RADIUS * Math.acos(RADIUS / (RADIUS + 1.7));
		expect(here / horizon).toBeGreaterThan(0.5);
		expect(here / horizon).toBeLessThan(2);
		expect(earth / graze(RADIUS, 2.135)).toBeGreaterThan(1000);
	});
});

describe("a planet's own atmosphere", () => {
	const TOP = 400;
	const ZENITH = 0.134;

	it("hits the wanted zenith depth at green plus haze", () => {
		const air = planetAtmosphere(RADIUS, TOP, ZENITH);
		const reading = zenithOpticalDepth(
			air.rayleigh[1] + air.mie,
			air.rayleighScaleHeight,
		);
		expect(reading).toBeCloseTo(ZENITH, 9);
	});

	it("keeps Earth's spectral ratios at any strength", () => {
		const air = planetAtmosphere(RADIUS, TOP, ZENITH);
		expect(air.rayleigh[0] / air.rayleigh[1]).toBeCloseTo(
			ATMOSPHERE.rayleigh[0] / ATMOSPHERE.rayleigh[1],
			9,
		);
		expect(air.rayleigh[2] / air.rayleigh[1]).toBeCloseTo(
			ATMOSPHERE.rayleigh[2] / ATMOSPHERE.rayleigh[1],
			9,
		);
		expect(air.mie / air.rayleigh[1]).toBeCloseTo(
			ATMOSPHERE.mie / ATMOSPHERE.rayleigh[1],
			9,
		);
		expect(air.mieDirection).toBe(ATMOSPHERE.mieDirection);
	});

	it("reaches exactly top metres above the planet's own radius", () => {
		const air = planetAtmosphere(RADIUS, TOP, ZENITH);
		expect(air.planetRadius).toBe(RADIUS);
		expect(air.topRadius).toBe(RADIUS + TOP);
	});

	it("moves the scale heights together as the top does, at Earth's ratio", () => {
		const short = planetAtmosphere(RADIUS, TOP, ZENITH);
		const tall = planetAtmosphere(RADIUS, TOP * 2, ZENITH);
		expect(tall.rayleighScaleHeight).toBeCloseTo(
			short.rayleighScaleHeight * 2,
			9,
		);
		expect(tall.mieScaleHeight / tall.rayleighScaleHeight).toBeCloseTo(
			short.mieScaleHeight / short.rayleighScaleHeight,
			9,
		);
	});
});

describe("wind", () => {
	/** Divergence of a field on the sphere, in a local tangent frame. */
	function divergence(
		field: (p: Vec3) => Vec3,
		at: Vec3,
		step = 1e-5,
	): number {
		const up = at.normalize();
		const east = (
			Math.abs(up.y) > 0.9 ? new Vec3(1, 0, 0) : new Vec3(0, 1, 0)
		)
			.cross(up)
			.normalize();
		const north = up.cross(east).normalize();
		let sum = 0;
		for (const axis of [east, north]) {
			const ahead = up.add(axis.scale(step)).normalize();
			const behind = up.add(axis.scale(-step)).normalize();
			sum +=
				(field(ahead).dot(axis) - field(behind).dot(axis)) / (2 * step);
		}
		return sum;
	}

	/** A repeatable spread of directions. */
	function* spread(count: number) {
		let s = 4242;
		const rnd = () => {
			s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
			return s / 2 ** 32;
		};
		for (let n = 0; n < count; n++) {
			const z = 2 * rnd() - 1;
			const phi = 2 * Math.PI * rnd();
			const r = Math.sqrt(1 - z * z);
			yield new Vec3(r * Math.cos(phi), r * Math.sin(phi), z).normalize();
		}
	}

	it("carries a pattern without stretching it, where a world vector does not", () => {
		// A wind that blows the same way everywhere cannot exist on a sphere.
		// Of the two obvious fields only rigid rotation has no source and no
		// sink, so a cloud pattern is carried rather than bunched at one place
		// and stretched at another.
		const rigid = (p: Vec3) => WIND_AXIS.cross(p);
		const projected = (p: Vec3) => {
			const world = new Vec3(1, 0, 0);
			return world.sub(p.scale(world.dot(p)));
		};
		let rigidSum = 0;
		let projectedSum = 0;
		let counted = 0;
		for (const at of spread(4000)) {
			rigidSum += Math.abs(divergence(rigid, at));
			projectedSum += Math.abs(divergence(projected, at));
			counted++;
		}
		expect(rigidSum / counted).toBeLessThan(1e-6);
		expect(projectedSum / counted).toBeGreaterThan(0.9);
	});

	it("leaves two calm points, where the axis comes out", () => {
		expect(windSpeed(WIND_AXIS, WIND_AXIS, WIND_RATE, RADIUS)).toBeCloseTo(
			0,
			9,
		);
		expect(
			windSpeed(WIND_AXIS.scale(-1), WIND_AXIS, WIND_RATE, RADIUS),
		).toBeCloseTo(0, 9);

		let calm = 0;
		let counted = 0;
		for (const at of spread(20000)) {
			if (windSpeed(at, WIND_AXIS, WIND_RATE, RADIUS) < 1) calm++;
			counted++;
		}
		// Under a percent of the surface, and the price of a field that carries
		// a pattern rather than tearing it.
		expect(calm / counted).toBeLessThan(0.01);
	});

	it("turns a direction without changing its length", () => {
		for (const at of spread(200)) {
			const turned = windRotation(at, WIND_AXIS, 1.3);
			expect(turned.length()).toBeCloseTo(1, 12);
		}
	});

	it("leaves the axis where it is", () => {
		const turned = windRotation(WIND_AXIS, WIND_AXIS, 2.1);
		expect(turned.x).toBeCloseTo(WIND_AXIS.x, 12);
		expect(turned.y).toBeCloseTo(WIND_AXIS.y, 12);
		expect(turned.z).toBeCloseTo(WIND_AXIS.z, 12);
	});

	it("comes back after a full turn", () => {
		const start = new Vec3(1, 0, 0).normalize();
		const round = windRotation(start, WIND_AXIS, 2 * Math.PI);
		expect(round.x).toBeCloseTo(start.x, 9);
		expect(round.y).toBeCloseTo(start.y, 9);
		expect(round.z).toBeCloseTo(start.z, 9);
	});
});

describe("the moon", () => {
	const MOON_RADIUS = 1737400;
	const MOON_DISTANCE = 384400000;

	it("keeps its angular size at any scale, because scaling keeps angles", () => {
		const angle = (radius: number, distance: number) =>
			(2 * Math.atan(radius / distance) * 180) / Math.PI;
		const real = angle(MOON_RADIUS, MOON_DISTANCE);
		const scale = RADIUS / 6371000;
		expect(real).toBeCloseTo(0.518, 3);
		expect(angle(MOON_RADIUS * scale, MOON_DISTANCE * scale)).toBeCloseTo(
			real,
			9,
		);
	});

	it("shifts against the stars when a player walks round the planet", () => {
		// Which is why it stands off at a distance rather than being painted
		// into the sky: a painted one cannot move.
		const scale = RADIUS / 6371000;
		const parallax =
			(2 * Math.atan(RADIUS / (MOON_DISTANCE * scale)) * 180) / Math.PI;
		expect(parallax).toBeCloseTo(1.9, 1);
	});
});
