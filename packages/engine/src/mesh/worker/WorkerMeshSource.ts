import type { ChunkMesh } from "../ChunkMesh.js";
import type { ChunkSelection } from "../../generation/chunk/selectChunks.js";
import type { MeshResult, MeshWorkerSetup } from "./MeshJob.js";
import type { MeshSource } from "./MeshSource.js";
import { Vec3 } from "../../math/Vec3.js";
import { selectionId } from "../../generation/chunk/selectionId.js";

/**
 * The part of a `Worker` this pool uses.
 *
 * Written so a real `Worker` satisfies it as it stands, which is what keeps the
 * caller free of a cast: the pool is handed a factory and never learns what
 * kind of thing came back.
 */
export interface MeshWorkerHandle {
	postMessage(message: unknown, transfer?: Transferable[]): void;
	terminate(): void;
	onmessage: ((event: MessageEvent<MeshResult>) => void) | null;
}

interface Pending {
	resolve(mesh: ChunkMesh): void;
	reject(reason: Error): void;
}

/**
 * A pool of workers building chunk meshes off the thread that draws.
 *
 * The pool is handed a factory rather than constructing workers itself, because
 * how a worker script is located is a property of the build. A caller under
 * Vite passes `() => new Worker(new URL("./chunkWorker.ts", import.meta.url))`.
 *
 * A request the caller cancels is dropped when it comes back rather than
 * stopped: a chunk in flight is already most of the way through, and a worker
 * that can be interrupted mid-chunk needs a message loop inside the generation.
 */
export class WorkerMeshSource implements MeshSource {
	private readonly workers: MeshWorkerHandle[] = [];
	private readonly idle: MeshWorkerHandle[] = [];
	private readonly queue: ChunkSelection[] = [];
	private readonly pending = new Map<number, Pending>();
	private readonly cancelled = new Set<number>();
	private nextId = 1;

	constructor(
		create: () => MeshWorkerHandle,
		count: number,
		setup: MeshWorkerSetup,
	) {
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

	/** How many chunks a worker is part way through. */
	get running(): number {
		return this.workers.length - this.idle.length;
	}

	request(selection: ChunkSelection): Promise<ChunkMesh> {
		const id = selectionId(selection.chunkLevel, selection.key);
		this.cancelled.delete(id);
		const already = this.pending.get(id);
		if (already)
			return new Promise<ChunkMesh>((resolve, reject) => {
				const first = already;
				this.pending.set(id, {
					resolve(mesh) {
						first.resolve(mesh);
						resolve(mesh);
					},
					reject(reason) {
						first.reject(reason);
						reject(reason);
					},
				});
			});

		return new Promise<ChunkMesh>((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
			this.queue.push(selection);
			this.pump();
		});
	}

	cancel(selection: ChunkSelection): void {
		const id = selectionId(selection.chunkLevel, selection.key);
		if (this.pending.has(id)) this.cancelled.add(id);
		const at = this.queue.findIndex(
			(waiting) => selectionId(waiting.chunkLevel, waiting.key) === id,
		);
		if (at >= 0) {
			this.queue.splice(at, 1);
			this.pending.get(id)?.reject(new Error("mesh request cancelled"));
			this.pending.delete(id);
			this.cancelled.delete(id);
		}
	}

	dispose(): void {
		for (const worker of this.workers) worker.terminate();
		this.workers.length = 0;
		this.idle.length = 0;
		this.queue.length = 0;
		for (const waiting of this.pending.values())
			waiting.reject(new Error("mesh source disposed"));
		this.pending.clear();
	}

	private pump(): void {
		while (this.idle.length > 0 && this.queue.length > 0) {
			const worker = this.idle.pop()!;
			const selection = this.queue.shift()!;
			worker.postMessage({
				kind: "chunk",
				id: this.nextId++,
				key: selection.key,
				chunkLevel: selection.chunkLevel,
				lod: selection.lod,
			});
		}
	}

	private finish(worker: MeshWorkerHandle, result: MeshResult): void {
		this.idle.push(worker);
		const id = selectionId(result.chunkLevel, result.key);
		const waiting = this.pending.get(id);
		this.pending.delete(id);
		if (waiting && !this.cancelled.has(id))
			waiting.resolve({
				key: id,
				origin: new Vec3(...result.origin),
				center: result.center,
				radius: result.radius,
				opaque: result.opaque,
				translucent: result.translucent,
				tally: result.tally,
			});
		this.cancelled.delete(id);
		this.pump();
	}
}
