/**
 * Floats a chunk vertex holds: a position, a color, and how much sky the cell
 * stands under.
 *
 * **The sky term is its own number rather than a factor in the color.** Light
 * from the sun, the sky and the moon is all reduced by how much sky a cell can
 * see, and light from a source standing in the world is not -- a lamp in a
 * cave owes nothing to the sky over the hill above it. A shader cannot divide
 * a number back out of a color it was handed, so the two arrive apart.
 */
export const CHUNK_VERTEX_FLOATS = 7;
