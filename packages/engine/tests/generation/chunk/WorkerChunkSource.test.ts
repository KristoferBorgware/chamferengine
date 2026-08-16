import { describe, expect, it } from "vitest";
import type {
	ChunkJob,
	ChunkResult,
	ChunkWorkerHandle,
	ChunkWorkerSetup,
} from "chamfer/generation";
import { WorkerChunkSource } from "chamfer/generation";

const CHUNK_LEVEL = 2;
const LAYERS = 4;

const SETUP = {
	kind: "setup",
	map: {
		seed: 1,
		level: 2,
		seaLevel: 0,
		faceIndex: new Int32Array(0),
		height: new Float32Array(0),
		water: new Float32Array(0),
		flow: new Float32Array(0),
		slope: new Float32Array(0),
	},
	seaLevelRadius: 1700,
	subdivisionDepth: 5,
	maxElevation: 150,
	crustDepth: LAYERS,
	chunkLevel: CHUNK_LEVEL,
	terrain: {},
} satisfies ChunkWorkerSetup;

/**
 * A worker that answers when told to, so a test drives the pool's scheduling
 * rather than racing it.
 *
 * The pool never constructs a `Worker` itself — it is handed a factory, because
 * how a worker script is located belongs to the build. That is what lets this
 * run under plain Node.
 */
class FakeWorker implements ChunkWorkerHandle {
	onmessage: ((event: { data: ChunkResult }) => void) | null = null;
	readonly setups: ChunkWorkerSetup[] = [];
	readonly jobs: ChunkJob[] = [];
	terminated = false;

	postMessage(message: unknown): void {
		const typed = message as ChunkWorkerSetup | ChunkJob;
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
		this.onmessage?.({
			data: {
				id: job.id,
				key: job.key,
				blocks: new Uint16Array(4),
				groundLayer: new Uint16Array(1),
			},
		});
	}
}

/** Swallow a rejection a test is not asserting on. */
function ignore<T>(promise: Promise<T>): Promise<T | undefined> {
	return promise.catch(() => undefined);
}

function pool(count: number) {
	const workers: FakeWorker[] = [];
	const source = new WorkerChunkSource(
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

describe("WorkerChunkSource", () => {
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
		for (const key of [10, 11, 12, 13]) void ignore(source.request(key));
		expect(workers[0]!.jobs.length).toBe(1);
		expect(workers[1]!.jobs.length).toBe(1);
		expect(source.queued).toBe(2);
		source.dispose();
	});

	it("resolves a request with the chunk the worker returned", async () => {
		const { source, workers } = pool(1);
		const waiting = source.request(7);
		workers[0]!.answer();
		const chunk = await waiting;
		expect(chunk.address.key).toBe(7);
		expect(chunk.chunkLevel).toBe(CHUNK_LEVEL);
		expect(chunk.layerCount).toBe(LAYERS);
		source.dispose();
	});

	it("gives a freed worker the next queued chunk", async () => {
		const { source, workers } = pool(1);
		const first = source.request(1);
		void ignore(source.request(2));
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
		const a = source.request(5);
		const b = source.request(5);
		expect(workers[0]!.jobs.length).toBe(1);
		workers[0]!.answer();
		expect((await a).address.key).toBe(5);
		expect((await b).address.key).toBe(5);
		source.dispose();
	});

	it("drops a queued chunk that is cancelled", async () => {
		const { source, workers } = pool(1);
		void ignore(source.request(1));
		const doomed = source.request(2);
		const rejected = doomed.catch((error: unknown) => error);
		source.cancel(2);
		expect(source.queued).toBe(0);
		expect(await rejected).toBeInstanceOf(Error);
		workers[0]!.answer();
		source.dispose();
	});

	it("frees the worker when a chunk in flight is cancelled", async () => {
		// A chunk already being generated runs to the end: stopping one needs a
		// message loop inside the generation, and it is nearly finished anyway.
		const { source, workers } = pool(1);
		void ignore(source.request(3));
		source.cancel(3);
		workers[0]!.answer();
		const next = source.request(4);
		workers[0]!.answer();
		expect((await next).address.key).toBe(4);
		source.dispose();
	});

	it("rejects everything outstanding when disposed", async () => {
		const { source, workers } = pool(1);
		const waiting = source.request(9).catch((error: unknown) => error);
		source.dispose();
		expect(await waiting).toBeInstanceOf(Error);
		expect(workers[0]!.terminated).toBe(true);
		expect(source.workerCount).toBe(0);
	});
});
