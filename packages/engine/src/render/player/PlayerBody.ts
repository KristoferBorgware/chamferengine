import type { Vec3 } from "../../math/Vec3.js";

/**
 * The player, as the shape that stands for them on screen.
 *
 * There is no `up` here because there is nowhere to store one: up is
 * `normalize(position)` everywhere on the planet, so a stored one would be a
 * second answer to a question the position already answers.
 */
export interface PlayerBody {
	/** Where the feet are, in world space. */
	readonly position: Vec3;

	/**
	 * Along the ground, in the direction the player faces.
	 *
	 * A capsule is the same shape from every side, so this decides nothing
	 * about its outline. It decides the shading: the side turned toward the
	 * way the player is facing is lighter, which is what makes a pill read as
	 * a person facing somewhere rather than as a bollard.
	 */
	readonly heading: Vec3;

	/** Metres from the feet to the top of the head. */
	readonly height: number;

	/** Metres from the player's own centre line to their side. */
	readonly radius: number;
}
