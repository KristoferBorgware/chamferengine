/**
 * What a frame spent, by phase, over a rolling window.
 *
 * Frame time is the number that decides whether the release works, and a mean
 * hides the stutter that ruins it: a run where one frame in sixty takes 40 ms
 * has the same mean as one where none does, and only the second is playable.
 * So the window keeps every sample and reports the worst as well as the middle.
 *
 * Phases are named by the caller rather than fixed here, because what a frame
 * is made of is the client's business. A phase that is never opened is never
 * reported.
 */
export class FrameTimer {
	/** How many frames the window holds. */
	readonly window: number;

	private readonly frames: number[] = [];
	private readonly phases = new Map<string, number[]>();
	private readonly open = new Map<string, number>();
	private started = 0;
	private spent = new Map<string, number>();

	constructor(window = 120) {
		this.window = window;
	}

	/** How many frames the window has collected. */
	get count(): number {
		return this.frames.length;
	}

	/** Start a frame. Anything timed after this belongs to it. */
	begin(now: number): void {
		this.started = now;
		this.spent = new Map<string, number>();
	}

	/** Start a phase within the current frame. */
	enter(phase: string, now: number): void {
		this.open.set(phase, now);
	}

	/** End a phase, adding what it took to this frame's total for it. */
	leave(phase: string, now: number): void {
		const from = this.open.get(phase);
		if (from === undefined) return;
		this.open.delete(phase);
		this.spent.set(phase, (this.spent.get(phase) ?? 0) + (now - from));
	}

	/** Time one call, and give back whatever it returned. */
	measure<T>(phase: string, now: () => number, work: () => T): T {
		this.enter(phase, now());
		try {
			return work();
		} finally {
			this.leave(phase, now());
		}
	}

	/** End the frame and fold it into the window. */
	end(now: number): void {
		push(this.frames, now - this.started, this.window);
		for (const [phase, taken] of this.spent) {
			let held = this.phases.get(phase);
			if (!held) {
				held = [];
				this.phases.set(phase, held);
			}
			push(held, taken, this.window);
		}
		// A phase that ran in earlier frames and not in this one still has to
		// age out of the window, or it reports forever what it cost once.
		for (const [phase, held] of this.phases)
			if (!this.spent.has(phase)) push(held, 0, this.window);
		this.open.clear();
	}

	/** Milliseconds a frame, in the middle of the window and at the worst. */
	frame(): { median: number; worst: number; rate: number } {
		const median = middle(this.frames);
		return {
			median,
			worst: worst(this.frames),
			rate: median > 0 ? 1000 / median : 0,
		};
	}

	/** Milliseconds a phase took, in the middle of the window. */
	phase(name: string): number {
		return middle(this.phases.get(name) ?? []);
	}

	/** Every phase seen, worst first, for a readout that ranks them. */
	byCost(): { phase: string; median: number; worst: number }[] {
		const out = [...this.phases.keys()].map((phase) => ({
			phase,
			median: middle(this.phases.get(phase)!),
			worst: worst(this.phases.get(phase)!),
		}));
		out.sort((a, b) => b.median - a.median);
		return out;
	}

	clear(): void {
		this.frames.length = 0;
		this.phases.clear();
		this.open.clear();
	}
}

/** Add a sample, dropping the oldest once the window is full. */
function push(into: number[], value: number, window: number): void {
	into.push(value);
	if (into.length > window) into.shift();
}

function middle(samples: number[]): number {
	if (samples.length === 0) return 0;
	const sorted = [...samples].sort((a, b) => a - b);
	return sorted[sorted.length >> 1]!;
}

function worst(samples: number[]): number {
	let most = 0;
	for (const sample of samples) if (sample > most) most = sample;
	return most;
}
