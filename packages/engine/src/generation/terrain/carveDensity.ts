import type { NoiseSettings } from "../noise/NoiseSettings.js";
import type { TerrainLayer } from "../coarse/TerrainLayer.js";
import { CARVE_SEED_OFFSET } from "../coarse/layeredHeight.js";
import { octaveNoise } from "../noise/octaveNoise.js";
import { splineAt } from "../coarse/splineAt.js";

/**
 * How many shape widths of depth the density takes to gain a full `1`, past
 * which nothing is ever air.
 *
 * **Four, because a reading is not `-1`.** An octave stack is normalised to its
 * own peak and its standard deviation is about a quarter of that, so an
 * ordinary negative reading is near `-0.25` and would be cancelled after a
 * *quarter* of the span. Set at one shape width the layer all but disappears --
 * measured, 0.7% of columns holding rock over air over rock against 34% at a
 * quarter of that rate. Four widths puts a typical reading's reach at about one
 * width and the deepest readings at three, which is a cave system rather than a
 * dimple.
 */
export const CARVE_REACH = 4;

/**
 * How far above sea level the carve takes to come back, in shape widths.
 *
 * **At the waterline the density is `1` and nothing is carved.** The layer
 * draws cliffs and overhangs, which are things on a hillside; run it down
 * through the waterline and what it opens fills, which draws as a slot of water
 * dropping through the crust and reads as a fault rather than a cave. Caves are
 * a different layer's job and this one has to stop. Against the same world with
 * the hold off, the layer puts **43%** of everything it takes under the sea;
 * with the hold on, **0%**.
 *
 * **A floor and not a band.** Suppressing a slice either side of the waterline
 * and letting the layer back in underneath moves the slots down rather than
 * removing them; at and below sea level the density is `1` outright.
 *
 * **The fade is what stops the waterline being a shelf.** With no fade the
 * density jumps from the reading to `1` across one plane and every carve that
 * would have gone below stops on it: **42.8%** of every hole in a patch had its
 * floor on that one layer. What a fade costs is the layer's own work, steadily
 * -- 2,743 holes at no fade, 2,173 at a quarter, 1,666 at a half, 820 at a
 * whole one -- so a quarter is the shortest fade that is not a step, keeping
 * **79%** of the holes.
 */
export const WATERLINE_REACH = 0.25;

/**
 * How deep the carve works, in metres.
 *
 * The density gains a full `1` over {@link CARVE_REACH} shape widths, so
 * nothing under that can be air whatever the field says. **Measured in the
 * layer's own scale because that is the only length the layer has**, so
 * widening the shapes lets them reach deeper by the same factor rather than
 * needing a second knob kept in agreement with the first.
 */
export function carveDepth(layer: TerrainLayer): number {
	return CARVE_REACH * Math.max(1, layer.metres);
}

/**
 * Whether one block of a column is rock, after the carve has had it.
 *
 * **One reading decides one block, and that is the rule.** The field is read at
 * the block's own point in space and the block is air where the reading is not
 * positive -- plus two things added to it, both pushing toward rock, and
 * neither of them a knob.
 *
 * - **Depth.** The density gains a full `1` over {@link carveDepth}, so at the
 *   bottom of that nothing the noise can say reaches air. That is *do not cut
 *   below the crust* enforced by the number rather than by a clamp.
 * - **The waterline.** `1` at and below sea level, fading back over `hold`
 *   metres above it, so a cliff cut into a headland stops at the water instead
 *   of running on down and filling. Raise it and the layer keeps off the low
 *   ground and works only on what stands well above the sea.
 *
 * **The curve is a transform of the reading and its middle is the line between
 * air and rock.** A straight line hands the field through unchanged; anything
 * else moves which readings are which.
 *
 * **The sample point is the direction scaled by `1 + metres / radius`**, which
 * is the world point that block stands at -- so a metre up moves it exactly as
 * far as a metre sideways and the shapes are the same size in every direction.
 *
 * `elevation` and `depthBelow` are both in metres: the first is where the map
 * put the ground above sea level, the second how far under it this block sits.
 */
export function carveIsRock(
	x: number,
	y: number,
	z: number,
	radius: number,
	elevation: number,
	depthBelow: number,
	seed: number,
	layer: TerrainLayer,
	settings: NoiseSettings,
	hold: number = WATERLINE_REACH * Math.max(1, layer.metres),
): boolean {
	const deep = carveDepth(layer);
	if (depthBelow >= deep) return true;
	// Metres above sea level at this block, which is what both added terms are
	// measured against.
	const up = elevation - depthBelow;
	const out = 1 + up / radius;
	const read = octaveNoise(x * out, y * out, z * out, seed, settings);
	const said = splineAt(layer.curve, read) * 2 - 1;
	const held = Math.max(0, Math.min(1, 1 - up / Math.max(1e-6, hold)));
	const density = said + (1 - said) * held;
	return density + depthBelow / deep > 0;
}

/** The carve's own seed, kept beside the offset so both are read in one place. */
export function carveSeed(seed: number): number {
	return (seed + CARVE_SEED_OFFSET) | 0;
}
