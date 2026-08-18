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
let level = -1;

function drive(request: MapWorkerRequest): void {
	// A setup that could not allocate leaves no core. Asking again for a map is
	// not an error worth throwing on: the level that failed is still the level
	// being asked for, and throwing here buries the message that says why under
	// one that does not.
	if (!core) return;
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
		// The same level twice is the same grid, and a grid at level 9 is 136 MB
		// of it. Rebuilding one to replace itself is what runs a worker out of
		// memory while a slider is being dragged.
		if (message.level === level && core) return;

		// Let the old one go before asking for the new one. Both alive at once
		// is 272 MB at level 9, and the failure is an allocation that cannot be
		// retried rather than a slow frame.
		core = null;
		level = message.level;
		try {
			core = new MapWorkerCore(message);
		} catch (error) {
			level = -1;
			self.postMessage({
				kind: "failed",
				level: message.level,
				why: error instanceof Error ? error.message : String(error),
			});
		}
		return;
	}
	latest = message.token;
	drive(message);
};
