/**
 * The row a bench says what it is doing in, whether or not it has anything
 * to say.
 *
 * **A row that comes and goes moves everything under it.** Each bench used
 * to write this line only while a build was running, so every drag of a
 * slider inserted a line at the top of the panel and took it out again when
 * the build landed -- the map, the facts and every row below them stepping
 * down and back up under the cursor of the person reading them.
 *
 * The row is always here. Quiet, it is hidden rather than dropped, and it
 * carries one blank line's worth of space: an element with no text has no
 * line box and no height at all, which is the same jump by another route.
 */
export function busyLine(says: string): string {
	const quiet = says === "" ? " bench-quiet" : "";
	return `<p class="bench-busy${quiet}">${says === "" ? "&nbsp;" : says}</p>`;
}
