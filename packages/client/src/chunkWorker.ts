import type { MeshWorkerMessage } from "chamfer/mesh";
import { MeshWorkerCore } from "chamfer/mesh";

/**
 * The browser half of a chunk worker.
 *
 * Everything worth testing is in `MeshWorkerCore`, which mentions neither
 * `Worker` nor `postMessage` and runs under plain Node. This file is the part
 * that cannot: it receives the setup, holds the core, and posts what the core
 * returns.
 *
 * The four buffers are transferred rather than copied, so the geometry crosses
 * back to the thread that draws without being duplicated.
 */
let core: MeshWorkerCore | null = null;

self.onmessage = (event: MessageEvent<MeshWorkerMessage>) => {
	const message = event.data;
	if (message.kind === "setup") {
		core = new MeshWorkerCore(message);
		return;
	}
	if (!core) throw new Error("chunk worker asked for a chunk before setup");
	if (message.kind === "retune") {
		core.retune(message);
		return;
	}

	const result = core.run(message);
	self.postMessage(result, { transfer: MeshWorkerCore.buffers(result) });
};
