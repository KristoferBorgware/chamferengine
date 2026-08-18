import type {
	CoarseField,
	CoarseStage,
	MapWorkerStep,
} from "chamfer/generation";
import {
	COARSE_FIELDS,
	COARSE_STAGE_SAYS,
	CoarseMap,
	coarseStageOf,
} from "chamfer/generation";
import type { PlanetSettings } from "./PlanetSettings.js";
import { geographicOf } from "chamfer/coordinates";
import { Vec3 } from "chamfer/math";
import { paintCoarseField } from "./paintCoarseField.js";
import { SphereView } from "./SphereView.js";

/** Pixels across the drawing. Height is half, so a degree is square at the equator. */
const WIDTH = 512;
const HEIGHT = 256;

/** How long a knob has to stop moving before the map is rebuilt, in ms. */
const SETTLE_MS = 250;

/**
 * The maps, drawn while they are still being built.
 *
 * A knob change rebuilds the map at the level the world will use and redraws
 * it, and nothing else happens: no device, no mesher, no chunk. The map is
 * therefore the map, not a smaller stand-in for it, and what is on screen is
 * what **Apply** will build the terrain from.
 *
 * The build runs on a worker and hands back each step as it lands, so the
 * height field is on screen after about a quarter of the wait rather than at
 * the end of it. A knob turned again while a build runs supersedes it at the
 * next step boundary.
 */
export class MapPanel {
	private readonly root: HTMLElement;
	private readonly canvas: HTMLCanvasElement;
	private readonly context: CanvasRenderingContext2D;
	private readonly image: ImageData;
	private readonly sphere: SphereView;
	private readonly status: HTMLElement;
	private readonly says: HTMLElement;
	private readonly worker: Worker;
	private readonly onApply: (settings: PlanetSettings) => void;

	private settings: PlanetSettings;
	private field: CoarseField = COARSE_FIELDS[0]!;
	private map: CoarseMap | null = null;
	private token = 0;
	private level: number;
	private startedAt = 0;

	/** Where the player stands, as a direction, or nothing before there is one. */
	private player: { x: number; y: number; z: number } | null = null;

	/** Whether the player is followed. Off, nothing happens as they move. */
	private pinned = false;

	constructor(
		settings: PlanetSettings,
		onApply: (settings: PlanetSettings) => void,
		onGoTo: (at: { x: number; y: number; z: number }) => void = () => {},
	) {
		this.settings = settings;
		this.onApply = onApply;
		this.level = settings.coarseLevel;

		this.root = document.createElement("aside");
		this.root.className = "maps";

		const head = document.createElement("button");
		head.className = "maps-head";
		head.textContent = "Maps";
		head.onclick = () => this.root.classList.toggle("shut");
		this.root.appendChild(head);

		const body = document.createElement("div");
		body.className = "maps-body";
		this.root.appendChild(body);

		const list = document.createElement("div");
		list.className = "maps-fields";
		for (const field of COARSE_FIELDS) {
			const button = document.createElement("button");
			button.textContent = field.label;
			button.onclick = () => {
				this.field = field;
				for (const other of list.children) other.classList.remove("on");
				button.classList.add("on");
				this.says.textContent = field.says;
				this.paint();
				if (this.map) this.sphere.show(this.map, field);
			};
			if (field === this.field) button.classList.add("on");
			list.appendChild(button);
		}
		body.appendChild(list);

		const pin = document.createElement("button");
		pin.className = "maps-pin";
		pin.textContent = "Pin the player";
		pin.onclick = () => {
			this.pinned = !this.pinned;
			pin.classList.toggle("on", this.pinned);
			this.drawOverlay();
			this.sphere.setMarker(this.pinned ? this.player : null);
		};
		body.appendChild(pin);

		this.canvas = document.createElement("canvas");
		this.canvas.width = WIDTH;
		this.canvas.height = HEIGHT;
		this.canvas.className = "maps-canvas";
		body.appendChild(this.canvas);
		this.context = this.canvas.getContext("2d")!;
		this.image = this.context.createImageData(WIDTH, HEIGHT);

		// The flat picture shows the whole planet at once and lies about shape;
		// the ball shows the shape and hides half of it. The two together say
		// what the map holds and what it looks like.
		const ball = document.createElement("canvas");
		ball.width = 260;
		ball.height = 260;
		ball.className = "maps-ball";
		body.appendChild(ball);
		this.sphere = new SphereView(ball);
		this.sphere.picked(([x, y, z]) => onGoTo({ x, y, z }));

		this.status = document.createElement("div");
		this.status.className = "maps-status";
		body.appendChild(this.status);

		this.says = document.createElement("p");
		this.says.className = "maps-says";
		this.says.textContent = this.field.says;
		body.appendChild(this.says);

		const hint = document.createElement("p");
		hint.className = "maps-says";
		hint.textContent =
			"Drag the ball to turn it. Right-click it to stand somewhere.";
		body.appendChild(hint);

		const bar = document.createElement("div");
		bar.className = "maps-bar";
		const apply = document.createElement("button");
		apply.textContent = "Apply to terrain";
		apply.onclick = () => this.onApply(this.settings);
		bar.appendChild(apply);
		body.appendChild(bar);

		document.body.appendChild(this.root);

		this.worker = new Worker(new URL("./mapWorker.ts", import.meta.url), {
			type: "module",
		});
		this.worker.onmessage = (
			event: MessageEvent<
				MapWorkerStep | { kind: "failed"; level: number; why: string }
			>,
		) => {
			const message = event.data;
			if ("kind" in message && message.kind === "failed") {
				this.status.textContent =
					`a map at level ${message.level} would not fit in memory. ` +
					"Raise Coarse cell, or lower Radius.";
				// The level that failed is not held, so the next try rebuilds.
				this.level = -1;
				return;
			}
			this.arrived(message as MapWorkerStep);
		};
		this.setup();
		this.rebuild("height");
	}

	/** Where the player is standing, so both pictures can mark it. */
	setPlayer(at: { x: number; y: number; z: number }): void {
		this.player = at;
		if (!this.pinned) return;
		const was = this.marked;
		// A step too small to move the mark by a pixel is not worth a redraw,
		// and this runs once a frame.
		if (
			was &&
			Math.abs(was.x - at.x) +
				Math.abs(was.y - at.y) +
				Math.abs(was.z - at.z) <
				2e-4
		)
			return;
		this.marked = { ...at };
		this.drawOverlay();
		this.sphere.setMarker(at);
	}

	/** Where the mark was last put, so an unmoved player costs nothing. */
	private marked: { x: number; y: number; z: number } | null = null;

	/** A rebuild waiting for the knob to stop moving. */
	private waiting: ReturnType<typeof setTimeout> | null = null;

	/**
	 * A knob moved.
	 *
	 * Held until the knob stops. A slider dragged across its range fires on
	 * every step, and a map is seconds of work and a grid of tens of megabytes,
	 * so acting on each step queues both faster than either can be finished.
	 */
	changed(settings: PlanetSettings): void {
		const before = this.pending ?? this.settings;
		this.pending = settings;
		this.from = this.earliest(this.from, this.stageFor(before, settings));
		if (this.waiting) clearTimeout(this.waiting);
		this.waiting = setTimeout(() => {
			this.waiting = null;
			const wanted = this.pending;
			const from = this.from;
			this.pending = null;
			this.from = null;
			if (!wanted) return;
			this.settings = wanted;

			// The level decides the grid, which the worker holds for its whole
			// life, so a new level is a new grid rather than a rebuild.
			if (wanted.coarseLevel !== this.level) {
				this.level = wanted.coarseLevel;
				this.setup();
				this.rebuild("height");
				return;
			}
			this.rebuild(from ?? "height");
		}, SETTLE_MS);
	}

	/** What is waiting, and the earliest step anything in it reaches. */
	private pending: PlanetSettings | null = null;
	private from: CoarseStage | null = null;

	/** Whichever of two steps comes first in the chain. */
	private earliest(a: CoarseStage | null, b: CoarseStage): CoarseStage {
		if (!a) return b;
		const order: CoarseStage[] = [
			"height",
			"sea",
			"erosion",
			"rivers",
			"slope",
		];
		return order.indexOf(a) <= order.indexOf(b) ? a : b;
	}

	/** The earliest step any of the changed options reaches. */
	private stageFor(
		before: PlanetSettings,
		after: PlanetSettings,
	): CoarseStage {
		if (before.knobs.seed !== after.knobs.seed) return "height";
		const was = before.coarseOptions();
		const now = after.coarseOptions();
		let earliest: CoarseStage | null = null;
		const order: CoarseStage[] = [
			"height",
			"sea",
			"erosion",
			"rivers",
			"slope",
		];
		for (const key of Object.keys(now) as (keyof typeof now)[]) {
			if (was[key] === now[key]) continue;
			const stage = coarseStageOf(key);
			if (!earliest || order.indexOf(stage) < order.indexOf(earliest))
				earliest = stage;
		}
		return earliest ?? "slope";
	}

	private setup(): void {
		this.worker.postMessage({ kind: "setup", level: this.level });
	}

	private rebuild(from: CoarseStage): void {
		this.token++;
		this.startedAt = performance.now();
		this.status.textContent = `${COARSE_STAGE_SAYS[from]}...`;
		this.worker.postMessage({
			kind: "build",
			token: this.token,
			seed: this.settings.seedNumber,
			options: this.settings.coarseOptions(),
			from,
		});
	}

	private arrived(step: MapWorkerStep): void {
		// A step from a build that has been superseded. The newer one is already
		// running, so this picture would be replaced before it was looked at.
		if (step.token !== this.token) return;
		this.map = CoarseMap.fromSnapshot(step.snapshot);
		this.paint();
		this.sphere.show(this.map, this.field);
		const ms = Math.round(performance.now() - this.startedAt);
		this.status.textContent = step.done
			? `${this.level === 0 ? "" : `level ${this.level}, `}${this.map.count.toLocaleString()} cells, ${ms} ms`
			: `${COARSE_STAGE_SAYS[step.stage]}... ${ms} ms`;
	}

	/**
	 * Redraw the field itself.
	 *
	 * This walks every cell of the map -- 655,362 of them at the shipped level
	 * -- so it runs when the map or the chosen field changes and at no other
	 * time. Moving the mark goes through {@link drawOverlay}, which does not
	 * touch it.
	 */
	private paint(): void {
		if (!this.map) return;
		paintCoarseField(
			this.map,
			this.field,
			WIDTH,
			HEIGHT,
			this.image.data as unknown as Uint8ClampedArray,
		);
		this.drawOverlay();
	}

	/**
	 * Put the drawn field back and mark the player on top of it.
	 *
	 * `putImageData` writes straight over whatever is on the canvas, so the
	 * mark is drawn after it rather than into it -- which is what keeps the
	 * field's own pixels good for the next frame without being computed again.
	 */
	private drawOverlay(): void {
		if (!this.map) return;
		const ctx = this.context;
		ctx.putImageData(this.image, 0, 0);
		if (!this.pinned || !this.player) return;

		const place = geographicOf(
			new Vec3(this.player.x, this.player.y, this.player.z),
			1,
		);
		const x = ((place.longitude + 180) / 360) * WIDTH;
		const y = ((90 - place.latitude) / 180) * HEIGHT;

		// Drawn twice, dark under light. A single color loses the mark wherever
		// the map happens to match it, and the map is every color it has.
		const cross = (): void => {
			ctx.beginPath();
			ctx.arc(x, y, 4.5, 0, 2 * Math.PI);
			ctx.stroke();
			ctx.beginPath();
			for (const [dx, dy] of [
				[-1, 0],
				[1, 0],
				[0, -1],
				[0, 1],
			] as const) {
				ctx.moveTo(x + dx * 9, y + dy * 9);
				ctx.lineTo(x + dx * 5.5, y + dy * 5.5);
			}
			ctx.stroke();
		};
		ctx.strokeStyle = "#000";
		ctx.lineWidth = 3.5;
		cross();
		ctx.strokeStyle = "#fff";
		ctx.lineWidth = 1.5;
		cross();
	}
}
