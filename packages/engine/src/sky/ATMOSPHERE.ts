/**
 * The atmosphere the sky is drawn with, which is Earth's.
 *
 * Optical depth is a property of air times a path length through it, and
 * shrinking a planet shrinks only the path. Air scaled to this planet gives a
 * zenith optical depth of `6.4e-5` against Earth's `0.241` -- **3,748 times too
 * thin**, which is a black sky at noon. Making it Earth-like needs air 3,748
 * times denser or an atmosphere five times the planet's radius, and neither is
 * a real atmosphere.
 *
 * So the scattering runs on these numbers whatever the planet's own size is,
 * and the only thing taken from the world is the direction of the sun. Angles
 * scale and path lengths do not: the moon survives shrinking and the sky does
 * not.
 */
export const ATMOSPHERE = {
	/** Metres. Earth's, not the planet's. */
	planetRadius: 6371000,

	/** Metres. Where the air is thin enough to stop. */
	thickness: 60000,

	/** Metres. How fast the air thins with height. */
	rayleighScaleHeight: 8000,
	mieScaleHeight: 1200,

	/** Scattering per metre at red, green and blue. */
	rayleigh: [5.802e-6, 13.558e-6, 33.1e-6] as const,
	mie: 21e-6,

	/** How much of the Mie scattering goes forward. */
	mieDirection: 0.76,
} as const;

/**
 * Optical depth straight up through an atmosphere, for one scattering
 * coefficient.
 *
 * An exponential atmosphere integrates to the coefficient times the scale
 * height, which is why only the path length changes when a planet shrinks.
 */
export function zenithOpticalDepth(
	coefficient: number,
	scaleHeight: number,
): number {
	return coefficient * scaleHeight;
}
