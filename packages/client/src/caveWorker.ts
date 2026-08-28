import type { CaveRequest } from "./CaveMessage.js";
import { CaveWorkerCore } from "./CaveWorkerCore.js";

/**
 * The browser half of the cave bench's worker.
 *
 * Everything worth testing is in {@link CaveWorkerCore}, which mentions neither
 * `Worker` nor `postMessage`. This file is the part that cannot: it holds the
 * core, drives it one step at a time with the event loop handed back between
 * them, and moves the finished buffers rather than copying them.
 *
 * That hand-back is what makes a superseded request droppable. A stage runs to
 * its end once it has started, so a knob dragged through ten values costs at
 * most the stage that was already running -- and never ten whole rebuilds,
 * which on this page means never ten walks of every block in the patch.
 */
const core = new CaveWorkerCore();
let latest = 0;

function drive(request: CaveRequest): void {
	const steps = core.steps(request);
	const next = (): void => {
		if (request.token !== latest) return;
		let step;
		try {
			step = steps.next();
		} catch (error) {
			self.postMessage({
				kind: "failed",
				token: request.token,
				why: error instanceof Error ? error.message : String(error),
			});
			return;
		}
		if (step.done) return;
		if (step.value.kind === "ready")
			self.postMessage(step.value, core.transfers(step.value));
		else self.postMessage(step.value);
		setTimeout(next, 0);
	};
	setTimeout(next, 0);
}

self.onmessage = (event: MessageEvent<CaveRequest>) => {
	latest = event.data.token;
	drive(event.data);
};
