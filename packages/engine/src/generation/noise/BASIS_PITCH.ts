import type { NoiseBasis } from "./NoiseBasis.js";

/**
 * What each basis's frequency is multiplied by so one feature comes out the
 * same width in all of them.
 *
 * A frequency is a number of lattice cells per unit, and the bases do not draw
 * one feature per cell. Measured as the distance between zero crossings along
 * a 8,000-unit walk at frequency 1, one feature runs `1.99` units in value
 * noise, `1.30` in Perlin, `0.89` in cellular, `0.82` in OpenSimplex2 and
 * `0.78` in psrd -- so the same **Noise scale** of 4,500 m drew continents
 * 4,500 m across in one basis and 1,800 m across in another.
 *
 * These are each basis's own width over value noise's, which brings all five
 * onto value noise's scale and leaves it at exactly 1. That matters beyond the
 * label: the panel refuses a map too coarse to carry the narrowest octave, and
 * it works out that octave's width in metres from the Noise scale and the
 * lacunarity alone. Without this the refusal would be right for one basis and
 * wrong for the other four.
 */
export const BASIS_PITCH: Record<NoiseBasis, number> = {
	value: 1,
	perlin: 0.6506,
	simplex: 0.4099,
	psrd: 0.3935,
	cellular: 0.4451,
};
