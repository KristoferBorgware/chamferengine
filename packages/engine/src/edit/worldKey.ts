/**
 * A name for the world a set of edits belongs to.
 *
 * Every number that decides where a cell is or what block sits there goes in.
 * A world with a different shape is a different name and a different set of
 * rows, so a block placed in one never turns up in another.
 *
 * **The chunk level stays out.** It decides how the address is cut for loading
 * and drawing, and moves no block — a world at 8 cells a chunk and the same
 * world at 64 hold the same ground in the same places, so dragging that knob
 * keeps the world it was dragged in and re-cuts the rows instead.
 *
 * Derived rather than remembered, so setting the knobs back reaches the earlier
 * rows again. Numbers are written at full precision: two worlds a millimetre
 * apart are two worlds.
 */
export function worldKey(
	shape: Readonly<Record<string, number | string>>,
): string {
	return Object.keys(shape)
		.sort()
		.map((name) => `${name}=${shape[name]}`)
		.join("&");
}
