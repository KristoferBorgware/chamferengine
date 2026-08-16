import type { Chunk } from "./Chunk.js";
import type { ChunkResult, ChunkWorkerSetup } from "./ChunkJob.js";
import type { ChunkSource } from "./ChunkSource.js";
import { ChunkAddress } from "./ChunkAddress.js";
import { Chunk as ChunkClass } from "./Chunk.js";

/** The part of a `Worker` this pool uses. */
export interface ChunkWorkerHandle {
	postMessage(message: unknown, transfer?: Transferable[]): void;
	terminate(): void;
	onmessage: ((event: { data: ChunkResult }) => void) | null;
}

interface Pending {
	readonly key: number;
	resolve(chunk: Chunk): void;
	reject(reason: Error): void;
}

/**
 * A pool of workers generating chunks off the main thread.
 *
 * The pool is handed a factory rather than constructing workers itself, because
 * how a worker script is located is a property of the build. A caller under
 * Vite passes `() => new Worker(new URL("./chunkWorker.ts", import.meta.url))`.
 *
 * Each worker receives the coarse map once, as five typed arrays. Rebuilding it
 * per worker would repeat seconds of work as many times as there are cores.
 *
 * A request the caller cancels is dropped when it comes back rather than
 * stopped: a chunk in flight is already most of the way through, and a worker
 * that can be interrupted mid-chunk needs a message loop inside the generation.
 */
export class WorkerChunkSource implements ChunkSource {
	private readonly workers: ChunkWorkerHandle[] = [];
	private readonly idle: ChunkWorkerHandle[] = [];
	private readonly queue: number[] = [];
	private readonly pending = new Map<number, Pending>();
	private readonly cancelled = new Set<number>();
	private readonly chunkLevel: number;
	private readonly layerCount: number;
	private readonly depth: number;
	private nextId = 1;

	constructor(
		create: () => ChunkWorkerHandle,
		count: number,
		setup: ChunkWorkerSetup,
	) {
		this.chunkLevel = setup.chunkLevel;
		this.layerCount = setup.crustDepth;
		this.depth = setup.subdivisionDepth;
		for (let n = 0; n < count; n++) {
			const worker = create();
			worker.onmessage = (event) => {
				this.finish(worker, event.data);
			};
			worker.postMessage(setup);
			this.workers.push(worker);
			this.idle.push(worker);
		}
	}

	get workerCount(): number {
		return this.workers.length;
	}

	get queued(): number {
		return this.queue.length;
	}

	request(key: number): Promise<Chunk> {
		this.cancelled.delete(key);
		const already = this.pending.get(key);
		if (already)
			return new Promise<Chunk>((resolve, reject) => {
				const first = already;
				this.pending.set(key, {
					key,
					resolve(chunk) {
						first.resolve(chunk);
						resolve(chunk);
					},
					reject(reason) {
						first.reject(reason);
						reject(reason);
					},
				});
			});

		return new Promise<Chunk>((resolve, reject) => {
			this.pending.set(key, { key, resolve, reject });
			this.queue.push(key);
			this.pump();
		});
	}

	cancel(key: number): void {
		if (this.pending.has(key)) this.cancelled.add(key);
		const at = this.queue.indexOf(key);
		if (at >= 0) {
			this.queue.splice(at, 1);
			this.pending.get(key)?.reject(new Error("chunk request cancelled"));
			this.pending.delete(key);
			this.cancelled.delete(key);
		}
	}

	dispose(): void {
		for (const worker of this.workers) worker.terminate();
		this.workers.length = 0;
		this.idle.length = 0;
		this.queue.length = 0;
		for (const waiting of this.pending.values())
			waiting.reject(new Error("chunk source disposed"));
		this.pending.clear();
	}

	private pump(): void {
		while (this.idle.length > 0 && this.queue.length > 0) {
			const worker = this.idle.pop()!;
			const key = this.queue.shift()!;
			worker.postMessage({ kind: "chunk", id: this.nextId++, key });
		}
	}

	private finish(worker: ChunkWorkerHandle, result: ChunkResult): void {
		this.idle.push(worker);
		const waiting = this.pending.get(result.key);
		this.pending.delete(result.key);
		if (waiting && !this.cancelled.has(result.key))
			waiting.resolve(
				new ChunkClass(
					ChunkAddress.fromKey(result.key, this.chunkLevel),
					this.depth,
					this.chunkLevel,
					this.layerCount,
					result.blocks,
					result.groundLayer,
				),
			);
		this.cancelled.delete(result.key);
		this.pump();
	}
}
