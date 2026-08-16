/**
 * Reduce a seed a player typed to the `uint32` the noise hash takes.
 *
 * A string is what makes a world shareable in a URL; a `uint32` is what keeps
 * the arithmetic integer-only, which is what two clients agreeing on a planet
 * depends on. This is the one place the two meet.
 *
 * The accumulation is FNV-1a and the last three steps are the noise hash's own
 * finaliser, so a one-character change moves about half the output bits rather
 * than a few of them. Without that, "world1" and "world2" would start on
 * near-identical planets.
 */
export function seedFromString(text: string): number {
	let h = 2166136261 >>> 0;
	for (let i = 0; i < text.length; i++) {
		h = (h ^ text.charCodeAt(i)) >>> 0;
		h = Math.imul(h, 16777619) >>> 0;
	}
	h = (h ^ (h >>> 13)) >>> 0;
	h = Math.imul(h, 1274126177) >>> 0;
	return (h ^ (h >>> 16)) >>> 0;
}
