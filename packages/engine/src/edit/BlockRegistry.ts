/**
 * The block type names a store carries, in the order their numbers were
 * assigned.
 *
 * A record holds a number and a number alone. The names sit beside it so that a
 * store opened by a later build can say what its own numbers meant, and so a
 * build whose list has been reordered is refused rather than reading somebody's
 * wall as dirt.
 *
 * Three rules. **Append only** — a new type takes the next number. **Never
 * reuse a slot** — a removed type leaves its name in place, so its number stays
 * dead. **The store's own list wins** — loading reads the numbers through the
 * list in the file, never through the build's.
 *
 * The names are not read while playing. The numbers do the work.
 */
export class BlockRegistry {
	private readonly names: string[];
	private readonly numbers = new Map<string, number>();

	constructor(names: readonly string[] = []) {
		this.names = [...names];
		this.names.forEach((name, at) => this.numbers.set(name, at));
	}

	get size(): number {
		return this.names.length;
	}

	/** The names in order, for writing into a store. */
	list(): readonly string[] {
		return this.names;
	}

	/** The number a name holds, adding it at the end when it is new. */
	numberOf(name: string): number {
		const already = this.numbers.get(name);
		if (already !== undefined) return already;
		const at = this.names.length;
		this.names.push(name);
		this.numbers.set(name, at);
		return at;
	}

	/** The name a number holds, or `undefined` where the list is shorter. */
	nameOf(number: number): string | undefined {
		return this.names[number];
	}

	/**
	 * Whether a stored list still means what this one means.
	 *
	 * A store may name fewer types than the build knows, which is an older store
	 * opened by a newer build and reads correctly. A store naming a type this
	 * build does not have, or naming one at a different number, does not.
	 */
	agreesWith(stored: readonly string[]): boolean {
		if (stored.length > this.names.length) return false;
		return stored.every((name, at) => this.names[at] === name);
	}
}
