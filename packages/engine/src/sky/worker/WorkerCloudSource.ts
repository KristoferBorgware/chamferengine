import type { CloudMesh } from "../buildCloudMesh.js";
import type { CloudResult, CloudWorkerSetup } from "./CloudJob.js";
import type { Vec3 } from "../../math/Vec3.js";

/**
 * The part of a `Worker` this source uses.
 *
 * Written so a real `Worker` satisfies it as it stands, which is what keeps
 * the caller free of a cast: the source is handed a factory and never learns
 * what kind of thing came back.
 */
export interface CloudWorkerHandle {
	postMessage(message: unknown, transfer?: Transferable[]): void;
	terminate(): void;
	onmessage: ((event: MessageEvent<CloudResult>) => void) | null;
}

/**
 * One worker rebuilding every cloud deck off the thread that draws.
 *
 * Unlike a chunk, a cloud has no queue: the wind moves on its own clock, so
 * the only request worth having answered is the newest one, and asking again
 * before the worker is free is a caller error rather than something to
 * schedule around. `busy` is there so the caller checks first, the way
 * `planet.ts` already gates its own refill timer.
 */
export class WorkerCloudSource {
	private readonly worker: CloudWorkerHandle;
	private pending: {
		resolve(mesh: CloudMesh): void;
		reject(reason: Error): void;
	} | null = null;
	private nextId = 1;

	constructor(create: () => CloudWorkerHandle, setup: CloudWorkerSetup) {
		this.worker = create();
		this.worker.onmessage = (event) => {
			this.finish(event.data);
		};
		this.worker.postMessage(setup);
	}

	get busy(): boolean {
		return this.pending !== null;
	}

	request(axis: Vec3, angle: number): Promise<CloudMesh> {
		if (this.pending)
			return Promise.reject(
				new Error("a cloud rebuild is already running"),
			);
		return new Promise<CloudMesh>((resolve, reject) => {
			this.pending = { resolve, reject };
			this.worker.postMessage({
				kind: "blow",
				id: this.nextId++,
				angle,
				axis: [axis.x, axis.y, axis.z],
			});
		});
	}

	dispose(): void {
		this.worker.terminate();
		this.pending?.reject(new Error("cloud source disposed"));
		this.pending = null;
	}

	private finish(result: CloudResult): void {
		const waiting = this.pending;
		this.pending = null;
		waiting?.resolve({
			vertices: result.vertices,
			indices: result.indices,
			puffs: result.puffs,
		});
	}
}
