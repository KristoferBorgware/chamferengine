import { describe, expect, it } from "vitest";
import type {
	CloudJob,
	CloudResult,
	CloudWorkerHandle,
	CloudWorkerSetup,
} from "chamfer/sky";
import { WorkerCloudSource } from "chamfer/sky";
import { Vec3 } from "chamfer/math";

const SETUP = {
	kind: "setup",
	seed: 1,
	decks: [
		{
			level: 2,
			shells: 2,
			baseRadius: 1900,
			shellSpan: 15,
			featureSize: 50,
		},
	],
} satisfies CloudWorkerSetup;

const AXIS = new Vec3(0, 1, 0);

/**
 * A worker that answers when told to, so a test drives the source's
 * scheduling rather than racing it.
 */
class FakeWorker implements CloudWorkerHandle {
	onmessage: ((event: MessageEvent<CloudResult>) => void) | null = null;
	readonly setups: CloudWorkerSetup[] = [];
	readonly jobs: CloudJob[] = [];
	terminated = false;

	postMessage(message: unknown): void {
		const typed = message as CloudWorkerSetup | CloudJob;
		if (typed.kind === "setup") this.setups.push(typed);
		else this.jobs.push(typed);
	}

	terminate(): void {
		this.terminated = true;
	}

	/** Answer the oldest outstanding job. */
	answer(puffs = 3): void {
		const job = this.jobs.shift();
		if (!job) throw new Error("no job to answer");
		this.onmessage?.(
			new MessageEvent<CloudResult>("message", {
				data: {
					id: job.id,
					vertices: new Float32Array(0),
					indices: new Uint32Array(0),
					puffs,
				},
			}),
		);
	}
}

function source() {
	const worker = new FakeWorker();
	const built = new WorkerCloudSource(() => worker, SETUP);
	return { built, worker };
}

describe("WorkerCloudSource", () => {
	it("hands the worker its setup once, before any job", () => {
		const { worker } = source();
		expect(worker.setups.length).toBe(1);
		expect(worker.jobs.length).toBe(0);
	});

	it("resolves a request with what the worker answers", async () => {
		const { built, worker } = source();
		const pending = built.request(AXIS, 0.5);
		expect(worker.jobs.length).toBe(1);
		expect(worker.jobs[0]!.angle).toBe(0.5);
		worker.answer(7);
		const mesh = await pending;
		expect(mesh.puffs).toBe(7);
	});

	it("is busy from the request until the worker answers", async () => {
		const { built, worker } = source();
		expect(built.busy).toBe(false);
		const pending = built.request(AXIS, 0.1);
		expect(built.busy).toBe(true);
		worker.answer();
		await pending;
		expect(built.busy).toBe(false);
	});

	it("refuses a second request while one is already running", async () => {
		const { built, worker } = source();
		const first = built.request(AXIS, 0.1);
		await expect(built.request(AXIS, 0.2)).rejects.toThrow();
		worker.answer();
		await first;
	});

	it("rejects the pending request on dispose, and terminates the worker", async () => {
		const { built, worker } = source();
		const pending = built.request(AXIS, 0.1);
		built.dispose();
		expect(worker.terminated).toBe(true);
		await expect(pending).rejects.toThrow();
	});
});
