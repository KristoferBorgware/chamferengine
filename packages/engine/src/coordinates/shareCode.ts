import type { CellFields } from "../addressing/id/CellFields.js";
import { LAYER_BITS } from "../addressing/id/cellIdLayout.js";
import { encodeCell } from "../addressing/id/encodeCell.js";

/**
 * A place, short enough to read out loud.
 *
 * The address and the layer, in base 36. At depth 11 that is 29 bits of address
 * and 10 of layer, 39 together, which eight characters hold. The planet field
 * is left off: there is one planet, and adding it takes the code to ten.
 *
 * A code names a **cell**, not a position, so two players reading the same code
 * stand in the same block rather than near each other.
 */
export function shareCode(fields: CellFields, depth: number): string {
	const [high, low] = encodeCell({ ...fields, planet: 0 }, depth);
	const word = (BigInt(high >>> 0) << 32n) | BigInt(low >>> 0);
	return word.toString(36).toUpperCase().padStart(8, "0");
}

/** How many characters a code takes at a subdivision depth. */
export function shareCodeLength(depth: number, withPlanet = false): number {
	const bits = 5 + 2 * depth + 2 + LAYER_BITS + (withPlanet ? 12 : 0);
	return Math.ceil(bits / Math.log2(36));
}
