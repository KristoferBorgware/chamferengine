/** How a player moves. */
export interface PlayerOptions {
	/** Metres a second on the ground. */
	readonly walkSpeed?: number;

	/** Metres a second in the air, before altitude scales it. */
	readonly flySpeed?: number;

	/** Metres a second squared, toward the planet's centre. */
	readonly gravity?: number;

	/** How high the eye sits over the feet. */
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
	eyeHeight: 1.6,
	height: 1.8,
	stepHeight: 1.05,
	swimSpeed: 2.2,
	waterDrag: 6,
} as const satisfies Required<PlayerOptions>;
