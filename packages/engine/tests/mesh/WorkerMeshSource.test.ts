import { describe, expect, it } from "vitest";
import type {
	MeshJob,
	MeshResult,
	MeshRetune,
	MeshWorkerHandle,
	MeshWorkerSetup,
} from "chamfer/mesh";
import { WorkerMeshSource } from "chamfer/mesh";
import type { ChunkSelection } from "chamfer/generation";
import { selectionId } from "chamfer/generation";

const CHUNK_LEVEL = 2;
const LAYERS = 4;

const SETUP = {
	kind: "setup",
	map: {
		seed: 1,
		level: 2,
		faceIndex: new Int32Array(0),
		height: new Float32Array(0),
	},
	seaLevelRadius: 1700,
	subdivisionDepth: 5,
	maxElevation: 150,
	crustDepth: LAYERS,
	apron: true,
	terrain: {},
} satisfies MeshWorkerSetup;

/** One chunk to draw, at the finest level. */
function pick(key: number): ChunkSelection {
	return { lod: 0, chunkLevel: CHUNK_LEVEL, key, distance: 100 };
}

/**
 * A worker that answers when told to, so a test drives the pool's scheduling
 * rather than racing it.
 *
 * The pool never constructs a `Worker` itself — it is handed a factory, because
 * how a worker script is located belongs to the build. That is what lets this
 * run under plain Node.
 */
class FakeWorker implements MeshWorkerHandle {
	onmessage: ((event: MessageEvent<MeshResult>) => void) | null = null;
	onerror: ((event: ErrorEvent) => void) | null = null;
	readonly setups: MeshWorkerSetup[] = [];
	readonly retunes: MeshRetune[] = [];
	readonly jobs: MeshJob[] = [];
	terminated = false;

	postMessage(message: unknown): void {
		const typed = message as MeshWorkerSetup | MeshJob | MeshRetune;
		if (typed.kind === "setup") this.setups.push(typed);
		else if (typed.kind === "retune") this.retunes.push(typed);
		else this.jobs.push(typed);
	}

	terminate(): void {
		this.terminated = true;
	}

	/**
	 * Throw, the way a worker does when its script fails or it is killed.
	 *
	 * `ErrorEvent` is a browser global this test does not have, and `fail`
	 * never reads the event -- only that one arrived -- so a bare object
	 * stands in for it.
	 */
	die(): void {
		this.onerror?.({ message: "worker died" } as ErrorEvent);
	}

	/** Answer the oldest outstanding job. */
	answer(): void {
		const job = this.jobs.shift();
		if (!job) throw new Error("no job to answer");
		const geometry = () => ({
			vertices: new Float32Array(0),
			indices: new Uint32Array(0),
			cellCount: 0,
			triangleCount: 0,
		});
		this.onmessage?.(
			new MessageEvent<MeshResult>("message", {
				data: {
					id: job.id,
					key: job.key,
					chunkLevel: job.chunkLevel,
					lod: job.lod,
					origin: [0, 0, 1700],
					bound: {
						center: [0, 0, 1700],
						axes: [
							[0, 0, 1],
							[1, 0, 0],
							[0, 1, 0],
						],
						halves: [20, 20, 20],
					},
					opaque: geometry(),
					translucent: geometry(),
					tally: { cells: 0, faces: 0, merged: 0, apron: 0 },
				},
			}),
		);
	}
}

/** Swallow a rejection a test is not asserting on. */
function ignore<T>(promise: Promise<T>): Promise<T | undefined> {
	return promise.catch(() => undefined);
}

function pool(count: number) {
	const workers: FakeWorker[] = [];
	const source = new WorkerMeshSource(
		() => {
			const worker = new FakeWorker();
			workers.push(worker);
			return worker;
		},
		count,
		SETUP,
	);
	return { source, workers };
}

describe("WorkerMeshSource", () => {
	it("hands every worker the coarse map once, before any job", () => {
		const { source, workers } = pool(3);
		expect(source.workerCount).toBe(3);
		for (const worker of workers) {
			expect(worker.setups.length).toBe(1);
			expect(worker.jobs.length).toBe(0);
		}
		source.dispose();
	});

	it("spreads work across idle workers and queues the rest", () => {
		const { source, workers } = pool(2);
		// Every request gets a handler: dispose rejects what is outstanding, and
		// a promise nobody is listening to becomes an unhandled rejection.
		for (const key of [10, 11, 12, 13])
			void ignore(source.request(pick(key)));
		expect(workers[0]!.jobs.length).toBe(1);
		expect(workers[1]!.jobs.length).toBe(1);
		expect(source.queued).toBe(2);
		expect(source.running).toBe(2);
		source.dispose();
	});

	// **A job's identity is the chunk AND the store it was posted with.** The
	// rows are read as the job leaves, so a chunk already on a worker carries
	// the world as it was then. `request` treats a repeat as the same job and
	// chains onto the promise without posting anything, so a block broken while
	// its own chunk was in flight came back drawn from before the break -- and
	// the caller had already marked the chunk built, so nothing asked again.
	// The commonest case is a world opening: the first jobs go out against an
	// empty store while the save is still loading.
	it("rebuilds a chunk whose records changed while it was on a worker", async () => {
		const { source, workers } = pool(1);
		let rows: readonly {
			chunkKey: number;
			where: Uint32Array;
			what: Uint16Array;
		}[] = [];
		source.deltas = () => rows;

		const waiting = source.request(pick(7));
		expect(workers[0]!.jobs.length).toBe(1);
		expect(workers[0]!.jobs[0]!.deltas).toEqual([]);

		// The player breaks a block in this chunk while it is being built.
		rows = [
			{
				chunkKey: 7,
				where: new Uint32Array([1]),
				what: new Uint16Array([0]),
			},
		];
		source.invalidate(CHUNK_LEVEL, 7);

		// The stale result comes back and is put straight back on a worker,
		// rather than handed over as the answer.
		workers[0]!.answer();
		expect(workers[0]!.jobs.length).toBe(1);
		expect(workers[0]!.jobs[0]!.deltas).toEqual(rows);

		workers[0]!.answer();
		await expect(waiting).resolves.toBeTruthy();
		source.dispose();
	});

	it("leaves a job alone when nothing changed under it", async () => {
		const { source, workers } = pool(1);
		const waiting = source.request(pick(7));
		// Nothing is running for this other chunk, so there is nothing stale.
		source.invalidate(CHUNK_LEVEL, 9);
		workers[0]!.answer();
		await expect(waiting).resolves.toBeTruthy();
		expect(workers[0]!.jobs.length).toBe(0);
		source.dispose();
	});

	it("replaces a dead worker and retries its job on the replacement", async () => {
		// The leak this closes ran for the rest of a session: a job whose
		// worker died settled neither way, the caller held the chunk as
		// building forever and never asked again, and every retiring chunk
		// waiting on that ground kept drawing until the page was closed.
		const { source, workers } = pool(1);
		const waiting = source.request(pick(7));
		expect(workers[0]!.jobs.length).toBe(1);

		workers[0]!.die();
		expect(workers[0]!.terminated).toBe(true);
		expect(source.workerCount).toBe(1);
		expect(workers.length).toBe(2);
		expect(workers[1]!.jobs.length).toBe(1);

		workers[1]!.answer();
		const mesh = await waiting;
		expect(mesh.key).toBe(selectionId(CHUNK_LEVEL, 7));
		source.dispose();
	});

	it("rejects a job that kills its second worker too", async () => {
		// Such a job would kill every worker it is handed; the caller's next
		// selection can ask again if it still wants the chunk.
		const { source, workers } = pool(1);
		const waiting = source.request(pick(7));
		workers[0]!.die();
		workers[1]!.die();
		await expect(waiting).rejects.toThrow("mesh worker died");
		// The pool itself survives, on its second replacement.
		expect(source.workerCount).toBe(1);
		const again = source.request(pick(8));
		workers[2]!.answer();
		expect((await again).key).toBe(selectionId(CHUNK_LEVEL, 8));
		source.dispose();
	});

	it("replaces an idle worker that dies, keeping the pool's size", () => {
		const { source, workers } = pool(2);
		workers[0]!.die();
		expect(source.workerCount).toBe(2);
		expect(workers.length).toBe(3);
		expect(workers[2]!.setups.length).toBe(1);
		source.dispose();
	});

	it("resolves a request with the mesh the worker returned", async () => {
		const { source, workers } = pool(1);
		const waiting = source.request(pick(7));
		workers[0]!.answer();
		const mesh = await waiting;
		// A key names a triangle within its own level, so what comes back is
		// keyed by the level and the key together.
		expect(mesh.key).toBe(selectionId(CHUNK_LEVEL, 7));
		expect(mesh.origin.z).toBe(1700);
		source.dispose();
	});

	it("gives a freed worker the next queued chunk", async () => {
		const { source, workers } = pool(1);
		const first = source.request(pick(1));
		void ignore(source.request(pick(2)));
		expect(source.queued).toBe(1);

		workers[0]!.answer();
		await first;
		expect(source.queued).toBe(0);
		expect(workers[0]!.jobs.length).toBe(1);
		expect(workers[0]!.jobs[0]!.key).toBe(2);
		source.dispose();
	});

	it("asks for a chunk once when it is requested twice", async () => {
		const { source, workers } = pool(1);
		const a = source.request(pick(5));
		const b = source.request(pick(5));
		expect(workers[0]!.jobs.length).toBe(1);
		workers[0]!.answer();
		expect((await a).key).toBe(selectionId(CHUNK_LEVEL, 5));
		expect((await b).key).toBe(selectionId(CHUNK_LEVEL, 5));
		source.dispose();
	});

	it("drops a queued chunk that is cancelled", async () => {
		const { source, workers } = pool(1);
		void ignore(source.request(pick(1)));
		const doomed = source.request(pick(2));
		const rejected = doomed.catch((error: unknown) => error);
		source.cancel(pick(2));
		expect(source.queued).toBe(0);
		expect(await rejected).toBeInstanceOf(Error);
		workers[0]!.answer();
		source.dispose();
	});

	it("frees the worker when a chunk in flight is cancelled", async () => {
		// A chunk already being built runs to the end: stopping one needs a
		// message loop inside the generation, and it is nearly finished anyway.
		const { source, workers } = pool(1);
		void ignore(source.request(pick(3)));
		source.cancel(pick(3));
		workers[0]!.answer();
		const next = source.request(pick(4));
		workers[0]!.answer();
		expect((await next).key).toBe(selectionId(CHUNK_LEVEL, 4));
		source.dispose();
	});

	it("tells two levels of the same key apart", async () => {
		const { source, workers } = pool(2);
		const fine = source.request({
			lod: 0,
			chunkLevel: 6,
			key: 12,
			distance: 10,
		});
		const coarse = source.request({
			lod: 2,
			chunkLevel: 4,
			key: 12,
			distance: 900,
		});
		expect(workers[0]!.jobs.length).toBe(1);
		expect(workers[1]!.jobs.length).toBe(1);
		workers[0]!.answer();
		workers[1]!.answer();
		expect((await fine).key).not.toBe((await coarse).key);
		source.dispose();
	});

	describe("retune", () => {
		const SWITCHES = {
			kind: "retune",
			speckle: 0,
			ambientOcclusion: false,
			skyExposure: false,
			skyBounce: 0,
		} satisfies MeshRetune;

		it("tells every worker and posts no map", () => {
			const { source, workers } = pool(3);
			source.retune(SWITCHES);
			for (const worker of workers) {
				expect(worker.retunes).toEqual([SWITCHES]);
				// The map is what a setup is expensive for, and a retune is
				// the message for the knobs that leave it alone. One setup
				// each, from being spawned, and no second one.
				expect(worker.setups.length).toBe(1);
			}
			source.dispose();
		});

		it("throws away what was already on a worker and asks again", async () => {
			// A job on a worker was posted under the old switches, so its
			// colours are the ones the player has just turned off. And
			// `request` chains onto a job already in flight rather than
			// posting a second one -- so the caller asking again after the
			// retune gets handed exactly that stale mesh, and nothing ever
			// asks a third time. It is drawn with the old lighting for good.
			const { source, workers } = pool(1);
			const waiting = source.request(pick(7));
			expect(workers[0]!.jobs.length).toBe(1);

			source.retune(SWITCHES);
			// The worker answers the job it was already holding.
			workers[0]!.answer();
			await Promise.resolve();

			// Put back on the queue rather than handed over: the same chunk
			// is posted a second time, now that the worker has the switches.
			expect(workers[0]!.jobs.length).toBe(1);
			let settled = false;
			void waiting.then(() => (settled = true));
			await Promise.resolve();
			expect(settled).toBe(false);

			workers[0]!.answer();
			await waiting;
			source.dispose();
		});

		it("carries into a worker spawned to replace a dead one", async () => {
			const { source, workers } = pool(1);
			source.retune(SWITCHES);
			const waiting = source.request(pick(4));
			workers[0]!.die();
			// The replacement is told the setup the pool holds now. Told the
			// one it opened with, it would quietly build the requeued chunk
			// with the switches the player has just turned off -- and that
			// chunk is the one on screen.
			const spawned = workers[1]!;
			expect(spawned.setups.length).toBe(1);
			expect(spawned.setups[0]!.speckle).toBe(0);
			expect(spawned.setups[0]!.ambientOcclusion).toBe(false);
			expect(spawned.setups[0]!.skyExposure).toBe(false);
			// And the map came with it: a retune replaces three fields of the
			// setup and none of the rest.
			expect(spawned.setups[0]!.map).toBe(SETUP.map);
			spawned.answer();
			await waiting;
			source.dispose();
		});
	});

	it("rejects everything outstanding when disposed", async () => {
		const { source, workers } = pool(1);
		const waiting = source
			.request(pick(9))
			.catch((error: unknown) => error);
		source.dispose();
		expect(await waiting).toBeInstanceOf(Error);
		expect(workers[0]!.terminated).toBe(true);
		expect(source.workerCount).toBe(0);
	});
});
