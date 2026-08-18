import type { MapWorkerMessage, MapWorkerRequest } from "chamfer/generation";
import { MapWorkerCore } from "chamfer/generation";

/**
 * The browser half of the map worker.
 *
 * Everything worth testing is in `MapWorkerCore`, which mentions neither
 * `Worker` nor `postMessage`. This file is the part that cannot: it holds the
 * core, and drives it one step at a time with the event loop handed back
 * between them.
 *
 * That hand-back is what makes a superseded request droppable. A stage runs to
 * its end once it has started, so a knob dragged through ten values costs at
 * most the stage that was already running -- and never ten whole rebuilds.
 */
let core: MapWorkerCore | null = null;
let latest = 0;

function drive(request: MapWorkerRequest): void {
	if (!core) throw new Error("map worker asked for a map before setup");
	const steps = core.steps(request);
	const next = (): void => {
		// A newer request arrived while the last stage ran, so this one stops
		// where it is. The builder keeps what the abandoned run computed, and
		// the newer request starts from wherever it asked to.
		if (request.token !== latest) return;
		const step = steps.next();
		if (step.done) return;
		self.postMessage(step.value);
		setTimeout(next, 0);
	};
	setTimeout(next, 0);
}

self.onmessage = (event: MessageEvent<MapWorkerMessage>) => {
	const message = event.data;
	if (message.kind === "setup") {
		core = new MapWorkerCore(message);
		return;
	}
	latest = message.token;
	drive(message);
};
