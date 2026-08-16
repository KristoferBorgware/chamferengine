/**
 * How long the GPU spent on a render pass, when the adapter will say.
 *
 * Wall-clock time on the thread that draws measures how long it took to
 * *describe* a frame, not to draw one: the calls return as soon as the commands
 * are queued. The two numbers are different questions and either can be the one
 * over budget, so a frame is not measured until both are.
 *
 * `timestamp-query` is optional, and the readings are quantised on some
 * platforms to keep them from being used as a timing side channel. A missing
 * feature reports nothing rather than guessing, and the caller draws the same
 * frame either way.
 *
 * One reading is in flight at a time. A frame that arrives while the last one
 * is still being read back is drawn untimed, which costs nothing: the point is
 * a running figure, not a sample per frame.
 */
export class GpuClock {
	private readonly queries: GPUQuerySet | null;
	private readonly resolved: GPUBuffer | null;
	private readonly readable: GPUBuffer | null;
	private reading = false;
	private last = 0;
	private taken = 0;

	constructor(device: GPUDevice) {
		if (!device.features.has("timestamp-query")) {
			this.queries = null;
			this.resolved = null;
			this.readable = null;
			return;
		}
		this.queries = device.createQuerySet({ type: "timestamp", count: 2 });
		this.resolved = device.createBuffer({
			size: 16,
			usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
		});
		this.readable = device.createBuffer({
			size: 16,
			usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
		});
	}

	/** Whether this adapter will time a pass at all. */
	get available(): boolean {
		return this.queries !== null;
	}

	/** The last reading, in milliseconds. Zero until one arrives. */
	get milliseconds(): number {
		return this.last;
	}

	/** How many readings have come back. */
	get readings(): number {
		return this.taken;
	}

	/** What to put in a render pass descriptor, or nothing to leave it untimed. */
	writes(): GPURenderPassTimestampWrites | undefined {
		if (!this.queries || this.reading) return undefined;
		return {
			querySet: this.queries,
			beginningOfPassWriteIndex: 0,
			endOfPassWriteIndex: 1,
		};
	}

	/** Copy the timestamps out, after the pass they belong to has ended. */
	resolve(encoder: GPUCommandEncoder): void {
		if (!this.queries || !this.resolved || !this.readable || this.reading)
			return;
		encoder.resolveQuerySet(this.queries, 0, 2, this.resolved, 0);
		encoder.copyBufferToBuffer(this.resolved, 0, this.readable, 0, 16);
	}

	/** Ask for the reading the last resolve produced. */
	read(): void {
		const readable = this.readable;
		if (!readable || this.reading) return;
		this.reading = true;
		readable
			.mapAsync(GPUMapMode.READ)
			.then(() => {
				const stamps = new BigUint64Array(
					readable.getMappedRange().slice(0),
				);
				readable.unmap();
				// Nanoseconds, and the pass can report the same stamp twice on
				// a platform that quantises them coarsely.
				const span = stamps[1]! - stamps[0]!;
				if (span > 0n) {
					this.last = Number(span) / 1e6;
					this.taken++;
				}
				this.reading = false;
			})
			.catch(() => {
				this.reading = false;
			});
	}

	dispose(): void {
		this.queries?.destroy();
		this.resolved?.destroy();
		this.readable?.destroy();
	}
}
