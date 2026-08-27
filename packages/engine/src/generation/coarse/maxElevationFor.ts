import type { CoarseMapOptions } from "./CoarseMapOptions.js";
import { COARSE_MAP_DEFAULTS } from "./CoarseMapOptions.js";

/**
 * The highest the ground can stand above sea level, in metres.
 *
 * **The height is no longer fitted to its own peak, so this is arithmetic
 * rather than a measurement.** Under a percentile fit the tallest point was
 * exactly `relief` whatever every shape knob said, which made `relief` a number
 * that could be asked for -- and cost a coast that moved whenever it was
 * dragged, because the fit divides by the field's own peak. The metres now come
 * out of the continentalness curve, so the shore is the curve's middle and no
 * metre knob moves it; what that costs is `relief` becoming a *bound* rather
 * than an answer.
 *
 * The bound is exact and it is the sum of the two terms that can stack:
 * `relief` is the most the level can reach above the waterline and `peakRelief`
 * is the most a full peak adds on top of it. Erosion only ever takes away, and
 * the drained sea only ever lifts, so both are on the safe side of this.
 *
 * **Anything sizing a crust has to use this and not `relief`.** A world whose
 * crust top is `relief` above sea level has ground standing out of it wherever
 * a peak lands on high continent, which draws as ground clipped off flat.
 */
export function maxElevationFor(options: CoarseMapOptions = {}): number {
	const s = { ...COARSE_MAP_DEFAULTS, ...options };
	return (
		s.relief + (s.peaksLayer ? s.peakRelief : 0) + Math.max(0, -s.seaLevel)
	);
}

/**
 * The deepest the sea floor can sit below sea level, in metres.
 *
 * The mirror of {@link maxElevationFor}: `seaDepth` is the most the level can
 * reach below the waterline and a full valley takes `peakRelief` more.
 */
export function maxDepthFor(options: CoarseMapOptions = {}): number {
	const s = { ...COARSE_MAP_DEFAULTS, ...options };
	return s.seaDepth + (s.peaksLayer ? s.peakRelief : 0);
}
