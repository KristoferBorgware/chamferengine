/**
 * A packed cell address, as two unsigned 32-bit halves.
 *
 * The word `[planet][face][path][corner][layer]` reaches 64 bits at the
 * deepest subdivision level, well past the 53 bits a `number` represents
 * exactly. `low` holds bits 0 to 31 and `high` holds everything from bit 32
 * upward, both unsigned. Neither half is ever asked to hold more than 32 bits,
 * so both stay exact.
 */
export type CellId = readonly [high: number, low: number];
