/** How a player moves. */
export interface PlayerOptions {
	/** Metres a second on the ground. */
	readonly walkSpeed?: number;

	/** Metres a second in the air, before altitude scales it. */
	readonly flySpeed?: number;

	/** Metres a second squared, toward the planet's centre. */
	readonly gravity?: number;

	/**
	 * How high the camera sits over the feet.
	 *
	 * Separate from {@link PlayerOptions.height}, which is the yardstick the
	 * water tests measure a chest against and nothing else. This one is where
	 * the picture is taken from.
	 */
	readonly eyeHeight?: number;

	/** How tall the player is, in metres. */
	readonly height?: number;

	/**
	 * How wide the player is from their own centre, in metres.
	 *
	 * What holds the camera off a wall: at zero the player is a point, stops
	 * with their eye exactly on the face of the block in front of them, and
	 * sees through it.
	 *
	 * **Held to the narrowest cell the world has.** A cell's centre-to-edge
	 * distance is half its spacing, and the narrowest cell on any planet here
	 * runs `0.744` of the nominal spacing, so nothing wider than `0.372` of a
	 * block fits everywhere. {@link Player} caps this at `0.3` of a block,
	 * which leaves that margin and matches the shipped `0.3 m` on a 1 m world.
	 */
	readonly radius?: number;

	/**
	 * The tallest step that can be walked up rather than into.
	 *
	 * **A whole-block switch, not a height.** Ground sits on layer boundaries,
	 * so every step between two columns is a whole number of blocks and there
	 * is no part-block rise for this to smooth: anything under one block walks
	 * up nothing, and anything from one to two walks up exactly one. Zero, so
	 * a rise is climbed by jumping.
	 */
	readonly stepHeight?: number;

	/** Metres a second upward when swimming. */
	readonly swimSpeed?: number;

	/** How fast a falling player stops falling in water. */
	readonly waterDrag?: number;

	/**
	 * Metres a second upward a jump starts with.
	 *
	 * A jump reaches `jumpSpeed^2 / (2 * gravity)` at the top, so 6.5 m/s
	 * against 9.81 m/s^2 clears 2.15 m -- two blocks at the shipped size, and
	 * the only way up a rise now that nothing is walked up on its own.
	 */
	readonly jumpSpeed?: number;
}

export const PLAYER_DEFAULTS = {
	walkSpeed: 4.5,
	flySpeed: 24,
	gravity: 9.81,
	eyeHeight: 1.86,
	height: 1.8,
	radius: 0.3,
	stepHeight: 0,
	swimSpeed: 2.2,
	waterDrag: 6,
	jumpSpeed: 6.5,
} as const satisfies Required<PlayerOptions>;
