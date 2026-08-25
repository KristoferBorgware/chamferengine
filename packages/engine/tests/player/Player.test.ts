import { beforeAll, describe, expect, it } from "vitest";
import type { CoarseMap } from "chamfer/generation";
import {
	BlockType,
	TerrainGenerator,
	buildCoarseMap,
	flatCoarseMap,
	seedFromString,
} from "chamfer/generation";
import {
	PLAYER_DEFAULTS,
	Player,
	holonomy,
	slidePastWalls,
	transport,
	turn,
} from "chamfer/player";
import { Vec3 } from "chamfer/math";
import {
	canonicalCell,
	cellCorners,
	latticePosition,
	neighbour,
	positionToCell,
} from "chamfer/addressing";
import { WorldShape, maxCrustDepth } from "chamfer/world";

const RADIUS = 1700;
const DEPTH = 9;

let shape: WorldShape;

/**
 * A world of 1 m blocks, which is the size this planet ships at.
 *
 * `shape` above is depth 9, where a block is **4 m** -- so the whole 1.8 m
 * player fits inside one layer and a 2.15 m jump does not clear one block.
 * Neither is true of the shipped world, and both would make a wall or a
 * ceiling meaningless to test against.
 */
let fine: WorldShape;
let map: CoarseMap;
let terrain: TerrainGenerator;

beforeAll(() => {
	shape = new WorldShape(RADIUS, DEPTH, 150, maxCrustDepth(DEPTH));
	fine = new WorldShape(RADIUS, 11, 150, maxCrustDepth(11));
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

/** How high a jump reaches: `jumpSpeed^2 / (2 * gravity)`, 2.15 m. */
const JUMP_REACH =
	(PLAYER_DEFAULTS.jumpSpeed * PLAYER_DEFAULTS.jumpSpeed) /
	(2 * PLAYER_DEFAULTS.gravity);

const STILL = {
	ahead: 0,
	aside: 0,
	turn: 0,
	pitch: 0,
	lift: 0,
	jump: false,
	flying: false,
} as const;

/** A direction the map puts well above sea level, for standing on. */
function landAt(): Vec3 {
	for (let n = 0; n < 4000; n++) {
		const around = (n * 2.399963229728653) % (2 * Math.PI);
		const z = 1 - (2 * (n % 997)) / 997;
		const ring = Math.sqrt(Math.max(0, 1 - z * z));
		const dir = new Vec3(
			Math.cos(around) * ring,
			z,
			Math.sin(around) * ring,
		).normalize();
		const cell = positionToCell(dir, shape.n);
		if (map.heightAt(cell.face, cell.i, cell.j, DEPTH) > 20) return dir;
	}
	throw new Error("the test map has no land in it");
}

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
		// Clear of the ground by its own reach, which is the whole point of
		// it: nothing is walked up, so a jump is the only way onto anything.
		expect(peak - ground).toBeGreaterThan(JUMP_REACH * 0.9);
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

	it("leaves the ground on the very first tick of a jump", () => {
		// The step-up rule -- ground a step high is walked onto rather than
		// into -- reads `fall`, which is positive downward. A jump makes it
		// negative, so a rule that fires on "not falling" fires on "rising"
		// too and puts the player straight back on the ground they just left,
		// cancelling the jump on the tick it started. It only showed on ground
		// whose surface sits on a layer boundary, which a generated world's
		// does and a bare radius does not, so this builds the world the client
		// actually runs: a flat map through the real generator.
		const flatMap = flatCoarseMap(seedFromString("chamfer"), 2);
		const plain = new TerrainGenerator(flatMap.seed, shape, flatMap);
		const player = new Player(
			shape,
			new Vec3(0.2, 0.9, 0.4).normalize().scale(RADIUS + 40),
			new Vec3(1, 0, 0),
		);
		for (let n = 0; n < 400; n++) player.step(STILL, 1 / 30, plain);
		expect(player.standing).toBe(true);
		const ground = player.position.length();

		player.step({ ...STILL, jump: true }, 1 / 30, plain);
		expect(player.standing).toBe(false);
		expect(player.position.length()).toBeGreaterThan(ground);

		// And it keeps going up rather than being caught a tick later.
		let peak = player.position.length();
		for (let n = 0; n < 90; n++) {
			player.step(STILL, 1 / 30, plain);
			peak = Math.max(peak, player.position.length());
		}
		expect(peak - ground).toBeGreaterThan(JUMP_REACH * 0.9);
		expect(player.position.length()).toBeCloseTo(ground, 6);
	});

	it("jumps again once it has landed, at the same height every time", () => {
		// Three jumps in a row, each from a standstill: the second has to
		// answer, and the ground has to be the same ground every time. A
		// landing that settles a layer high would climb a block a jump.
		const probe = flatGround(RADIUS);
		const player = new Player(
			shape,
			new Vec3(0, 0, 1).scale(RADIUS),
			new Vec3(1, 0, 0),
		);
		for (let n = 0; n < 10; n++) player.step(STILL, 1 / 30, probe);
		const ground = player.position.length();

		const peaks: number[] = [];
		const rests: number[] = [];
		for (let jump = 0; jump < 3; jump++) {
			expect(player.standing).toBe(true);
			player.step({ ...STILL, jump: true }, 1 / 30, probe);
			let peak = player.position.length();
			for (let n = 0; n < 90; n++) {
				player.step(STILL, 1 / 30, probe);
				peak = Math.max(peak, player.position.length());
			}
			peaks.push(peak - ground);
			rests.push(player.position.length());
		}

		for (const rest of rests) expect(rest).toBeCloseTo(ground, 6);
		for (const height of peaks)
			expect(height).toBeGreaterThan(JUMP_REACH * 0.9);
		// Every jump the same jump, rather than drifting up or dying out.
		expect(peaks[1]).toBeCloseTo(peaks[0]!, 6);
		expect(peaks[2]).toBeCloseTo(peaks[0]!, 6);
	});

	it("jumps repeatedly while the key is simply held down", () => {
		// Holding it must not climb -- that is the mid-air rule -- but it must
		// not stick either: once the feet are down again it answers.
		const probe = flatGround(RADIUS);
		const player = new Player(
			shape,
			new Vec3(0, 0, 1).scale(RADIUS),
			new Vec3(1, 0, 0),
		);
		for (let n = 0; n < 10; n++) player.step(STILL, 1 / 30, probe);
		const ground = player.position.length();

		let liftoffs = 0;
		let wasStanding = player.standing;
		for (let n = 0; n < 300; n++) {
			player.step({ ...STILL, jump: true }, 1 / 30, probe);
			if (wasStanding && !player.standing) liftoffs++;
			wasStanding = player.standing;
			// And never further up than one jump's worth.
			expect(player.position.length() - ground).toBeLessThan(
				(PLAYER_DEFAULTS.jumpSpeed * PLAYER_DEFAULTS.jumpSpeed) /
					(2 * PLAYER_DEFAULTS.gravity) +
					1,
			);
		}
		expect(liftoffs).toBeGreaterThan(1);
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

/** Flat ground, with the whole column of each named cell built up into a wall. */
function wallOfCells(world: WorldShape, surface: number, walls: Set<string>) {
	return {
		blockAtPosition(p: { x: number; y: number; z: number }): number {
			const at = new Vec3(p.x, p.y, p.z);
			if (at.length() < surface) return BlockType.STONE;
			return walls.has(keyOf(world, positionToCell(at, world.n)))
				? BlockType.STONE
				: BlockType.AIR;
		},
	};
}

/**
 * The one name a cell is known by.
 *
 * A cell on a face edge has two or three, and `positionToCell` hands back
 * whichever face the direction landed on -- so a probe keying its walls by the
 * raw name has a block that exists from one side of the hexagon and not the
 * other.
 */
function keyOf(
	world: WorldShape,
	cell: { face: number; i: number; j: number },
): string {
	const one = canonicalCell(cell.face, world.n, cell.i, cell.j);
	return `${one.face}:${one.i}:${one.j}`;
}

/** Every cell touching one, by name. */
function ringAround(
	world: WorldShape,
	cell: { face: number; i: number; j: number },
): Set<string> {
	const out = new Set<string>();
	for (let k = 0; k < 6; k++) {
		const nb = neighbour(cell.face, world.n, cell.i, cell.j, k);
		if (nb) out.add(keyOf(world, nb));
	}
	return out;
}

/**
 * The plane between a cell and its neighbour `k`, as a normal pointing out.
 *
 * The wall runs between corners `k - 1` and `k`, and a corner is the centroid
 * of the triangle its cell shares with two neighbours -- so those two corners
 * are the ones both built from neighbour `k`.
 */
function wallNormal(
	world: WorldShape,
	cell: { face: number; i: number; j: number },
	k: number,
): Vec3 {
	const corners = cellCorners(cell.face, world.n, cell.i, cell.j);
	const degree = corners.length;
	const centre = latticePosition(cell.face, world.n, cell.i, cell.j);
	const normal = corners[(k + degree - 1) % degree]!.cross(
		corners[k]!,
	).normalize();
	return centre.dot(normal) > 0 ? normal.scale(-1) : normal;
}

/** A player settled onto flat ground, and left standing on it. */
function standing(
	world: WorldShape,
	probe: { blockAtPosition(p: Vec3): number },
	options = {},
) {
	const player = new Player(
		world,
		new Vec3(0, 0, 1).scale(RADIUS + 4),
		new Vec3(1, 0, 0),
		options,
	);
	for (let n = 0; n < 90; n++) player.step(STILL, 1 / 30, probe);
	return player;
}

/** One tick of walking at a place on the ground, whichever way it lies. */
function walkToward(
	player: Player,
	target: Vec3,
	probe: { blockAtPosition(p: Vec3): number },
	seconds: number,
): void {
	const up = player.up;
	const to = target.sub(player.position);
	const flat = to.sub(up.scale(to.dot(up)));
	const along = flat.length() > 1e-9 ? flat.normalize() : player.heading;
	player.step(
		{
			...STILL,
			ahead: along.dot(player.heading),
			aside: along.dot(player.right),
		},
		seconds,
		probe,
	);
}

describe("walls", () => {
	it("is held to a width the narrowest cell fits", () => {
		// A cell's centre-to-edge distance is half its spacing and the
		// narrowest cell anywhere runs 0.744 of the nominal, so 0.372 of a
		// block is all that fits at a pentagon. The metres asked for are a
		// ceiling: on a world of half-metre blocks the 0.3 m player would not
		// fit in a cell at all, and comes out narrower instead.
		const wide = new Player(
			fine,
			new Vec3(0, 0, RADIUS),
			new Vec3(1, 0, 0),
		);
		expect(fine.blockSize).toBeCloseTo(1, 2);
		expect(wide.radius).toBeLessThan(0.372 * fine.blockSize);
		expect(wide.radius).toBeCloseTo(PLAYER_DEFAULTS.radius, 3);

		const small = new WorldShape(RADIUS, 12, 150, maxCrustDepth(12));
		const narrow = new Player(
			small,
			new Vec3(0, 0, RADIUS),
			new Vec3(1, 0, 0),
		);
		expect(small.blockSize).toBeCloseTo(0.5, 2);
		expect(narrow.radius).toBeLessThan(0.372 * small.blockSize);
		expect(narrow.radius).toBeLessThan(PLAYER_DEFAULTS.radius);
	});

	it("stops a walk into one instead of climbing it", () => {
		const here = positionToCell(
			standing(fine, flatGround(RADIUS)).position,
			fine.n,
		);
		// The whole ring is wall, so every direction they could walk is one
		// they must not leave in.
		const probe = wallOfCells(fine, RADIUS, ringAround(fine, here));
		const player = standing(fine, probe);
		const ground = player.position.length();

		for (let k = 0; k < 6; k++) {
			const nb = neighbour(here.face, fine.n, here.i, here.j, k)!;
			const at = latticePosition(nb.face, fine.n, nb.i, nb.j).scale(
				RADIUS,
			);
			for (let n = 0; n < 60; n++) walkToward(player, at, probe, 1 / 30);

			// Never lifted: a wall is walked into, never up.
			expect(player.position.length()).toBeCloseTo(ground, 6);
			// Never inside one, at the feet or at the eye.
			expect(probe.blockAtPosition(player.eye)).toBe(BlockType.AIR);
			expect(keyOf(fine, positionToCell(player.position, fine.n))).toBe(
				keyOf(fine, here),
			);
		}
	});

	it("holds the eye its own width off the wall, not up against it", () => {
		const here = positionToCell(
			standing(fine, flatGround(RADIUS)).position,
			fine.n,
		);
		const probe = wallOfCells(fine, RADIUS, ringAround(fine, here));
		const player = standing(fine, probe);

		for (let k = 0; k < 6; k++) {
			const nb = neighbour(here.face, fine.n, here.i, here.j, k)!;
			const at = latticePosition(nb.face, fine.n, nb.i, nb.j).scale(
				RADIUS,
			);
			for (let n = 0; n < 60; n++) walkToward(player, at, probe, 1 / 30);

			// Pressed against that wall, and stopped its own width short of
			// it. A player with no width reads zero here, which is an eye
			// sitting on the face of the block in front of it.
			//
			// The micrometre is the renormalise that holds the altitude: a
			// push runs along a plane through the planet's centre, so putting
			// the player back at the radius they were handed moves them along
			// the wall by a few nanometres. Measured at 3.7e-9 m.
			const past = player.position.dot(wallNormal(fine, here, k));
			expect(past).toBeLessThanOrEqual(-player.radius + 1e-6);
			expect(past).toBeGreaterThan(-player.radius - 0.05);

			// And clear of every other wall by at least as much, so no corner
			// leaks while one wall is being leaned on.
			for (let other = 0; other < 6; other++)
				expect(
					player.position.dot(wallNormal(fine, here, other)),
				).toBeLessThanOrEqual(-player.radius + 1e-6);
		}
	});

	it("holds at any speed the panel allows, over a coarse tick", () => {
		// 20 m/s is the top of the Walk speed slider and 10 Hz is a far worse
		// frame than anything real, so one step covers 2 m -- two cells,
		// where a single test against where the step began would miss the
		// wall entirely.
		const here = positionToCell(
			standing(fine, flatGround(RADIUS)).position,
			fine.n,
		);
		const probe = wallOfCells(fine, RADIUS, ringAround(fine, here));
		const player = standing(fine, probe, { walkSpeed: 20 });

		for (let k = 0; k < 12; k++) {
			const around = (k * Math.PI) / 6;
			for (let n = 0; n < 20; n++)
				player.step(
					{
						...STILL,
						ahead: Math.cos(around),
						aside: Math.sin(around),
					},
					1 / 10,
					probe,
				);
			expect(probe.blockAtPosition(player.eye)).toBe(BlockType.AIR);
			expect(keyOf(fine, positionToCell(player.position, fine.n))).toBe(
				keyOf(fine, here),
			);
		}
	});

	it("stops a jump at a ceiling instead of passing through it", () => {
		const player = standing(fine, flatGround(RADIUS));
		const ground = player.position.length();
		const roof = fine.layerOfRadius(ground + 3.5);
		const under = fine.radiusOfLayer(roof + 1);
		const probe = {
			blockAtPosition(p: { x: number; y: number; z: number }): number {
				const r = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
				if (r < RADIUS) return BlockType.STONE;
				return fine.layerOfRadius(r) === roof
					? BlockType.STONE
					: BlockType.AIR;
			},
		};
		// The roof is genuinely in the way, or this proves nothing.
		expect(under).toBeLessThan(
			ground + JUMP_REACH + PLAYER_DEFAULTS.height,
		);

		player.step({ ...STILL, jump: true }, 1 / 60, probe);
		let highest = 0;
		for (let n = 0; n < 180; n++) {
			player.step(STILL, 1 / 60, probe);
			highest = Math.max(
				highest,
				player.position.length() + PLAYER_DEFAULTS.height,
			);
		}
		// The head stopped under it, the jump still left the ground, and the
		// player came back down to stand where they started.
		expect(highest).toBeLessThanOrEqual(under + 1e-6);
		expect(highest).toBeGreaterThan(ground + PLAYER_DEFAULTS.height);
		expect(player.position.length()).toBeCloseTo(ground, 6);
	});

	it("never changes the altitude it was handed", () => {
		// The push runs along a plane through the planet's centre, which is
		// only nearly tangent here -- a wall that moved a player radially
		// would be a wall they could climb or sink through.
		const player = standing(fine, flatGround(RADIUS));
		const here = positionToCell(player.position, fine.n);
		const boxed = wallOfCells(fine, RADIUS, ringAround(fine, here));
		for (let k = 0; k < 6; k++) {
			const around = (k * Math.PI) / 3;
			const to = player.position.add(
				new Vec3(Math.cos(around), Math.sin(around), 0).scale(2),
			);
			const out = slidePastWalls(
				player.position,
				to,
				fine,
				boxed,
				player.radius,
				PLAYER_DEFAULTS.height,
			);
			expect(out.length()).toBeCloseTo(to.length(), 9);
		}
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

	it("jumps from real ground and comes back to the same real ground", () => {
		// Flat ground cannot catch a landing that settles a layer high,
		// because there every layer boundary is the same one. Generated
		// ground has a surface that actually varies, and standing still on it
		// between jumps is what says the height is being read and not drifted.
		//
		// On land, because a jump is refused in water: the chest-deep test is
		// what tells swimming from standing, and a floating player has no
		// ground to push off.
		const place = landAt();
		const player = new Player(
			shape,
			place.scale(RADIUS + 200),
			new Vec3(1, 0, 0),
		);
		for (let n = 0; n < 600; n++) player.step(STILL, 1 / 30, terrain);
		expect(player.standing).toBe(true);
		const ground = player.position.length();

		for (let jump = 0; jump < 3; jump++) {
			player.step({ ...STILL, jump: true }, 1 / 30, terrain);
			expect(player.standing).toBe(false);
			let peak = player.position.length();
			for (let n = 0; n < 90; n++) {
				player.step(STILL, 1 / 30, terrain);
				peak = Math.max(peak, player.position.length());
			}
			expect(peak - ground).toBeGreaterThan(JUMP_REACH * 0.9);
			expect(player.position.length()).toBeCloseTo(ground, 6);
			expect(player.standing).toBe(true);
		}
	});
});
