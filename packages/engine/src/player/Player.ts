import type { BlockProbe } from "./BlockProbe.js";
import type { PlayerOptions } from "./PlayerOptions.js";
import type { WorldShape } from "../world/WorldShape.js";
import { BlockType } from "../generation/terrain/BlockType.js";
import { PLAYER_DEFAULTS } from "./PlayerOptions.js";
import { Vec3 } from "../math/Vec3.js";
import { transport } from "./transport.js";
import { turn } from "./turn.js";

/** What a player is being asked to do this tick. */
export interface PlayerInput {
	/** Metres a second along the heading, and across it. */
	readonly ahead: number;
	readonly aside: number;

	/** Radians to swing the heading by, and to look up or down by. */
	readonly turn: number;
	readonly pitch: number;

	/** Metres a second straight up. Flying and swimming only. */
	readonly lift: number;

	/**
	 * Whether to jump.
	 *
	 * Answered only with both feet on the ground and neither flying nor
	 * swimming, so holding it does not climb: a player already in the air is
	 * falling, and a second push would be a flight with extra steps.
	 */
	readonly jump: boolean;

	/** Whether to leave the ground behind entirely. */
	readonly flying: boolean;
}

/**
 * Someone standing on the planet.
 *
 * Position is `float64` in world space and the heading is a unit vector along
 * the ground. Neither is a stored direction against a fixed north: there is no
 * fixed north to store one against, so the heading is carried from place to
 * place as the player moves and recomputed from the ground under them.
 *
 * A heading carried around a closed loop comes back turned by the area the loop
 * encloses over the radius squared. That is not a defect to correct, it is what
 * a sphere does, and it is why nothing here accumulates an angle.
 */
export class Player {
	/** Where the feet are. */
	position: Vec3;

	/** Along the ground, in the direction the player faces. */
	heading: Vec3;

	/** How fast the player is falling, in metres a second. Positive is down. */
	fall = 0;

	/** How far the view is tilted from the horizon, in radians. */
	pitch = 0;

	flying = false;

	/** Whether the last step left the player standing on something. */
	private onGround = false;

	private readonly shape: WorldShape;
	private settings: Required<PlayerOptions>;

	constructor(
		shape: WorldShape,
		position: Vec3,
		heading: Vec3,
		options: PlayerOptions = {},
	) {
		this.shape = shape;
		this.position = position;
		this.settings = { ...PLAYER_DEFAULTS, ...options };
		this.heading = transport(heading, position, position);
	}

	/** The direction the ground pushes back along. */
	get up(): Vec3 {
		return this.position.normalize();
	}

	/** Across the heading, to the player's right. */
	get right(): Vec3 {
		return this.heading.cross(this.up).normalize();
	}

	/** How fast the player walks, in metres a second. */
	get walkSpeed(): number {
		return this.settings.walkSpeed;
	}

	/** Change how fast the player walks, without touching anything else about them. */
	setWalkSpeed(walkSpeed: number): void {
		this.settings = { ...this.settings, walkSpeed };
	}

	/** Where the eyes are. */
	get eye(): Vec3 {
		return this.position.add(this.up.scale(this.settings.eyeHeight));
	}

	/** Metres above the planet's sea level. */
	get altitude(): number {
		return this.position.length() - this.shape.seaLevelRadius;
	}

	/** Whether the player's chest is inside water. */
	swimming(probe: BlockProbe): boolean {
		const chest = this.position.add(
			this.up.scale(this.settings.height * 0.6),
		);
		return probe.blockAtPosition(chest) === BlockType.WATER;
	}

	/** Whether the player's feet are inside water. */
	wading(probe: BlockProbe): boolean {
		const shin = this.position.add(this.up.scale(0.3));
		return probe.blockAtPosition(shin) === BlockType.WATER;
	}

	/** Whether the player is standing on something, so a jump would answer. */
	get standing(): boolean {
		return this.onGround;
	}

	/** Move one tick. */
	step(input: PlayerInput, seconds: number, probe: BlockProbe): void {
		this.flying = input.flying;
		const up = this.up;
		this.heading = turn(this.heading, up, input.turn);
		this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch + input.pitch));

		const swimming = this.swimming(probe);
		const speed = this.flying
			? this.settings.flySpeed * this.altitudeScale()
			: swimming
				? this.settings.swimSpeed
				: this.settings.walkSpeed;

		const along = this.heading
			.scale(input.ahead)
			.add(this.right.scale(input.aside));
		const length = along.length();
		const across =
			length > 1e-9 ? along.scale(speed / length) : new Vec3(0, 0, 0);

		// Off the ground the moment it is asked for, so `settle` below carries
		// the jump the same way it carries a fall -- one speed along the
		// column, tested against every layer it crosses.
		if (input.jump && !this.flying && !swimming && this.onGround) {
			this.fall = -this.settings.jumpSpeed;
			this.onGround = false;
		}

		const before = this.position;
		let moved = before.add(across.scale(seconds));
		if (this.flying || swimming)
			moved = moved.add(up.scale(input.lift * speed * seconds));

		// A heading only means anything against the ground under it, so it
		// travels with the player rather than being kept as a world vector.
		this.heading = transport(this.heading, before, moved);

		if (this.flying) {
			this.onGround = false;
			this.position = moved;
			return;
		}
		this.position = this.settle(moved, swimming, seconds, probe);
	}

	/**
	 * Bring the player back to the ground, and stop them at what they hit.
	 *
	 * A falling player crosses 1.67 m at 30 frames a second, so the fall is
	 * tested against **every layer it passes** rather than against where it
	 * ended up. A column is straight, so that is a walk down one of them.
	 *
	 * Ground a step high is walked up rather than into.
	 */
	private settle(
		moved: Vec3,
		swimming: boolean,
		seconds: number,
		probe: BlockProbe,
	): Vec3 {
		const up = moved.normalize();
		const shape = this.shape;
		this.onGround = false;

		if (swimming) {
			// Water does not hold a player up by colliding with them. It slows
			// the fall, which is a different question and a different test: one
			// is about a face, this is about the cell they are in.
			this.fall = Math.max(
				0,
				this.fall - this.settings.waterDrag * seconds,
			);
		} else {
			this.fall += this.settings.gravity * seconds;
		}

		const startRadius = moved.length();
		const wanted = startRadius - this.fall * seconds;

		// Upward first: ground that rose under the player is stepped onto.
		const feetLayer = shape.layerOfRadius(startRadius);
		let standing = -1;
		for (
			let layer = feetLayer;
			layer >=
			feetLayer - Math.ceil(this.settings.stepHeight / shape.blockSize);
			layer--
		) {
			if (layer < 0) break;
			if (solidAt(probe, up, shape.radiusOfLayer(layer + 1) + 0.05)) {
				standing = layer;
				break;
			}
		}
		if (standing >= 0 && this.fall <= 0.001) {
			this.fall = 0;
			this.onGround = true;
			return up.scale(shape.radiusOfLayer(standing));
		}

		// Downward: every layer the fall crosses, top to bottom.
		const from = shape.layerOfRadius(startRadius);
		const to = shape.layerOfRadius(wanted);
		for (let layer = from; layer <= to; layer++) {
			const floor = shape.radiusOfLayer(layer + 1);
			if (solidAt(probe, up, floor + 0.05)) {
				this.fall = 0;
				this.onGround = true;
				return up.scale(shape.radiusOfLayer(layer));
			}
		}
		return up.scale(wanted);
	}

	/** Flying gets faster the further out it goes, so orbit is reachable. */
	private altitudeScale(): number {
		return 1 + Math.max(0, this.altitude) / 60;
	}
}

/** Whether a point on a column stops a player. */
function solidAt(probe: BlockProbe, up: Vec3, radius: number): boolean {
	const block = probe.blockAtPosition(up.scale(radius));
	return block !== BlockType.AIR && block !== BlockType.WATER;
}
