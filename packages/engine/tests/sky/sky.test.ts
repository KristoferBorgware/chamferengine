import { describe, expect, it } from "vitest";
import {
	ATMOSPHERE,
	CloudField,
	WIND_AXIS,
	WIND_RATE,
	buildCloudMesh,
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

describe("clouds", () => {
	const SHELLS = 4;
	const SHELL_SPAN = 20;
	const FEATURE_SIZE = 60;
	const BASE_RADIUS = RADIUS + 220;
	const field = new CloudField(4, SHELLS);

	it("borrows the lattice and takes no address from it", () => {
		expect(field.count).toBe(10 * 4 ** 4 + 2);
		// A face and an offset name a lattice point, the way a vertex is named.
		// There is no cell ID here, no chunk and no layer, and every store in
		// the design is keyed by cell ID -- so a cloud cannot be stored.
		expect(Object.keys(field)).not.toContain("layer");
		expect(field.solid.length).toBe(field.count * SHELLS);
		for (let at = 0; at < field.count; at++) {
			expect(field.faces[at]).toBeLessThan(20);
			const i = field.offsets[at * 2]!;
			const j = field.offsets[at * 2 + 1]!;
			expect(i + j).toBeLessThanOrEqual(field.n);
			// The point looks itself up, the way a mesher finding a neighbour
			// will.
			expect(field.indexOf(field.faces[at]!, i, j)).toBe(at);
		}
	});

	it("puts every point on the unit sphere, once", () => {
		const seen = new Set<string>();
		for (let at = 0; at < field.count; at++) {
			const x = field.directions[at * 3]!;
			const y = field.directions[at * 3 + 1]!;
			const z = field.directions[at * 3 + 2]!;
			expect(Math.sqrt(x * x + y * y + z * z)).toBeCloseTo(1, 12);
			const key = `${Math.round(x * 1e6)},${Math.round(y * 1e6)},${Math.round(z * 1e6)}`;
			expect(seen.has(key)).toBe(false);
			seen.add(key);
		}
	});

	it("moves the pattern when the wind turns, and keeps its shape", () => {
		field.blow(WIND_AXIS, 0, 7, BASE_RADIUS, SHELL_SPAN, FEATURE_SIZE);
		const before = Float32Array.from(field.cover);
		const coverOf = (values: Float32Array) => {
			let n = 0;
			for (const value of values) if (value > 0) n++;
			return n / values.length;
		};
		const share = coverOf(before);

		field.blow(WIND_AXIS, 0.8, 7, BASE_RADIUS, SHELL_SPAN, FEATURE_SIZE);
		let moved = 0;
		for (let at = 0; at < field.count; at++)
			if (Math.abs(before[at]! - field.cover[at]!) > 1e-6) moved++;
		expect(moved).toBeGreaterThan(field.count / 10);
		// The same amount of sky is covered: the pattern travelled rather than
		// growing or thinning.
		expect(coverOf(field.cover)).toBeCloseTo(share, 1);
	});

	it("draws only the points with a solid shell, never more than the cover fraction", () => {
		field.blow(WIND_AXIS, 0.3, 7, BASE_RADIUS, SHELL_SPAN, FEATURE_SIZE);
		const mesh = buildCloudMesh(field, BASE_RADIUS, SHELL_SPAN);

		let solidPoints = 0;
		let coveredPoints = 0;
		for (let at = 0; at < field.count; at++) {
			if (field.cover[at]! > 0.02) coveredPoints++;
			for (let s = 0; s < SHELLS; s++)
				if (field.solid[at * SHELLS + s]) {
					solidPoints++;
					break;
				}
		}
		expect(mesh.puffs).toBe(solidPoints);
		// The vertical margin never fills a shell where there is no cover, so
		// this can only be a fraction of the points cover alone would carry.
		expect(mesh.puffs).toBeLessThanOrEqual(coveredPoints);
		expect(mesh.puffs).toBeGreaterThan(0);
		expect(mesh.indices.length % 3).toBe(0);
		expect(mesh.vertices.length % 4).toBe(0);
	});

	it("hangs every vertex inside the deck's own shells", () => {
		field.blow(WIND_AXIS, 0.3, 7, BASE_RADIUS, SHELL_SPAN, FEATURE_SIZE);
		const mesh = buildCloudMesh(field, BASE_RADIUS, SHELL_SPAN);
		expect(mesh.vertices.length).toBeGreaterThan(0);
		for (let v = 0; v < mesh.vertices.length; v += 4) {
			const x = mesh.vertices[v]!;
			const y = mesh.vertices[v + 1]!;
			const z = mesh.vertices[v + 2]!;
			const radius = Math.sqrt(x * x + y * y + z * z);
			// The buffer is float32, so a radius in the thousands carries an
			// absolute error of a few thousandths -- the tolerance is that
			// rounding, not slack in the geometry.
			expect(radius).toBeGreaterThanOrEqual(BASE_RADIUS - 1e-2);
			expect(radius).toBeLessThanOrEqual(
				BASE_RADIUS + SHELLS * SHELL_SPAN + 1e-2,
			);
		}
	});

	it("culls every face buried inside a fully solid sky", () => {
		// Every point, every shell solid: no neighbour and no shell above or
		// below is ever open air, except the very top and the very bottom.
		// Every side face and every interior cap is buried and must not be
		// drawn.
		const full = new CloudField(3, SHELLS);
		full.solid.fill(1);
		full.cover.fill(1);
		const mesh = buildCloudMesh(full, BASE_RADIUS, SHELL_SPAN);

		expect(mesh.puffs).toBe(full.count);
		const capTriangles = full.count * 2; // one bottom cap, one top cap
		// A hexagon fans into four triangles, a pentagon into three -- the
		// index count is somewhere in that range, and it is exactly the caps:
		// no side face survives a fully solid neighbourhood.
		expect(mesh.indices.length / 3).toBeGreaterThanOrEqual(
			capTriangles * 3,
		);
		expect(mesh.indices.length / 3).toBeLessThanOrEqual(capTriangles * 4);
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
