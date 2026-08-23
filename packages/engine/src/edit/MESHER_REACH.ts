/**
 * How many cells past its own triangle a chunk's mesher reads.
 *
 * **Two, not one.** A chunk's rim cells ask the ring around them whether to
 * draw a side face -- one step. Its apron then draws that ring outright, and
 * an apron cell asks *its* own ring for the band to walk, the corner occlusion
 * and the sky exposure -- which is a second step, two cells past the triangle.
 *
 * Routing an edit one step reached the apron cells themselves and not the
 * cells they read, so a share of every chunk's samples answered from the seed
 * however far a player dug: measured at depth 8 cut at chunk level 4, a chunk
 * samples about 254 distinct columns and 41.6 of them -- **16.3%** -- were
 * cells no edit was ever routed to.
 *
 * This is the one number the store's routing and the mesher's appetite have to
 * agree on, so it is written once and read by both rather than spelled out at
 * either end.
 */
export const MESHER_REACH = 2;
