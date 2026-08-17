/**
 * Earth's own air, kept as the shape every planet's atmosphere is built from.
 *
 * Optical depth is a property of air times a path length through it, and
 * shrinking a planet shrinks only the path. Air literally scaled to a 1,700 m
 * world gives a zenith optical depth of `6.4e-5` against Earth's `0.241` --
 * **3,748 times too thin**, which is a black sky at noon. Making it Earth-like
 * that way needs air 3,748 times denser or an atmosphere five times the
 * planet's radius, and neither is a real atmosphere.
 *
 * So nothing here is drawn directly. {@link planetAtmosphere} takes a world's
 * own height and its own wanted zenith depth and builds an atmosphere to
 * match, keeping Earth's ratios -- how fast Rayleigh and Mie thin relative to
 * each other, how much bluer the sky is than the sunset -- at any size. Angles
 * scale and path lengths do not: the moon survives shrinking this way, and the
 * sky needs a planet-sized atmosphere rather than a lift onto Earth's.
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

/** How many Rayleigh scale heights Earth's air keeps scattering over. */
const EARTH_TOP_RATIO = ATMOSPHERE.thickness / ATMOSPHERE.rayleighScaleHeight;

/** How much shorter Earth's haze thins over than its blue does. */
const EARTH_MIE_SHARE =
	ATMOSPHERE.mieScaleHeight / ATMOSPHERE.rayleighScaleHeight;

/** Earth's own green-plus-haze zenith reading, the scale below is measured against. */
const EARTH_ZENITH = zenithOpticalDepth(
	ATMOSPHERE.rayleigh[1] + ATMOSPHERE.mie,
	ATMOSPHERE.rayleighScaleHeight,
);

/** The seven numbers a shader needs to draw one planet's own air. */
export interface PlanetAtmosphere {
	readonly planetRadius: number;
	readonly topRadius: number;
	readonly rayleighScaleHeight: number;
	readonly mieScaleHeight: number;
	readonly rayleigh: readonly [number, number, number];
	readonly mie: number;
	readonly mieDirection: number;
}

/**
 * A planet's own atmosphere, in its own metres.
 *
 * B2 of I-1: no lift, no mapping onto Earth's radius. `top` is metres above
 * `radius` where the air is thin enough to stop, exactly the way the shipped
 * demo's candidate B built it — the scale height is `top` divided by Earth's
 * own top-to-scale-height ratio, so a taller atmosphere both reaches further
 * and thins more gradually, the two moving together the way a real one does.
 *
 * `zenithDepth` is the reading looking straight up, taken as the green
 * channel plus haze the way {@link EARTH_ZENITH} is. Every coefficient scales
 * by the same factor to reach it, which keeps Earth's spectral shape — blue
 * scatters more than red — at any strength, so a thinner air makes a paler
 * sky rather than a differently coloured one.
 */
export function planetAtmosphere(
	radius: number,
	top: number,
	zenithDepth: number,
): PlanetAtmosphere {
	const rayleighScaleHeight = top / EARTH_TOP_RATIO;
	const mieScaleHeight = rayleighScaleHeight * EARTH_MIE_SHARE;
	const scale =
		(ATMOSPHERE.rayleighScaleHeight / rayleighScaleHeight) *
		(zenithDepth / EARTH_ZENITH);
	return {
		planetRadius: radius,
		topRadius: radius + top,
		rayleighScaleHeight,
		mieScaleHeight,
		rayleigh: ATMOSPHERE.rayleigh.map((b) => b * scale) as [
			number,
			number,
			number,
		],
		mie: ATMOSPHERE.mie * scale,
		mieDirection: ATMOSPHERE.mieDirection,
	};
}
