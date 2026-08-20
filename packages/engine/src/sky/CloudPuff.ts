import type { Vec3 } from "../math/Vec3.js";

/** One deck of billboard clouds: where it sits, how it drifts, how it is built. */
export interface CloudPuffLayer {
	/** World radius the deck's formations sit at. */
	readonly radius: number;

	/** Radians a second a puff in this deck turns about {@link WIND_AXIS}. */
	readonly windRate: number;

	/** Metres across one puff at its largest. */
	readonly size: number;

	/** Metres across one formation, so a cluster is many puffs wide. */
	readonly spread: number;

	/** Metres a formation reaches above and below its own radius. */
	readonly thickness: number;
}

/** One translucent hexagon billboard, before the wind has turned it. */
export interface CloudPuff {
	/** Unit direction from the planet's centre, before the wind rotates it. */
	readonly direction: Vec3;

	/** World radius this puff sits at, its formation's own plus a lift. */
	readonly radius: number;

	readonly windRate: number;

	/** Metres across. */
	readonly size: number;

	/** How solid the puff reads, `0` clear and `1` thickest. */
	readonly cover: number;

	/**
	 * How much light the puff keeps, `0` its darkest and `1` its brightest.
	 *
	 * Baked from how high the puff sits inside its own formation, so a mass
	 * has bright tops over grey undersides and reads as one solid thing
	 * rather than a heap of identical hexagons.
	 */
	readonly shade: number;
}
