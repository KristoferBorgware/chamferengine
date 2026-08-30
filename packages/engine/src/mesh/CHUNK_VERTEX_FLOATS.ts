/**
 * Floats a chunk vertex holds: a position, a color, how much sky the cell
 * stands under, where it reads its picture, and the two pictures it reads
 * there -- the block's own and the band lying over it.
 *
 * **The sky term is its own number rather than a factor in the color.** Light
 * from the sun, the sky and the moon is all reduced by how much sky a cell can
 * see, and light from a source standing in the world is not -- a lamp in a
 * cave owes nothing to the sky over the hill above it. A shader cannot divide
 * a number back out of a color it was handed, so the two arrive apart.
 *
 * **The overlay is a second index rather than a second uv.** A ground block is
 * two materials seen at once -- the dirt a column is made of and the grass,
 * snow or ash lying on top of it -- and one picture cannot be half of each. It
 * reads at the same place as the first, so it costs an index and no
 * coordinate.
 */
export const CHUNK_VERTEX_FLOATS = 11;
