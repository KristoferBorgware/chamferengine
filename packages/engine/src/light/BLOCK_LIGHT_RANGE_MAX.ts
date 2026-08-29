/**
 * The most steps a light may carry.
 *
 * A hexagonal disc of radius `r` holds `3r^2 + 3r + 1` cells and the fill runs
 * in three dimensions, so the work grows as the cube of this: 16 steps reach
 * 7,471 cells where 8 reach 1,241. The chart the fill writes is
 * `(2 * 16 + 3)^3` bytes, 42,875, whatever range is actually in use.
 */
export const BLOCK_LIGHT_RANGE_MAX = 16;
