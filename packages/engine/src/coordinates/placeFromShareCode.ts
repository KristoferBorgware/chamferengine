import type { CellFields } from "../addressing/id/CellFields.js";
import { decodeCell } from "../addressing/id/decodeCell.js";

/**
 * Base 36 to a `bigint`, digit by digit.
 *
 * `Number.parseInt` loses precision past 2^53, which a share code's word can
 * reach even with the planet field left off, so the digits are folded into a
 * `bigint` instead. `null` for anything that is not entirely base-36 digits,
 * the empty string included.
 */
function parseBase36(text: string): bigint | null {
	if (text.length === 0) return null;
	let value = 0n;
	for (const char of text) {
		const digit = Number.parseInt(char, 36);
		if (Number.isNaN(digit)) return null;
		value = value * 36n + BigInt(digit);
	}
	return value;
}

/** The cell a share code names. */
export function placeFromShareCode(
	code: string,
	depth: number,
): CellFields | null {
	const word = parseBase36(code.trim());
	if (word === null) return null;
	return decodeCell([Number(word >> 32n), Number(word & 0xffffffffn)], depth);
}
