/**
 * What a block is, as the sixteen bits an edit record carries.
 *
 * Twelve bits of type and four of rotation: 4,096 types, 16 variants of each.
 * Rotation is a field rather than part of one flat index so that reading a
 * neighbour's facing is a mask, which is the one block-state read that happens
 * per block per frame.
 */
export const TYPE_BITS = 12;
export const ROTATION_BITS = 4;

export const TYPE_MASK = (1 << TYPE_BITS) - 1;
export const ROTATION_MASK = (1 << ROTATION_BITS) - 1;

/** How many types the field names, and how many variants each type has. */
export const TYPE_COUNT = 1 << TYPE_BITS;
export const ROTATION_COUNT = 1 << ROTATION_BITS;

/** A packed block state: `[rotation 4][type 12]`. */
export type BlockState = number;
