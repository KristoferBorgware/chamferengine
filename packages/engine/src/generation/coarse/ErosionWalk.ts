/**
 * How a droplet moves over the map.
 *
 * `cell` steps from one cell to the steepest of the six around it, which is a
 * choice between six fixed directions: on ground whose gradient is gentle and
 * smooth the same one keeps winning, and the walk marches along one axis of the
 * lattice. Measured on the shipped map, 18.3% of its steps are part of a run of
 * eight or more in one unchanged direction, against 1.4% for the other.
 *
 * `free` carries a position between cells and a direction it does not throw
 * away, reads the ground as the blend of the three lattice points around it,
 * and spreads each cut over those same three. A droplet standing on exactly one
 * cell can only cut a spike into it, and a pass built out of spikes adds
 * high-frequency roughness: `cell` takes the median hillslope up `1.40x` at
 * full strength where `free` takes it up `1.11x`.
 */
export type ErosionWalk = "cell" | "free";

export const EROSION_WALKS: readonly ErosionWalk[] = ["cell", "free"] as const;
