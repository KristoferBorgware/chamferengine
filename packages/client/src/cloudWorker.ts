import type { CloudWorkerMessage } from "chamfer/sky";
import { CloudWorkerCore } from "chamfer/sky";

/**
 * The browser half of a cloud worker.
 *
 * Everything worth testing is in `CloudWorkerCore`, which mentions neither
 * `Worker` nor `postMessage` and runs under plain Node. This file is the part
 * that cannot: it receives the setup, holds the core, and posts what the core
 * returns.
 *
 * The two buffers are transferred rather than copied, so the geometry crosses
 * back to the thread that draws without being duplicated.
 */
let core: CloudWorkerCore | null = null;

self.onmessage = (event: MessageEvent<CloudWorkerMessage>) => {
	const message = event.data;
	if (message.kind === "setup") {
		core = new CloudWorkerCore(message);
		return;
	}
	if (!core) throw new Error("cloud worker asked to blow before setup");

	const result = core.run(message);
	self.postMessage(result, { transfer: CloudWorkerCore.buffers(result) });
};
