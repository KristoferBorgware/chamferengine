import type { ChunkMesh } from "../ChunkMesh.js";
import type { ChunkSelection } from "../../generation/chunk/selectChunks.js";
import type { JobDeltas, MeshResult, MeshWorkerSetup } from "./MeshJob.js";
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

	/**
	 * Fired when the worker throws or dies. A real `Worker` has it; a fake
	 * may leave it unset. The pool sets it, because a job whose worker
	 * vanished without it would wait forever -- and everything the caller
	 * holds open against that job would wait with it.
	 *
	 * Typed to match `Worker.onerror` exactly, which is what lets a real
	 * `Worker` satisfy this interface with no cast at the call site.
	 */
	onerror?: ((event: ErrorEvent) => void) | null;
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
	private readonly create: () => MeshWorkerHandle;
	private readonly setup: MeshWorkerSetup;

	/**
	 * What a player has changed that a chunk reads, asked for as each job is
	 * posted.
	 *
	 * One entry per chunk the records were written under -- the chunk's own,
	 * and those owning cells inside its triangle. The pool never holds a store:
	 * it asks whoever owns one, at the moment the job leaves, so a chunk asked
	 * for again after a click carries the click. Left unset, chunks are built
	 * from the seed alone.
	 */
	deltas: ((chunkKey: number) => readonly JobDeltas[]) | null = null;

	/**
	 * How far each waiting chunk now is, by selection id.
	 *
	 * A queued chunk's own `distance` is how far it was when it was asked
	 * for, and the player has been moving since. {@link reprioritize} refills
	 * this from the current selection, so the ground underfoot is built next
	 * even when it was asked for last.
	 */
	private readonly nearness = new Map<number, number>();

	/**
	 * Whether a freed worker takes the nearest waiting chunk or the oldest.
	 *
	 * Nearest is what a player experiences as the world filling in around
	 * them. Oldest is the order the requests arrived in, which is the order a
	 * plain queue gives and is kept so the two can be compared.
	 */
	nearestFirst = true;

	/** What each busy worker is building, so its death names a job. */
	private readonly working = new Map<MeshWorkerHandle, ChunkSelection>();

	/** Jobs already given a second worker. A third failure is answered. */
	private readonly retried = new Set<number>();

	/** How many workers have died, capping how many are replaced. */
	private failures = 0;

	private nextId = 1;

	constructor(
		create: () => MeshWorkerHandle,
		count: number,
		setup: MeshWorkerSetup,
	) {
		this.create = create;
		this.setup = setup;
		for (let n = 0; n < count; n++) this.spawn();
	}

	/** Make one worker, wired so its death is a handled event. */
	private spawn(): void {
		const worker = this.create();
		worker.onmessage = (event) => {
			this.finish(worker, event.data);
		};
		worker.onerror = () => {
			this.fail(worker);
		};
		worker.postMessage(this.setup);
		this.workers.push(worker);
		this.idle.push(worker);
	}

	/**
	 * A worker threw or was killed.
	 *
	 * Without this, three things leaked for the rest of the session: the
	 * job's promise never settled, so the caller held the chunk as building
	 * forever and never asked again; the worker never came back to the idle
	 * list, so the pool lost a lane; and everything drawn while waiting for
	 * that chunk -- a retiring chunk keeps drawing until its replacements
	 * arrive -- stayed on screen for good.
	 *
	 * The worker is replaced and its job requeued once. A job that kills a
	 * second worker is rejected instead: it would kill every worker it is
	 * given, and the caller's next selection can ask again. Replacement stops
	 * after enough deaths to say the workers themselves are broken -- a pool
	 * respawning a worker whose script cannot run would spin forever.
	 */
	private fail(worker: MeshWorkerHandle): void {
		const job = this.working.get(worker);
		this.working.delete(worker);
		worker.terminate();
		const at = this.workers.indexOf(worker);
		if (at >= 0) this.workers.splice(at, 1);
		const rest = this.idle.indexOf(worker);
		if (rest >= 0) this.idle.splice(rest, 1);

		this.failures++;
		if (this.failures <= 32) this.spawn();

		if (job) {
			const id = selectionId(job.chunkLevel, job.key);
			if (this.pending.has(id) && !this.retried.has(id)) {
				this.retried.add(id);
				this.queue.push(job);
			} else {
				this.pending.get(id)?.reject(new Error("mesh worker died"));
				this.pending.delete(id);
				this.cancelled.delete(id);
				this.retried.delete(id);
			}
		}
		this.pump();
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
		this.working.clear();
		this.retried.clear();
		for (const waiting of this.pending.values())
			waiting.reject(new Error("mesh source disposed"));
		this.pending.clear();
	}

	/**
	 * Tell the pool how far away every chunk it is holding now is.
	 *
	 * The queue outlives a selection: a chunk asked for while it was on the
	 * horizon is still waiting when the player has walked up to it, and a
	 * plain queue would build it behind everything asked for since. Handing
	 * the current selection back here is what lets a freed worker take the
	 * nearest chunk rather than the oldest one.
	 */
	reprioritize(selections: readonly ChunkSelection[]): void {
		this.nearness.clear();
		for (const selection of selections)
			this.nearness.set(
				selectionId(selection.chunkLevel, selection.key),
				selection.distance,
			);
	}

	/** How far a waiting chunk is, as of the last selection. */
	private awayFrom(selection: ChunkSelection): number {
		const id = selectionId(selection.chunkLevel, selection.key);
		return this.nearness.get(id) ?? selection.distance;
	}

	/** Where the nearest waiting chunk sits in the queue. */
	private nearest(): number {
		let at = 0;
		let closest = Infinity;
		for (let n = 0; n < this.queue.length; n++) {
			const away = this.awayFrom(this.queue[n]!);
			if (away < closest) {
				closest = away;
				at = n;
			}
		}
		return at;
	}

	private pump(): void {
		while (this.idle.length > 0 && this.queue.length > 0) {
			const worker = this.idle.pop()!;
			const selection = this.nearestFirst
				? this.queue.splice(this.nearest(), 1)[0]!
				: this.queue.shift()!;
			this.working.set(worker, selection);
			worker.postMessage({
				kind: "chunk",
				id: this.nextId++,
				key: selection.key,
				chunkLevel: selection.chunkLevel,
				lod: selection.lod,
				deltas: this.deltas?.(selection.key),
			});
		}
	}

	private finish(worker: MeshWorkerHandle, result: MeshResult): void {
		this.idle.push(worker);
		this.working.delete(worker);
		const id = selectionId(result.chunkLevel, result.key);
		this.retried.delete(id);
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
