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
	const KNOBS = {
		wavelengths: [700, 530, 460] as const,
		scatteringStrength: 21.23,
		densityFalloff: 4.3,
		atmosphereScale: 0.322,
		intensity: 2.3,
		mieStrength: 0.4,
		mieDirection: 0.76,
	};

	it("reaches a fraction of the planet's own radius past it, never a fixed metre count", () => {
		const small = planetAtmosphere(RADIUS, KNOBS);
		const big = planetAtmosphere(RADIUS * 4, KNOBS);
		expect(small.topRadius).toBeCloseTo(RADIUS * 1.322, 9);
		expect(big.topRadius / big.planetRadius).toBeCloseTo(
			small.topRadius / small.planetRadius,
			9,
		);
	});

	it("scatters blue harder than red, by the inverse fourth power of wavelength", () => {
		const air = planetAtmosphere(RADIUS, KNOBS);
		const [red, green, blue] = air.scattering;
		expect(blue).toBeGreaterThan(green);
		expect(green).toBeGreaterThan(red);
		expect(red / blue).toBeCloseTo(
			(KNOBS.wavelengths[2] / KNOBS.wavelengths[0]) ** 4,
			9,
		);
	});

	it("moves all three channels together as strength moves, keeping their ratios", () => {
		const weak = planetAtmosphere(RADIUS, KNOBS);
		const strong = planetAtmosphere(RADIUS, {
			...KNOBS,
			scatteringStrength: KNOBS.scatteringStrength * 3,
		});
		for (let c = 0; c < 3; c++)
			expect(strong.scattering[c]).toBeCloseTo(
				weak.scattering[c]! * 3,
				9,
			);
	});

	it("carries the falloff through unchanged, for the table it bakes into", () => {
		const air = planetAtmosphere(RADIUS, KNOBS);
		expect(air.densityFalloff).toBe(KNOBS.densityFalloff);
	});

	it("leaves the scattering colour alone when only the brightness moves", () => {
		// The whole reason this knob exists: every other one that brightens
		// the sky also changes how much blue survives the trip, so there is no
		// setting of them that is bright and blue at once.
		const dim = planetAtmosphere(RADIUS, KNOBS);
		const bright = planetAtmosphere(RADIUS, { ...KNOBS, intensity: 9 });
		expect(bright.intensity / dim.intensity).toBeCloseTo(9 / 2.3, 9);
		for (let c = 0; c < 3; c++)
			expect(bright.scattering[c]).toBeCloseTo(dim.scattering[c]!, 12);
	});

	it("holds the haze back from the value its phase function divides by zero at", () => {
		// Henyey-Greenstein divides by (1 + g^2 - 2g cos), which is zero at
		// g = 1 looking straight at the sun -- a single infinite pixel where
		// the sun is, which no tone curve recovers from.
		expect(
			planetAtmosphere(RADIUS, { ...KNOBS, mieDirection: 1 })
				.mieDirection,
		).toBeLessThan(1);
		expect(
			planetAtmosphere(RADIUS, { ...KNOBS, mieDirection: -4 })
				.mieDirection,
		).toBeGreaterThan(-1);
		expect(planetAtmosphere(RADIUS, KNOBS).mieDirection).toBeCloseTo(
			0.76,
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
