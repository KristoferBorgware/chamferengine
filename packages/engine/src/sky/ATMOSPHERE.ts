/**
 * Earth's own air, kept only as the proof of why it cannot be scaled down.
 *
 * Optical depth is a property of air times a path length through it, and
 * shrinking a planet shrinks only the path. Air literally scaled to a 1,700 m
 * world gives a zenith optical depth of `6.4e-5` against Earth's `0.241` --
 * **3,748 times too thin**, which is a black sky at noon. Making it Earth-like
 * that way needs air 3,748 times denser or an atmosphere five times the
 * planet's radius, and neither is a real atmosphere.
 *
 * Nothing here is drawn directly. What ships, {@link planetAtmosphere} below,
 * does not lift these numbers onto a smaller world at all -- it builds a
 * planet-sized atmosphere from its own knobs instead. This constant and
 * {@link zenithOpticalDepth} stay only because a page in `docs/` still argues
 * the scaling claim from them.
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

/**
 * What one planet's own air is, in Sebastian Lague's atmosphere model.
 *
 * **Replaced, not tuned.** The zenith-depth model above was one answer to the
 * scaling problem this file's own doc comment proves; this is a different one
 * -- Rayleigh alone, one density curve, wavelengths a person can read. There
 * is no Mie term and no separate haze: a single exponential-times-linear
 * falloff stands in for both, and what colour it scatters comes from three
 * wavelengths run through the same inverse-fourth-power law real air obeys.
 */
export interface PlanetAtmosphere {
	readonly planetRadius: number;
	readonly topRadius: number;

	/** How sharply the air thins with height, as one dimensionless number. */
	readonly densityFalloff: number;

	/** Scattering per metre at red, green and blue, already at its strength. */
	readonly scattering: readonly [number, number, number];

	/**
	 * What the light falling on the air is worth, with no say in its colour.
	 *
	 * **The one knob that moves brightness alone.** Every other knob here
	 * moves how much air a ray crosses, and that decides the colour as well:
	 * blue scatters `6.4x` harder than red and so extinguishes `6.4x` faster,
	 * so a thicker atmosphere is both brighter and less blue. Measured over
	 * the whole range (`tools/trial-sky.ts`), raising **Scattering strength**
	 * from 5 to 80 takes the zenith from blue at `5.3` blue-over-red, through
	 * cyan, to orange at `0.3` -- there is no setting of it that is bright and
	 * blue at once. This is what makes one possible.
	 */
	readonly intensity: number;

	/**
	 * Haze: scattering off things far bigger than a wavelength.
	 *
	 * Grey rather than coloured, and thrown forward rather than evenly, so it
	 * is what draws the halo around a low sun and the pale band along the
	 * horizon. It shares the air's own density curve, so it needs no second
	 * table -- the table is a path length, and this is one more coefficient
	 * multiplied against it.
	 */
	readonly mieStrength: number;

	/** How far forward the haze throws light, `0` even to `~0.9` a tight halo. */
	readonly mieDirection: number;

	/**
	 * How much of the air a **surface** is seen through, against how much the
	 * sky is made of.
	 *
	 * The colour behind the air is multiplied by `exp(-viewDepth * extinction)`
	 * and that is correct single scattering -- but on a planet this size a
	 * horizontal look of two or three kilometres crosses a large fraction of
	 * the whole atmosphere's optical depth, where the same distance on Earth
	 * crosses a small one. So distant ground goes the colour of the sky at a
	 * range where an eye expects it to still be ground.
	 *
	 * Every knob that would weaken that also weakens the sky, because the haze
	 * and the sky's own colour are the same coefficients. This scales the
	 * surface term alone: `1` is the honest single-scattering answer, and
	 * under it distance clears without the zenith going pale.
	 */
	readonly aerialPerspective: number;
}

/** The knobs the panel exposes, before they become a shader's numbers. */
export interface AtmosphereKnobs {
	/** Nanometres, one per channel -- what the inverse-fourth-power law reads. */
	readonly wavelengths: readonly [number, number, number];

	/** Multiplies every wavelength's coefficient by the same amount. */
	readonly scatteringStrength: number;

	/** How sharply density falls from the surface to the top of the air. */
	readonly densityFalloff: number;

	/** Fraction of the planet's own radius the air reaches past it. */
	readonly atmosphereScale: number;

	/** What the light on the air is worth. Brightness, and nothing else. */
	readonly intensity: number;

	/** How much grey, forward-thrown haze there is. */
	readonly mieStrength: number;

	/** How tightly that haze throws light forward. */
	readonly mieDirection: number;

	/** How much air a surface is seen through. `1` is the honest answer. */
	readonly aerialPerspective: number;
}

/**
 * A planet's own atmosphere, in its own metres.
 *
 * `topRadius` is `radius * (1 + atmosphereScale)` -- a fraction of the body's
 * own size, so the same **Atmosphere scale** means the same picture on a
 * moon and on a planet twenty times its radius. **Rayleigh's own law**:
 * scattering runs as the inverse fourth power of wavelength, so shorter
 * (bluer) light scatters harder than longer (redder) light by construction --
 * red at 700 nm scatters `(400/700)^4 ≈ 0.107` of what 400 nm would, blue at
 * 460 nm scatters `0.573`. **Scattering strength** is the one knob that moves
 * all three together, the way real air gets thicker or thinner without
 * changing its colour.
 */
export function planetAtmosphere(
	radius: number,
	knobs: AtmosphereKnobs,
): PlanetAtmosphere {
	const scattering = knobs.wavelengths.map(
		(nm) => (400 / nm) ** 4 * knobs.scatteringStrength,
	) as [number, number, number];
	return {
		planetRadius: radius,
		topRadius: radius * (1 + knobs.atmosphereScale),
		densityFalloff: knobs.densityFalloff,
		scattering,
		intensity: knobs.intensity,
		mieStrength: knobs.mieStrength,
		// A Henyey-Greenstein phase divides by `(1 + g^2 - 2g cos)^1.5`, which
		// is zero at `g = 1` looking straight at the sun. Held just under it.
		mieDirection: Math.min(0.95, Math.max(-0.95, knobs.mieDirection)),
		aerialPerspective: Math.max(0, knobs.aerialPerspective),
	};
}
