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
 * **One shape width, with the field read four times faster down a column than
 * across the ground** ({@link CARVE_SQUASH}). The two are one setting and were
 * measured together (`tools/trial-carve-reach.ts`), over the land columns of
 * the shipped world: the share of blocks the layer opens at each depth under
 * the ground, and the share of columns holding rock over air over rock
 * anywhere inside the reach.
 *
 * | reach | 5 m | 10 m | 20 m | 30 m | 50 m | 80 m | overhangs |
 * |---|---|---|---|---|---|---|---|
 * | `4` widths, 480 m, read `x1` | 47.6% | 45.3% | 39.5% | 34.4% | 25.8% | 17.2% | 19.9% |
 * | `2` widths, 240 m, read `x1` | 45.9% | 42.2% | 34.4% | 27.4% | 16.8% | 7.3% | 8.2% |
 * | `0.5`, 60 m, read `x1` | 36.8% | 25.2% | 9.3% | 1.8% | 0.0% | 0.0% | **0.0%** |
 * | `2` widths, 240 m, read `x2` | 48.8% | 45.0% | 37.4% | 30.0% | 18.2% | 6.0% | 25.0% |
 * | **`1` width, 120 m, read `x4`** | **44.1%** | **36.2%** | **22.4%** | **13.6%** | **3.8%** | **0.2%** | **29.3%** |
 *
 * **Depth alone is the expensive way to buy an overhang and the cheap way to
 * lose the mountain.** Every block inside the reach costs a noise stack to be
 * told whether it is rock, because `fillColumn` evaluates down to the deepest
 * term any layer reaches -- at four widths that is `480` layers of every
 * column, a chunk of the shipped world at `820 ms` against `317 ms` at half a
 * width (`tools/trial-caves.ts`, caves at their own 28 m). And it opened
 * `17.2%` of the blocks **eighty metres under the ground**, which is a cave
 * system rather than a hillside: on the landscape bench's own mountain patch
 * it took the lowest ground from `77 m` to `22 m`, eating the mass rather than
 * cutting into its face.
 *
 * **So the depth is short and the shapes are flattened instead.** At one width
 * read four times faster the same patch keeps its mass -- ground `88 m` to
 * `202 m` against `77 m` to `209 m` uncarved -- while `9,190` of its `12,481`
 * columns hold rock over air, `6` spans deep at the deepest, against `1,938`
 * at four widths and **`4`** at half a width. More overhangs than the deep
 * reach ever gave, for `461 ms` a chunk: `56%` of the deep reach's bill.
 *
 * **Measured in the layer's own scale because that is the only length the
 * layer has**, so widening the shapes lets them reach deeper by the same factor
 * rather than needing a second knob kept in agreement with the first.
 */
export const CARVE_REACH = 1;

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
 * **At `1` the sample point is the block's own and nothing is flattened; it is
 * `4`.** That is what makes an overhang possible at a reach short enough to
 * afford: over the shipped world at one width of reach it takes the share of
 * land columns holding rock over air over rock from `1.5%` to `29.3%`, past
 * what a four-width reach reached at `19.9%` and a quarter of its walked
 * depth. The cost is that the *surface* roughens at block scale, because a
 * column can lose a block off its top where its neighbour loses none: at `x8`
 * that is green ground and grey cliffs becoming green and grey speckle, and
 * `x4` is where the cliffs are deeply undercut and the meadow over them is
 * still a meadow. Frames at `x1`, `x2`, `x4` and `x8` are what chose it, not
 * the table -- the share of columns says how much rock is over air and says
 * nothing about whether the ground above reads as ground.
 */
export const CARVE_SQUASH = 4;

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
