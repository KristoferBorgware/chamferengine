import { describe, expect, it } from "vitest";
import type {
	MeshJob,
	MeshResult,
	MeshWorkerHandle,
	MeshWorkerSetup,
} from "chamfer/mesh";
import { WorkerMeshSource } from "chamfer/mesh";
import type { ChunkSelection } from "chamfer/generation";

const CHUNK_LEVEL = 2;
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
	crustDepth: 4,
	apron: true,
	terrain: {},
} satisfies MeshWorkerSetup;

class FakeWorker implements MeshWorkerHandle {
	onmessage: ((event: MessageEvent<MeshResult>) => void) | null = null;
	onerror: ((event: ErrorEvent) => void) | null = null;
	readonly jobs: MeshJob[] = [];
	postMessage(message: unknown): void {
		const typed = message as MeshWorkerSetup | MeshJob;
		if (typed.kind !== "setup") this.jobs.push(typed);
	}
	terminate(): void {}
	answer(): void {
		const job = this.jobs.shift()!;
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

const pick = (key: number): ChunkSelection => ({
	lod: 0,
	chunkLevel: CHUNK_LEVEL,
	key,
	distance: 100,
});

describe("a job's deltas are snapshotted at post time, but request dedupes on id", () => {
	it("re-requesting an in-flight chunk after an edit never re-posts it", async () => {
		const workers: FakeWorker[] = [];
		const source = new WorkerMeshSource(
			() => {
				const w = new FakeWorker();
				workers.push(w);
				return w;
			},
			1,
			SETUP,
		);
		// The store, as the client's `attachDeltas` closure sees it.
		let records: number[] = [];
		source.deltas = () => [
			{
				chunkKey: 0,
				where: new Uint32Array(records),
				what: new Uint16Array(records.length),
			},
		];

		// Frame 1: the chunk enters the selection and is posted with an empty
		// store -- exactly the window before `editDb.load` resolves.
		const first = source.request(pick(0));
		expect(workers[0]!.jobs.length).toBe(1);
		expect(workers[0]!.jobs[0]!.deltas![0]!.where.length).toBe(0);

		// The player breaks a block (or the saved store lands).
		records = [7, 8, 9];

		// planet.ts change(): drawn.delete(id); building.delete(id); refresh()
		// -> refresh re-requests the same selection.
		const second = source.request(pick(0));

		// NOTHING new was posted. The only job on the worker is still the one
		// carrying the empty store.
		expect(workers[0]!.jobs.length).toBe(1);
		expect(workers[0]!.jobs[0]!.deltas![0]!.where.length).toBe(0);

		workers[0]!.answer();
		await Promise.all([first, second]);

		// Both callers got the seed-only mesh, and the client now has the id
		// in `drawn`, so refresh() will never ask for it again.
		expect(workers[0]!.jobs.length).toBe(0);
	});

	it("the same happens after cancel(), which leaves an in-flight job pending", async () => {
		const workers: FakeWorker[] = [];
		const source = new WorkerMeshSource(
			() => {
				const w = new FakeWorker();
				workers.push(w);
				return w;
			},
			1,
			SETUP,
		);
		let records: number[] = [];
		source.deltas = () => [
			{
				chunkKey: 0,
				where: new Uint32Array(records),
				what: new Uint16Array(records.length),
			},
		];
		const first = source.request(pick(0));
		first.catch(() => undefined);
		source.cancel(pick(0)); // chunk left the selection while on a worker
		records = [1, 2, 3]; // the player edits it
		const second = source.request(pick(0)); // it comes back into view
		expect(workers[0]!.jobs.length).toBe(1);
		expect(workers[0]!.jobs[0]!.deltas![0]!.where.length).toBe(0);
		workers[0]!.answer();
		await second; // resolves, with the pre-edit mesh
	});
});
