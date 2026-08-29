/**
 * How many entries a chart holds along one axis, for a light carrying `range`
 * steps.
 *
 * `2 * range + 1` reaches every cell the light can, and the extra entry each
 * side is margin: a filtered read at the rim blends with its neighbours, and
 * without a lit cell's outward neighbour present the blend runs off the end of
 * the texture and takes the edge value instead.
 */
export function blockLightSide(range: number): number {
	return 2 * range + 3;
}
