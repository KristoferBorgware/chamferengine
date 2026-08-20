import type { Vec3 } from "../math/Vec3.js";

/** One layer of billboard clouds: how far out it sits, and how it drifts. */
export interface CloudPuffLayer {
	/** World radius the layer's puffs sit at. */
	readonly radius: number;

	/** Radians a second a puff in this layer turns about {@link WIND_AXIS}. */
	readonly windRate: number;

	/** Metres across a puff at full cover, before {@link CloudPuff.cover} scales it. */
	readonly size: number;
}

/** One translucent hexagon billboard, before the wind has turned it. */
export interface CloudPuff {
	/** Unit direction from the planet's centre, before the wind rotates it. */
	readonly direction: Vec3;

	readonly radius: number;
	readonly windRate: number;

	/** Metres across, already scaled by {@link cover}. */
	readonly size: number;

	/** How solid the puff reads, `0` excluded and `1` thickest. */
	readonly cover: number;
}
