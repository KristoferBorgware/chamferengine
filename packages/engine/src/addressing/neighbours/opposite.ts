/** The opposite of a direction index. */
export function opposite(k: number): number {
	return (k + 3) % 6;
}
