/**
 * Which slot to take back when a picture is wanted and none are free.
 *
 * **A slot holding a picture something is drawing must never be taken.** Losing
 * one turns a textured block flat while somebody is looking at it, which is a
 * worse failure than the crowding it is trying to relieve -- so the caller
 * passes the pictures currently on screen and they are simply not candidates.
 * Anything left is by definition drawn by nothing, and taking it back costs a
 * picture nobody can see.
 *
 * Among those, the one named longest ago. That is what stops a player walking
 * a boundary from evicting and re-admitting the same picture every few
 * seconds: the pictures behind them go before the pictures beside them.
 *
 * Returns `-1` when every slot holds something on screen, which is a pool
 * genuinely too small for one view. Then the new picture draws as its own
 * average colour, which is the same answer as before there was any eviction.
 */
export function slotToReuse(
	/** When each slot's picture was last asked for, by slot. */
	usedAt: readonly number[],
	/** Which picture each slot holds, by slot. */
	pictureAt: readonly number[],
	/** Pictures something is drawing, which are not candidates. */
	keep: ReadonlySet<number>,
): number {
	let oldest = -1;
	let when = Number.POSITIVE_INFINITY;
	for (let slot = 0; slot < pictureAt.length; slot++) {
		const picture = pictureAt[slot];
		if (picture === undefined || keep.has(picture)) continue;
		const at = usedAt[slot] ?? 0;
		if (at < when) {
			when = at;
			oldest = slot;
		}
	}
	return oldest;
}
