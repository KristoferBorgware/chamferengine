/**
 * What the sea is made of, as linear red, green and blue.
 *
 * **Two colors, because water is not one color.** How much of a look the water
 * takes is what decides everything about it: a metre of it is nearly clear and
 * forty are not, so a shore is the floor seen through a tint and open water is
 * the water's own color and nothing else. `shallow` is what a look has barely
 * entered and `deep` is what it never leaves.
 *
 * Here rather than beside the renderer that draws the shell, because two places
 * draw this sea -- the world and the terrain bench's flat pictures -- and a
 * blue chosen twice is two blues.
 */
export const SEA_COLORS: {
	readonly shallow: readonly [number, number, number];
	readonly deep: readonly [number, number, number];
} = {
	shallow: [0.11, 0.5, 0.53],
	deep: [0.03, 0.17, 0.38],
};

/**
 * Metres of water a look passes through before it is all water.
 *
 * The shell in the world reads this off the distance to the eye, because a look
 * across the ocean travels through more of it than a look straight down. A
 * picture of a map is looked at from above, so it reads the depth instead --
 * the same question asked of the one dimension a map has.
 */
export const SEA_CLARITY = 45;
