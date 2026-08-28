import type { NoiseSettings } from "../noise/NoiseSettings.js";
import type { TerrainLayer } from "../coarse/TerrainLayer.js";
import { CARVE_SEED_OFFSET } from "../coarse/layeredHeight.js";
import { octaveNoise } from "../noise/octaveNoise.js";
import { splineAt } from "../coarse/splineAt.js";

/**
 * How many shape widths of depth the density takes to gain a full `1`, past
 * which nothing is ever air.
 *
 * **Cliffs and overhangs are a surface feature, and this is what says so.** The
 * layer cuts into the ground the map placed; what is under it is the caves'
 * work, and the two are separate layers a reader tunes on separate benches. So
 * the number's job is to fade the layer out on the way down rather than to let
 * it reach as far as it can.
 *
 * **Half a shape width, measured** (`tools/trial-carve-reach.ts`). Over the
 * land columns of the shipped world, the share of blocks the layer opens at
 * each depth under the ground, and the share of columns holding rock over air
 * over rock anywhere inside the reach:
 *
 * | reach | 5 m | 10 m | 20 m | 30 m | 50 m | 80 m | overhangs |
 * |---|---|---|---|---|---|---|---|
 * | `4` widths, 480 m | 47.6% | 45.3% | 39.5% | 34.4% | 25.8% | 17.2% | 19.9% |
 * | `2` widths, 240 m | 45.9% | 42.2% | 34.4% | 27.4% | 16.8% | 7.3% | 8.2% |
 * | `1` width, 120 m | 43.1% | 36.5% | 24.1% | 14.8% | 4.6% | 0.1% | 1.5% |
 * | **`0.5`, 60 m** | **36.8%** | **25.2%** | **9.3%** | **1.8%** | **0.0%** | **0.0%** | **0.0%** |
 * | `0.25`, 30 m | 26.0% | 9.8% | 0.2% | 0.0% | 0.0% | 0.0% | 0.0% |
 *
 * At four widths the layer took **17.2% of the blocks eighty metres under the
 * ground** and `1.4%` two hundred down, which is a cave system rather than a
 * hillside -- and every one of those blocks costs a noise stack to be told it
 * is refused, because `fillColumn` evaluates down to the deepest term any layer
 * reaches. Measured, a chunk of the shipped world went from `699 ms` to
 * `277 ms` when this came down (`tools/trial-caves.ts`).
 *
 * **What the depth was also buying is overhangs, and half a width has none.**
 * The layer's shapes are as tall as they are wide, so at a 120 m shape the
 * density needs a hundred metres of depth to change its mind -- rock over air
 * over rock happened at all only because the reach was hundreds of metres.
 * {@link CARVE_SQUASH} is the measured way to have both and is not switched on;
 * what the world has here is cliffs cut into a hillside and no roof over any of
 * them.
 *
 * **Measured in the layer's own scale because that is the only length the
 * layer has**, so widening the shapes lets them reach deeper by the same factor
 * rather than needing a second knob kept in agreement with the first.
 */
export const CARVE_REACH = 0.5;

/**
 * How much faster the field is read down a column than across the ground.
 *
 * **A cliff is wide and shallow, and one scale cannot say that.** The layer is
 * a field in space read at the block's own point, so a shape is as tall as it
 * is wide: at the shipped 120 m shape the density needs a hundred metres of
 * depth to change its mind, which is why an overhang used to want a reach of
 * hundreds of metres to exist at all. Reading the radial part of the sample
 * point this many times faster makes the shapes that much shorter than they
 * are wide, so the field flips within a hillside rather than within a crust --
 * and a reach measured in tens of metres can then hold an overhang.
 *
 * **At `1` the sample point is the block's own and no world moves, and that is
 * where it is set.** What the lever buys and what it costs are both real and
 * neither is decided: over the shipped world at half a width of reach it takes
 * the share of columns holding rock over air over rock from `0.0%` to `9.9%`
 * at `x2` and `30.7%` at `x8` -- more overhangs than the four-width reach ever
 * gave -- and at `x8` it also makes the *surface* patchy at block scale, since
 * a column loses three blocks off its top where its neighbour loses none.
 * Green ground with grey cliffs in it becomes green and grey speckle. Which
 * matters more is a decision about how the world should look rather than a
 * measurement, so the number stays at `1` until somebody makes it.
 */
export const CARVE_SQUASH = 1;

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
export function carveDepth(
	layer: TerrainLayer,
	reach: number = CARVE_REACH,
): number {
	return reach * Math.max(1, layer.metres);
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
	deep: number = carveDepth(layer),
	squash: number = CARVE_SQUASH,
): boolean {
	if (depthBelow >= deep) return true;
	// Metres above sea level at this block, which is what both added terms are
	// measured against.
	const up = elevation - depthBelow;
	// **Faster down than across**, so a shape is shorter than it is wide and the
	// density can change its mind inside a hillside. See {@link CARVE_SQUASH}.
	const out = 1 + (up * squash) / radius;
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
