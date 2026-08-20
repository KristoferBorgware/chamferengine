import { beforeAll, describe, expect, it } from "vitest";
import type { CoarseMap } from "chamfer/generation";
import {
	BlockType,
	TerrainGenerator,
	buildCoarseMap,
	seedFromString,
} from "chamfer/generation";
import {
	PLAYER_DEFAULTS,
	Player,
	holonomy,
	transport,
	turn,
} from "chamfer/player";
import { Vec3 } from "chamfer/math";
import { WorldShape, maxCrustDepth } from "chamfer/world";

const RADIUS = 1700;
const DEPTH = 9;

let shape: WorldShape;
let map: CoarseMap;
let terrain: TerrainGenerator;

beforeAll(() => {
	shape = new WorldShape(RADIUS, DEPTH, 150, maxCrustDepth(DEPTH));
	map = buildCoarseMap(seedFromString("chamfer"), {
		level: 6,
		cellMetres: 100,
		relief: 100,
	});
	terrain = new TerrainGenerator(map.seed, shape, map);
});

/** A world of solid ground below one radius and air above it. */
function flatGround(surface: number) {
	return {
		blockAtPosition(p: { x: number; y: number; z: number }): number {
			const r = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
			return r < surface ? BlockType.STONE : BlockType.AIR;
		},
	};
}

/** Solid ground with water standing on it up to a second radius. */
function withWater(ground: number, water: number) {
	return {
		blockAtPosition(p: { x: number; y: number; z: number }): number {
			const r = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
			if (r < ground) return BlockType.STONE;
			if (r < water) return BlockType.WATER;
			return BlockType.AIR;
		},
	};
}

const STILL = {
	ahead: 0,
	aside: 0,
	turn: 0,
	pitch: 0,
	lift: 0,
	jump: false,
	flying: false,
} as const;

describe("the frame a player stands in", () => {
	it("takes up from the position and nothing else", () => {
		for (const place of [
			new Vec3(1, 0, 0),
			new Vec3(0, -1, 0),
			new Vec3(3, 4, 12),
		]) {
			const player = new Player(
				shape,
				place.normalize().scale(RADIUS),
				new Vec3(0, 0, 1),
			);
			const up = player.up;
			expect(up.length()).toBeCloseTo(1, 12);
			expect(up.dot(place.normalize())).toBeCloseTo(1, 12);
		}
	});

	it("keeps the heading along the ground wherever it goes", () => {
		const player = new Player(
			shape,
			new Vec3(0, 0, 1).scale(RADIUS),
			new Vec3(1, 0, 0),
		);
		const probe = flatGround(RADIUS);
		for (let n = 0; n < 400; n++) {
			player.step({ ...STILL, ahead: 1, turn: 0.02 }, 1 / 30, probe);
			expect(player.heading.length()).toBeCloseTo(1, 9);
			expect(Math.abs(player.heading.dot(player.up))).toBeLessThan(1e-9);
			expect(player.right.length()).toBeCloseTo(1, 9);
		}
	});

	it("has no fixed north anywhere on the planet, including over a pole", () => {
		// A heading is carried from place to place rather than measured against
		// something fixed, so walking over the top of the planet is no different
		// from walking anywhere else. A frame built from a reference axis turns
		// over on itself here.
		const player = new Player(
			shape,
			new Vec3(0, 0, 1).scale(RADIUS),
			new Vec3(1, 0, 0),
		);
		const probe = flatGround(RADIUS);
		let worst = 0;
		let previous = player.heading;
		for (let n = 0; n < 4000; n++) {
			player.step({ ...STILL, ahead: 1 }, 1 / 30, probe);
			// The heading may only swing by the small angle the step covers.
			worst = Math.max(
				worst,
				Math.acos(
					Math.min(1, Math.max(-1, previous.dot(player.heading))),
				),
			);
			previous = player.heading;
		}
		expect(worst).toBeLessThan(0.001);
	});
});

describe("transport", () => {
	it("gives back a unit tangent at the new place", () => {
		const from = new Vec3(0, 0, 1);
		const to = new Vec3(0.2, 0.1, 1).normalize();
		const carried = transport(new Vec3(1, 0, 0), from, to);
		expect(carried.length()).toBeCloseTo(1, 12);
		expect(carried.dot(to)).toBeCloseTo(0, 12);
	});

	it("keeps a heading that was already tangent", () => {
		const at = new Vec3(0, 0, 1);
		const heading = new Vec3(1, 0, 0);
		const same = transport(heading, at, at);
		expect(same.x).toBeCloseTo(1, 12);
	});

	it("finds a heading where none of the old one survives", () => {
		// Straight through the centre leaves nothing sideways to keep.
		const carried = transport(
			new Vec3(0, 0, 1),
			new Vec3(0, 0, 1),
			new Vec3(0, 0, 1),
		);
		expect(carried.length()).toBeCloseTo(1, 12);
	});
});

describe("holonomy", () => {
	it("turns a carried heading by the area a loop encloses", () => {
		// Walked, not asserted: a right-angled triangle on the sphere, carrying
		// the heading the whole way, and the heading does not come back where it
		// started. It is out by the area over the radius squared, which for an
		// eighth of a sphere is pi/2.
		//
		// This is why nothing here accumulates an angle. There is no error to
		// find; a sphere simply does this.
		const legs = [
			[new Vec3(1, 0, 0), new Vec3(0, 1, 0)],
			[new Vec3(0, 1, 0), new Vec3(0, 0, 1)],
			[new Vec3(0, 0, 1), new Vec3(1, 0, 0)],
		] as const;

		let heading = new Vec3(0, 1, 0);
		let at = new Vec3(1, 0, 0);
		for (const [from, to] of legs) {
			const steps = 2000;
			for (let s = 1; s <= steps; s++) {
				const t = s / steps;
				const next = from
					.scale(Math.cos((t * Math.PI) / 2))
					.add(to.scale(Math.sin((t * Math.PI) / 2)))
					.normalize();
				heading = transport(heading, at, next);
				at = next;
			}
		}

		const start = new Vec3(0, 1, 0);
		const turned = Math.acos(Math.min(1, Math.max(-1, heading.dot(start))));
		// An eighth of a sphere of radius 1 encloses pi/2.
		expect(holonomy(Math.PI / 2, 1)).toBeCloseTo(Math.PI / 2, 12);
		expect(turned).toBeCloseTo(Math.PI / 2, 2);
	});

	it("depends on the area and not on the radius of the walk", () => {
		expect(holonomy(100, 10)).toBe(1);
		expect(holonomy(400, 20)).toBe(1);
	});
});

describe("turn", () => {
	it("swings the heading about the ground and leaves it tangent", () => {
		const up = new Vec3(0, 0, 1);
		const heading = new Vec3(1, 0, 0);
		const swung = turn(heading, up, Math.PI / 2);
		expect(swung.dot(up)).toBeCloseTo(0, 12);
		expect(swung.y).toBeCloseTo(1, 9);
	});

	it("comes back after a full turn", () => {
		const up = new Vec3(0, 0, 1);
		const heading = new Vec3(1, 0, 0);
		const round = turn(heading, up, 2 * Math.PI);
		expect(round.x).toBeCloseTo(1, 9);
	});
});

describe("walking", () => {
	it("covers its own walking speed over the ground in a second", () => {
		const player = new Player(
			shape,
			new Vec3(0, 0, 1).scale(RADIUS),
			new Vec3(1, 0, 0),
		);
		const probe = flatGround(RADIUS);
		const start = player.position;
		for (let n = 0; n < 30; n++)
			player.step({ ...STILL, ahead: 1 }, 1 / 30, probe);
		// Along the surface, not through it.
		const travelled =
			RADIUS *
			Math.acos(
				Math.min(1, start.normalize().dot(player.position.normalize())),
			);
		expect(travelled).toBeCloseTo(PLAYER_DEFAULTS.walkSpeed, 1);
	});

	it("covers the ground at a speed set live, not just the default", () => {
		const player = new Player(
			shape,
			new Vec3(0, 0, 1).scale(RADIUS),
			new Vec3(1, 0, 0),
		);
		player.setWalkSpeed(7);
		expect(player.walkSpeed).toBe(7);
		const probe = flatGround(RADIUS);
		const start = player.position;
		for (let n = 0; n < 30; n++)
			player.step({ ...STILL, ahead: 1 }, 1 / 30, probe);
		const travelled =
			RADIUS *
			Math.acos(
				Math.min(1, start.normalize().dot(player.position.normalize())),
			);
		expect(travelled).toBeCloseTo(7, 1);
	});

	it("jumps clear of the ground and comes back down to it", () => {
		const probe = flatGround(RADIUS);
		const player = new Player(
			shape,
			new Vec3(0, 0, 1).scale(RADIUS),
			new Vec3(1, 0, 0),
		);
		// Settle first: a jump is answered from the ground, not from the air.
		for (let n = 0; n < 10; n++) player.step(STILL, 1 / 30, probe);
		expect(player.standing).toBe(true);
		const ground = player.position.length();

		player.step({ ...STILL, jump: true }, 1 / 30, probe);
		expect(player.standing).toBe(false);

		let peak = player.position.length();
		for (let n = 0; n < 60; n++) {
			player.step(STILL, 1 / 30, probe);
			peak = Math.max(peak, player.position.length());
		}
		// Higher than a step, so it clears what walking cannot.
		expect(peak - ground).toBeGreaterThan(PLAYER_DEFAULTS.stepHeight);
		// And back down, standing again.
		expect(player.position.length()).toBeCloseTo(ground, 6);
		expect(player.standing).toBe(true);
	});

	it("refuses a second jump in mid-air, so holding it does not climb", () => {
		const probe = flatGround(RADIUS);
		const player = new Player(
			shape,
			new Vec3(0, 0, 1).scale(RADIUS),
			new Vec3(1, 0, 0),
		);
		for (let n = 0; n < 10; n++) player.step(STILL, 1 / 30, probe);
		const ground = player.position.length();

		// Held down the whole way, which would be a flight if it answered.
		let peak = ground;
		for (let n = 0; n < 120; n++) {
			player.step({ ...STILL, jump: true }, 1 / 30, probe);
			peak = Math.max(peak, player.position.length());
		}
		const oneJump =
			(PLAYER_DEFAULTS.jumpSpeed * PLAYER_DEFAULTS.jumpSpeed) /
			(2 * PLAYER_DEFAULTS.gravity);
		expect(peak - ground).toBeLessThan(oneJump * 1.5);
	});

	it("does not jump while flying, which already has a way up", () => {
		const probe = flatGround(RADIUS);
		const player = new Player(
			shape,
			new Vec3(0, 0, 1).scale(RADIUS + 200),
			new Vec3(1, 0, 0),
		);
		for (let n = 0; n < 30; n++)
			player.step({ ...STILL, jump: true, flying: true }, 1 / 30, probe);
		expect(player.position.length()).toBeCloseTo(RADIUS + 200, 6);
		expect(player.standing).toBe(false);
	});

	it("stops on the ground rather than sinking through it", () => {
		const player = new Player(
			shape,
			new Vec3(0, 0, 1).scale(RADIUS + 30),
			new Vec3(1, 0, 0),
		);
		const probe = flatGround(RADIUS);
		for (let n = 0; n < 200; n++) player.step(STILL, 1 / 30, probe);
		expect(player.position.length()).toBeGreaterThan(RADIUS - 1);
		expect(player.position.length()).toBeLessThan(
			RADIUS + shape.blockSize + 0.01,
		);
	});

	it("stops a fast fall at what it passes, not where it ends up", () => {
		// A falling player crosses 1.67 m a frame at 30 Hz, and a thin floor is
		// missed entirely by a test that only looks at the endpoint.
		const floorTop = RADIUS;
		const probe = {
			blockAtPosition(p: { x: number; y: number; z: number }): number {
				const r = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
				// One block of stone, and nothing under it.
				return r < floorTop && r > floorTop - shape.blockSize
					? BlockType.STONE
					: BlockType.AIR;
			},
		};
		const player = new Player(
			shape,
			new Vec3(0, 0, 1).scale(RADIUS + 120),
			new Vec3(1, 0, 0),
		);
		for (let n = 0; n < 300; n++) player.step(STILL, 1 / 30, probe);
		expect(player.position.length()).toBeGreaterThan(
			floorTop - shape.blockSize,
		);
	});
});

describe("swimming", () => {
	it("separates wading from swimming by one cell", () => {
		// At 1 m blocks a 1.8 m player stands in one block of water and swims in
		// two, so there is no partial buoyancy to write.
		const ground = RADIUS;
		const oneDeep = withWater(ground, ground + 1);
		const twoDeep = withWater(ground, ground + 2);
		const player = new Player(
			shape,
			new Vec3(0, 0, 1).scale(ground),
			new Vec3(1, 0, 0),
		);
		expect(player.wading(oneDeep)).toBe(true);
		expect(player.swimming(oneDeep)).toBe(false);
		expect(player.swimming(twoDeep)).toBe(true);
	});

	it("falls through the surface and stops in the water", () => {
		// Two separate facts. Water does not collide, so a falling player goes
		// through the surface instead of landing on it -- that is a face test,
		// always yes for water. And they float rather than sinking to the bed,
		// which is a cell test on the block they are in.
		const probe = withWater(RADIUS, RADIUS + 40);
		const player = new Player(
			shape,
			new Vec3(0, 0, 1).scale(RADIUS + 60),
			new Vec3(1, 0, 0),
		);
		for (let n = 0; n < 400; n++) player.step(STILL, 1 / 30, probe);
		expect(player.position.length()).toBeLessThan(RADIUS + 40);
		expect(player.position.length()).toBeGreaterThan(RADIUS + 1);
		expect(player.swimming(probe)).toBe(true);
	});

	it("swims upward when asked", () => {
		const probe = withWater(RADIUS, RADIUS + 40);
		const player = new Player(
			shape,
			new Vec3(0, 0, 1).scale(RADIUS + 20),
			new Vec3(1, 0, 0),
		);
		const before = player.position.length();
		for (let n = 0; n < 60; n++)
			player.step({ ...STILL, lift: 1 }, 1 / 30, probe);
		expect(player.position.length()).toBeGreaterThan(before);
	});
});

describe("flying", () => {
	it("passes through the ground and gains speed with height", () => {
		const probe = flatGround(RADIUS);
		const player = new Player(
			shape,
			new Vec3(0, 0, 1).scale(RADIUS + 5),
			new Vec3(1, 0, 0),
		);
		const low = player.position;
		for (let n = 0; n < 30; n++)
			player.step({ ...STILL, ahead: 1, flying: true }, 1 / 30, probe);
		const nearGround = player.position.sub(low).length();

		const high = new Player(
			shape,
			new Vec3(0, 0, 1).scale(RADIUS + 3000),
			new Vec3(1, 0, 0),
		);
		const start = high.position;
		for (let n = 0; n < 30; n++)
			high.step({ ...STILL, ahead: 1, flying: true }, 1 / 30, probe);
		expect(high.position.sub(start).length()).toBeGreaterThan(
			nearGround * 10,
		);
	});

	it("does not fall while flying", () => {
		const probe = flatGround(RADIUS);
		const player = new Player(
			shape,
			new Vec3(0, 0, 1).scale(RADIUS + 200),
			new Vec3(1, 0, 0),
		);
		for (let n = 0; n < 120; n++)
			player.step({ ...STILL, flying: true }, 1 / 30, probe);
		expect(player.position.length()).toBeCloseTo(RADIUS + 200, 6);
	});
});

describe("on real terrain", () => {
	it("lands on the ground the generator made and stays on it", () => {
		const place = new Vec3(0.3, 0.7, 0.5).normalize();
		const player = new Player(
			shape,
			place.scale(RADIUS + 200),
			new Vec3(1, 0, 0),
		);
		for (let n = 0; n < 400; n++) player.step(STILL, 1 / 30, terrain);

		const settled = player.position.length();
		for (let n = 0; n < 60; n++) player.step(STILL, 1 / 30, terrain);
		expect(player.position.length()).toBeCloseTo(settled, 6);

		// Standing on something, with nothing solid where the head is.
		expect(terrain.blockAtPosition(player.eye)).not.toBe(BlockType.STONE);
	});
});
