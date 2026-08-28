import type { VegetationRequest } from "./VegetationMessage.js";
import { VegetationWorkerCore } from "./VegetationWorkerCore.js";

/**
 * The browser half of the vegetation bench's worker.
 *
 * Everything worth testing is in {@link VegetationWorkerCore}, which mentions
 * neither `Worker` nor `postMessage`. This file holds the core, drives it one
 * step at a time with the event loop handed back between them, and moves the
 * finished buffers rather than copying them.
 *
 * That hand-back is what makes a superseded request droppable. A stage runs to
 * its end once it has started, so a slider dragged through ten values costs at
 * most the stage already running.
 */
const core = new VegetationWorkerCore();
let latest = 0;

function drive(request: VegetationRequest): void {
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

self.onmessage = (event: MessageEvent<VegetationRequest>) => {
	latest = event.data.token;
	drive(event.data);
};
