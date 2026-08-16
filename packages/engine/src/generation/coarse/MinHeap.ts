/**
 * A binary min-heap over `(key, value)` pairs, both held in typed arrays.
 *
 * Pit filling visits every land cell in order of the level the water reaches
 * it at, which is a priority queue over hundreds of thousands of entries.
 *
 * Equal keys come out in whatever order the sift decides. That order is fixed
 * by the sequence of pushes and pops rather than by anything outside, so two
 * machines running the same sequence agree.
 */
export class MinHeap {
	private keys: Float64Array;
	private values: Int32Array;
	private length = 0;

	constructor(capacity = 1024) {
		this.keys = new Float64Array(capacity);
		this.values = new Int32Array(capacity);
	}

	get size(): number {
		return this.length;
	}

	push(key: number, value: number): void {
		if (this.length === this.keys.length) this.grow();
		let at = this.length++;
		this.keys[at] = key;
		this.values[at] = value;
		while (at > 0) {
			const parent = (at - 1) >> 1;
			if (this.keys[parent]! <= this.keys[at]!) break;
			this.swap(parent, at);
			at = parent;
		}
	}

	/** The smallest key's value. The caller reads `size` first. */
	pop(): number {
		const top = this.values[0]!;
		const last = --this.length;
		this.keys[0] = this.keys[last]!;
		this.values[0] = this.values[last]!;
		let at = 0;
		for (;;) {
			const left = 2 * at + 1;
			const right = left + 1;
			let small = at;
			if (left < this.length && this.keys[left]! < this.keys[small]!)
				small = left;
			if (right < this.length && this.keys[right]! < this.keys[small]!)
				small = right;
			if (small === at) break;
			this.swap(small, at);
			at = small;
		}
		return top;
	}

	private swap(a: number, b: number): void {
		const key = this.keys[a]!;
		this.keys[a] = this.keys[b]!;
		this.keys[b] = key;
		const value = this.values[a]!;
		this.values[a] = this.values[b]!;
		this.values[b] = value;
	}

	private grow(): void {
		const keys = new Float64Array(this.keys.length * 2);
		keys.set(this.keys);
		this.keys = keys;
		const values = new Int32Array(this.values.length * 2);
		values.set(this.values);
		this.values = values;
	}
}
