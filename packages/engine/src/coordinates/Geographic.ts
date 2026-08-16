/** Where a place is, the way a player reads it. */
export interface Geographic {
	/** Degrees from the plane through the middle, north positive. */
	readonly latitude: number;

	/** Degrees east of the prime meridian, in `(-180, 180]`. */
	readonly longitude: number;

	/** Metres above sea level. */
	readonly altitude: number;
}
