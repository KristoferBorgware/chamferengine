/**
 * Which noise function the octave stack samples.
 *
 * Every one of them is a scalar field over 3D space in `[-1, 1]`, sampled from
 * a cell's own direction, so they are interchangeable under the same octave,
 * persistence, lacunarity, offset and ridge settings. What differs is the shape
 * of the features one octave draws.
 *
 * | | lattice | one octave looks like |
 * |---|---|---|
 * | `value` | cubic, corner values | round blobs on a grid, faint axis grain |
 * | `perlin` | cubic, corner gradients | the same grid with zero crossings on it |
 * | `simplex` | body-centred cubic | round blobs with no axis grain |
 * | `psrd` | simplex, rotating gradients | blobs whose lobes turn with `spin` |
 * | `cellular` | jittered feature points | plates with seams between them |
 *
 * `value`, `perlin` and `simplex` are gradient-or-value noise and differ mostly
 * in how much of the cubic lattice shows through. `cellular` is not noise of
 * that kind at all: it measures distance to the nearest scattered point, so it
 * has hard seams no amount of octaves smooths away.
 */
export type NoiseBasis = "value" | "perlin" | "simplex" | "psrd" | "cellular";

export const NOISE_BASES: readonly NoiseBasis[] = [
	"value",
	"perlin",
	"simplex",
	"psrd",
	"cellular",
] as const;
