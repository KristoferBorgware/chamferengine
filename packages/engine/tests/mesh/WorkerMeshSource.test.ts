import { describe, expect, it } from "vitest";
import type {
	MeshJob,
	MeshResult,
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
	readonly setups: MeshWorkerSetup[] = [];
	readonly jobs: MeshJob[] = [];
	terminated = false;

	postMessage(message: unknown): void {
		const typed = message as MeshWorkerSetup | MeshJob;
		if (typed.kind === "setup") this.setups.push(typed);
		else this.jobs.push(typed);
	}

	terminate(): void {
		this.terminated = true;
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
					center: [0, 0, 1700],
					radius: 20,
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
