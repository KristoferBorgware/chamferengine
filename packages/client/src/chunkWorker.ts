import type { ChunkWorkerMessage } from "chamfer/generation";
import { ChunkWorkerCore } from "chamfer/generation";

/**
 * The browser half of a chunk worker.
 *
 * Everything worth testing is in `ChunkWorkerCore`, which mentions neither
 * `Worker` nor `postMessage` and runs under plain Node. This file is the part
 * that cannot: it receives the setup, holds the core, and posts what the core
 * returns.
 *
 * The two arrays are transferred rather than copied, so a chunk crosses back to
 * the main thread without 478 KB being duplicated.
 */
let core: ChunkWorkerCore | null = null;

self.onmessage = (event: MessageEvent<ChunkWorkerMessage>) => {
	const message = event.data;
	if (message.kind === "setup") {
		core = new ChunkWorkerCore(message);
		return;
	}
	if (!core) throw new Error("chunk worker asked for a chunk before setup");

	const result = core.run(message);
	self.postMessage(result, {
		transfer: [result.blocks.buffer, result.groundLayer.buffer],
	});
};
