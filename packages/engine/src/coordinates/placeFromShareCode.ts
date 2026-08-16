import type { CellFields } from "../addressing/id/CellFields.js";
import { decodeCell } from "../addressing/id/decodeCell.js";

/** The cell a share code names. */
export function placeFromShareCode(
	code: string,
	depth: number,
): CellFields | null {
	const value = Number.parseInt(code.trim(), 36);
	if (!Number.isFinite(value) || value < 0) return null;
	return decodeCell(value, depth);
}
