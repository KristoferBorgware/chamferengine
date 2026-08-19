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

	/** The tallest step that can be walked up rather than into. */
	readonly stepHeight?: number;

	/** Metres a second upward when swimming. */
	readonly swimSpeed?: number;

	/** How fast a falling player stops falling in water. */
	readonly waterDrag?: number;
}

export const PLAYER_DEFAULTS = {
	walkSpeed: 1.4,
	flySpeed: 24,
	gravity: 9.81,
	eyeHeight: 1.86,
	height: 1.8,
	stepHeight: 1.05,
	swimSpeed: 2.2,
	waterDrag: 6,
} as const satisfies Required<PlayerOptions>;
