import type { Chunk } from "./Chunk.js";

/**
 * The chunks held in memory, under a byte budget.
 *
 * Reading a chunk marks it as the most recently used, and a store over budget
 * drops the least recently used until it is back under. A chunk is 488 KB at
 * 435 layers, so a budget in the hundreds of megabytes holds a few hundred.
 *
 * The insertion order of a `Map` is the eviction order, so the least recently
 * used chunk is the first key and a read is a delete and a set.
 */
export class ChunkStore {
	readonly byteBudget: number;

	private readonly chunks = new Map<number, Chunk>();
	private bytes = 0;

	constructor(byteBudget: number) {
		this.byteBudget = byteBudget;
	}

	get size(): number {
		return this.chunks.size;
	}

	get byteLength(): number {
		return this.bytes;
	}

	has(key: number): boolean {
		return this.chunks.has(key);
	}

	/** Read a chunk and mark it as the most recently used. */
	get(key: number): Chunk | undefined {
		const chunk = this.chunks.get(key);
		if (chunk === undefined) return undefined;
		this.chunks.delete(key);
		this.chunks.set(key, chunk);
		return chunk;
	}

	/** Read a chunk without marking it. */
	peek(key: number): Chunk | undefined {
		return this.chunks.get(key);
	}

	/** Hold a chunk, dropping the least recently used until under budget. */
	set(key: number, chunk: Chunk): void {
		const existing = this.chunks.get(key);
		if (existing) this.bytes -= existing.byteLength;
		this.chunks.delete(key);
		this.chunks.set(key, chunk);
		this.bytes += chunk.byteLength;
		this.evict();
	}

	/** Drop a chunk. */
	delete(key: number): boolean {
		const chunk = this.chunks.get(key);
		if (!chunk) return false;
		this.bytes -= chunk.byteLength;
		return this.chunks.delete(key);
	}

	/** The keys held, least recently used first. */
	keys(): number[] {
		return [...this.chunks.keys()];
	}

	private evict(): void {
		// The last chunk stays whatever the budget says: a store holding nothing
		// cannot answer a request, and a budget under one chunk is a
		// misconfiguration rather than an instruction to hold none.
		while (this.bytes > this.byteBudget && this.chunks.size > 1) {
			const oldest = this.chunks.keys().next().value;
			if (oldest === undefined) return;
			this.delete(oldest);
		}
	}
}
