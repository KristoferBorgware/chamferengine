import type { BlockProbe } from "./BlockProbe.js";
import type { PlayerOptions } from "./PlayerOptions.js";
import type { WorldShape } from "../world/WorldShape.js";
import { BlockType, isSolid } from "../generation/terrain/BlockType.js";
import { PLAYER_DEFAULTS } from "./PlayerOptions.js";
import { Vec3 } from "../math/Vec3.js";
import { slidePastWalls } from "./slidePastWalls.js";
import { transport } from "./transport.js";
import { turn } from "./turn.js";

/**
 * The widest a player may be, as a share of a block.
 *
 * A cell's centre-to-edge distance is half its spacing, and the narrowest cell
 * on any planet here is `0.744` of the nominal spacing -- so `0.372` of a
 * block is the most that fits at a pentagon, and this leaves a margin under
 * it. Two facing walls asking for a place narrower than the player is have no
 * answer.
 */
const FITS_CELL = 0.3;

/**
 * The furthest one piece of a step may carry, as a share of a block.
 *
 * Under the `0.372` a cell's own half-width comes to, so a piece can never
 * carry a player clean across the cell whose walls it was measured against.
 */
const WALL_STRIDE = 0.35;

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

	/**
	 * The world's layer grid.
	 *
	 * **Not readonly, because the world is rebuilt under a live player.**
	 * Moving a terrain knob makes a new `WorldShape` -- `maxElevation` moves
	 * the crust top, so every layer boundary moves with it -- and a player
	 * holding the old one falls through ground that is no longer where it was.
	 */
	shape: WorldShape;
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

	/** How fast the player flies, in metres a second, before {@link altitudeScale}. */
	get flySpeed(): number {
		return this.settings.flySpeed;
	}

	/** Change how fast the player flies, without touching anything else about them. */
	setFlySpeed(flySpeed: number): void {
		this.settings = { ...this.settings, flySpeed };
	}

	/** Where the eyes are. */
	get eye(): Vec3 {
		return this.position.add(this.up.scale(this.settings.eyeHeight));
	}

	/** Metres above the planet's sea level. */
	get altitude(): number {
		return this.position.length() - this.shape.seaLevelRadius;
	}

	/**
	 * Whether a point is inside water of any kind.
	 *
	 * Two kinds of water, one question. The sea is a surface at one radius
	 * and holds no blocks, so being in it is being under that radius **with
	 * nothing solid in the way** -- the ground's top face lands on a layer
	 * boundary, which can leave a player standing on dry land up to a block
	 * under sea level, and a rule that only compared radii would call them a
	 * swimmer. A lake or a river is a body of its own and is blocks, so being
	 * in one is a block of water at the point. Either answers.
	 */
	private inWater(at: Vec3, probe: BlockProbe): boolean {
		const block = probe.blockAtPosition(at) as BlockType;
		if (isSolid(block)) return false;
		if (at.length() < this.shape.seaSurfaceRadius) return true;
		return block === BlockType.WATER;
	}

	/** Whether the player's chest is inside water. */
	swimming(probe: BlockProbe): boolean {
		return this.inWater(
			this.position.add(this.up.scale(this.settings.height * 0.6)),
			probe,
		);
	}

	/** Whether the player's feet are inside water, sea or otherwise. */
	wading(probe: BlockProbe): boolean {
		return this.inWater(this.position.add(this.up.scale(0.3)), probe);
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

		// Flight passes through everything. Nothing is tested, because the one
		// thing flying is for is getting to somewhere the ground is in the way
		// of.
		if (this.flying) {
			const moved = before
				.add(across.scale(seconds))
				.add(up.scale(input.lift * speed * seconds));
			this.heading = transport(this.heading, before, moved);
			this.onGround = false;
			this.position = moved;
			return;
		}

		// **Cut into pieces no wider than a cell.** The walls a step is tested
		// against are the ones around where it started, so a step long enough
		// to clear a whole cell would be measured against a place it is no
		// longer anywhere near -- and at the 20 m/s the speed knob reaches,
		// one frame at 30 Hz covers two thirds of a metre. Ordinary walking is
		// one piece: 4.5 m/s at 60 Hz is 0.075 m against the 0.35 m allowed.
		const stride = across.scale(seconds);
		const pieces = Math.max(
			1,
			Math.ceil(stride.length() / (WALL_STRIDE * this.shape.blockSize)),
		);
		const piece = stride.scale(1 / pieces);
		let moved = before;
		for (let step = 0; step < pieces; step++)
			moved = slidePastWalls(
				moved,
				moved.add(piece),
				this.shape,
				probe,
				this.radius,
				this.settings.height,
			);

		if (swimming) moved = moved.add(up.scale(input.lift * speed * seconds));

		// A heading only means anything against the ground under it, so it
		// travels with the player rather than being kept as a world vector.
		this.heading = transport(this.heading, before, moved);

		this.position = this.settle(moved, swimming, seconds, probe);
	}

	/**
	 * How wide the player is, in metres, held to what this world's cells fit.
	 *
	 * The narrowest cell anywhere runs `0.744` of the nominal spacing and its
	 * centre-to-edge distance is half that, so `0.372` of a block is all that
	 * fits at a pentagon. A world of half-metre blocks would trap a `0.3 m`
	 * player outright, so the metres asked for are a ceiling rather than the
	 * answer.
	 */
	get radius(): number {
		return Math.min(this.settings.radius, FITS_CELL * this.shape.blockSize);
	}

	/**
	 * Bring the player back to the ground, and stop them at what they hit.
	 *
	 * A falling player crosses 1.67 m at 30 frames a second, so the fall is
	 * tested against **every layer it passes** rather than against where it
	 * ended up. A column is straight, so that is a walk down one of them.
	 *
	 * This is the radial half of moving. Walking into a wall is settled before
	 * anything here runs, by {@link slidePastWalls}, so a rise arrives under
	 * the feet only by being built or eroded there -- never by being walked
	 * at.
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

		// Upward first: ground that arrived under the player is stood on
		// rather than stood in. At the shipped `stepHeight` of zero this
		// reaches one layer, which is the one holding the feet -- so it holds
		// a standing player where they are, and lifts one out of a block
		// somebody built on them. Raising it walks up that many blocks
		// unaided, which is the auto-climb this world does without.
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
		// Settled onto it, rather than on the way up through it. `fall` is
		// positive downward, so a jump makes it negative, and a test for
		// "not falling" alone catches a rising player and puts them straight
		// back on the ground they just left -- which cancels the jump on its
		// own first tick.
		if (standing >= 0 && Math.abs(this.fall) <= 0.001) {
			this.fall = 0;
			this.onGround = true;
			return up.scale(shape.radiusOfLayer(standing));
		}

		// Rising into a ceiling. `fall` is positive downward, so a jump makes
		// it negative and carries `wanted` above where the step started; the
		// head stops that the way the ground stops a fall.
		if (wanted > startRadius) {
			const head = this.settings.height;
			const inNow = shape.layerOfRadius(startRadius + head - 0.001);
			const reaches = shape.layerOfRadius(wanted + head);
			// From the first layer the head is entering rather than the one it
			// is already in, which a standing player is not held out of.
			for (let layer = inNow - 1; layer >= reaches; layer--) {
				if (layer < 0) break;
				const middle =
					shape.radiusOfLayer(layer) - shape.blockSize * 0.5;
				if (!solidAt(probe, up, middle)) continue;
				this.fall = 0;
				// The head sits just under the bottom of what it hit.
				return up.scale(shape.radiusOfLayer(layer + 1) - head);
			}
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
