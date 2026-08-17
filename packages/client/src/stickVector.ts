/** One axis pair from a thumbstick, as the player's own step wants them. */
export interface StickVector {
	/** Forward at 1, back at -1. */
	readonly ahead: number;

	/** Right at 1, left at -1. */
	readonly aside: number;
}

/**
 * How far from the middle a thumb has to move before it counts.
 *
 * A thumb resting on the pad is never exactly centred, and without this the
 * player creeps whenever a finger is down.
 */
const DEAD_ZONE = 0.12;

/**
 * Where a thumb sitting `dx, dy` from the pad's middle is pointing.
 *
 * Analog rather than eight-way: the distance out is the speed, so a thumb
 * near the middle creeps and one at the rim runs, which is the whole reason
 * to draw a stick rather than four buttons.
 *
 * Past the dead zone the reading is rescaled to start at zero rather than
 * jumping to it, so a thumb crossing the threshold does not lurch. Screen `y`
 * grows downward and forward is up, which is why `ahead` is negated.
 */
export function stickVector(
	dx: number,
	dy: number,
	radius: number,
): StickVector {
	const distance = Math.sqrt(dx * dx + dy * dy);
	const reach = Math.min(1, distance / radius);
	if (reach <= DEAD_ZONE) return { ahead: 0, aside: 0 };
	const speed = (reach - DEAD_ZONE) / (1 - DEAD_ZONE);
	return {
		ahead: (-dy / distance) * speed,
		aside: (dx / distance) * speed,
	};
}
