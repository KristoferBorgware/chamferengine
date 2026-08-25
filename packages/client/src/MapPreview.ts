import type {
	CoarseField,
	CoarseStage,
	MapWorkerStep,
} from "chamfer/generation";
import {
	COARSE_FIELDS,
	COARSE_STAGES,
	COARSE_STAGE_SAYS,
	CoarseMap,
	coarseStageOf,
} from "chamfer/generation";
import type { PlanetSettings } from "./PlanetSettings.js";
import { geographicOf, positionOf } from "chamfer/coordinates";
import { Vec3 } from "chamfer/math";
import { paintCoarseField } from "./paintCoarseField.js";
import { SphereView } from "./SphereView.js";

/** Pixels across the drawing. Height is half, so a degree is square at the equator. */
const WIDTH = 512;
const HEIGHT = 256;

/** How long a knob has to stop moving before the map is rebuilt, in ms. */
/**
 * How long a level change waits for the knob to stop, in milliseconds.
 *
 * Only a level change waits. A grid is tens of megabytes and dropping one to
 * build another is what ran a worker out of memory while a slider was being
 * dragged; every other knob rebuilds as fast as the last build finishes.
 */
const SETTLE_MS = 250;

/**
 * The whole planet as a picture, flat and as a ball, inside the knob panel.
 *
 * A knob change rebuilds the map at the level the world will use and redraws
 * it, and nothing else happens: no device, no mesher, no chunk. The map is
 * therefore the map, not a smaller stand-in for it -- the same field the
 * terrain is built from, drawn while the ground is still being cut.
 *
 * **What is drawn is the ground, and only the ground.** This was a map editor
 * with its own pane, its own copy of the terrain rows, a picture per step of
 * the build and a button to commit one -- a second place to do what the panel
 * already does, and a second answer to what the world is. What is left is the
 * one picture worth having beside the knobs: where the land is on this planet,
 * flat and on a ball, and where the player is standing on it.
 *
 * The build runs on a worker and hands back each step as it lands, so the
 * field is on screen after about a quarter of the wait rather than at the end
 * of it. A knob turned again while a build runs supersedes it at the next step
 * boundary.
 */
export class MapPreview {
	private readonly root: HTMLElement;
	private readonly canvas: HTMLCanvasElement;
	private readonly context: CanvasRenderingContext2D;
	private readonly image: ImageData;
	private readonly sphere: SphereView;
	private readonly status: HTMLElement;
	private readonly worker: Worker;

	private settings: PlanetSettings;

	/**
	 * The ground, and never the steps before it.
	 *
	 * Height stopped at the metre scale and Ground runs the erosion, so the two
	 * were a picture each of one build. A picture of a step is a thing to
	 * explain; a picture of the ground is the planet.
	 */
	private readonly field: CoarseField =
		COARSE_FIELDS.find((one) => one.id === "ground") ?? COARSE_FIELDS[0]!;
	private map: CoarseMap | null = null;
	private token = 0;
	private level: number;
	private startedAt = 0;

	/** Where the player stands, as a direction, or nothing before there is one. */
	private player: { x: number; y: number; z: number } | null = null;

	/** Whether the player's own place is marked. On, because it usually is. */
	private pinned = true;

	/**
	 * Whether the ball is drawn at all.
	 *
	 * Off by default. The flat picture already says where the land is and
	 * already takes a click to stand on; the ball is the one that costs a
	 * drag to turn and 20,480 triangles to redraw, for the same answer shown
	 * a second way.
	 */
	private globeShown = false;

	constructor(
		settings: PlanetSettings,
		into: HTMLElement,
		onGoTo: (at: { x: number; y: number; z: number }) => void = () => {},
	) {
		this.settings = settings;
		this.level = settings.coarseLevel;

		this.root = document.createElement("div");
		this.root.className = "map-preview";

		const preview = this.root;

		const buttons = document.createElement("div");
		buttons.className = "map-buttons";
		preview.appendChild(buttons);

		const pin = document.createElement("button");
		pin.className = "map-pin";
		pin.textContent = "Pin the player";
		pin.classList.toggle("on", this.pinned);
		pin.onclick = () => {
			this.pinned = !this.pinned;
			pin.classList.toggle("on", this.pinned);
			this.drawOverlay();
			this.sphere.setMarker(this.pinned ? this.player : null);
		};
		buttons.appendChild(pin);

		const globeButton = document.createElement("button");
		globeButton.className = "map-pin";
		globeButton.textContent = "Show globe";
		globeButton.classList.toggle("on", this.globeShown);
		globeButton.onclick = () => {
			this.globeShown = !this.globeShown;
			globeButton.classList.toggle("on", this.globeShown);
			ball.classList.toggle("shown", this.globeShown);
			this.sphere.setVisible(this.globeShown);
		};
		buttons.appendChild(globeButton);

		this.canvas = document.createElement("canvas");
		this.canvas.width = WIDTH;
		this.canvas.height = HEIGHT;
		this.canvas.className = "map-flat";
		// **The flat picture stands the player wherever it is clicked, the
		// same as the ball.** It is the one on screen by default, so it is
		// the one that has to carry the gesture, not just the picture.
		this.canvas.onclick = (e) => {
			const rect = this.canvas.getBoundingClientRect();
			const x = ((e.clientX - rect.left) / rect.width) * WIDTH;
			const y = ((e.clientY - rect.top) / rect.height) * HEIGHT;
			const longitude = (x / WIDTH) * 360 - 180;
			const latitude = 90 - (y / HEIGHT) * 180;
			const at = positionOf({ latitude, longitude, altitude: 0 }, 1);
			onGoTo({ x: at.x, y: at.y, z: at.z });
		};
		preview.appendChild(this.canvas);
		this.context = this.canvas.getContext("2d")!;
		this.image = this.context.createImageData(WIDTH, HEIGHT);

		// The flat picture shows the whole planet at once and lies about shape;
		// the ball shows the shape and hides half of it. The two together say
		// what the map holds and what it looks like.
		const ball = document.createElement("canvas");
		ball.width = 260;
		ball.height = 260;
		ball.className = "map-ball";
		ball.classList.toggle("shown", this.globeShown);
		preview.appendChild(ball);
		this.sphere = new SphereView(ball);
		this.sphere.setVisible(this.globeShown);
		this.sphere.picked(([x, y, z]) => onGoTo({ x, y, z }));

		this.status = document.createElement("div");
		this.status.className = "map-says";
		preview.appendChild(this.status);

		into.appendChild(this.root);

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
				this.building = false;
				return;
			}
			this.arrived(message as MapWorkerStep);
		};
		this.setup();
		this.rebuild("height");
	}

	/**
	 * Give up the worker drawing the maps.
	 *
	 * A page leaving the screen is not a page whose threads have gone: the
	 * browser may hold it, frozen, so going back is instant, and a worker held
	 * with it goes on owning its own heap. Rebuilding the world is a fresh
	 * load of this page, so without this every rebuild leaves another worker
	 * behind for as long as the tab lives.
	 */
	dispose(): void {
		this.worker.terminate();
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

	/**
	 * A knob moved.
	 *
	 * **One build in flight, and the newest values always next.** A slider
	 * dragged across its range fires on every step, and a map is a second or
	 * more of work, so acting on each one queues them faster than any of them
	 * finishes. Waiting for the knob to stop instead was worse in the other
	 * direction: the picture only appeared once the hand let go.
	 *
	 * So a change during a build is remembered rather than queued, and the
	 * build that lands starts it. What is drawn keeps up with the hand to
	 * within one build, and no work is done for a value already replaced.
	 *
	 * A new level is the exception, because it is a new grid rather than a
	 * rebuild -- tens of megabytes -- and one of those is not started while a
	 * knob is still moving.
	 */
	changed(settings: PlanetSettings): void {
		const before = this.pending ?? this.settings;
		this.pending = settings;
		this.from = this.earliest(this.from, this.stageFor(before, settings));
		if (this.building) return;
		if (this.waiting) clearTimeout(this.waiting);
		this.waiting =
			settings.coarseLevel === this.level
				? null
				: setTimeout(() => this.launch(), SETTLE_MS);
		if (!this.waiting) this.launch();
	}

	/** Start the build the last change asked for, if one is still waiting. */
	private launch(): void {
		this.waiting = null;
		const wanted = this.pending;
		const from = this.from;
		this.pending = null;
		this.from = null;
		if (!wanted) return;
		this.settings = wanted;
		this.building = true;

		// The level decides the grid, which the worker holds for its whole
		// life, so a new level is a new grid rather than a rebuild.
		if (wanted.coarseLevel !== this.level) {
			this.level = wanted.coarseLevel;
			this.setup();
			this.rebuild("height");
			return;
		}
		this.rebuild(from ?? "height");
	}

	/** Whether a build is running, so a change is remembered and not queued. */
	private building = false;

	/** A grid rebuild waiting for the knob to stop moving. */
	private waiting: ReturnType<typeof setTimeout> | null = null;

	/** What is waiting, and the earliest step anything in it reaches. */
	private pending: PlanetSettings | null = null;
	private from: CoarseStage | null = null;

	/** Whichever of two steps comes first in the chain. */
	private earliest(a: CoarseStage | null, b: CoarseStage): CoarseStage {
		if (!a) return b;
		return COARSE_STAGES.indexOf(a) <= COARSE_STAGES.indexOf(b) ? a : b;
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
		for (const key of Object.keys(now) as (keyof typeof now)[]) {
			if (was[key] === now[key]) continue;
			const stage = coarseStageOf(key);
			if (
				!earliest ||
				COARSE_STAGES.indexOf(stage) < COARSE_STAGES.indexOf(earliest)
			)
				earliest = stage;
		}
		return earliest ?? COARSE_STAGES[COARSE_STAGES.length - 1]!;
	}

	private setup(): void {
		this.worker.postMessage({ kind: "setup", level: this.level });
	}

	/**
	 * Ask for a rebuild from one step, stopping where the open pane needs it to.
	 *
	 * A pane showing the ground before the water does not wait for the water,
	 * which is what makes dragging a noise knob redraw while it is still
	 * moving. Erosion is the slow step by a wide margin.
	 */
	private rebuild(from: CoarseStage): void {
		// A knob whose earliest step is below the open pane's own cannot change
		// what that pane draws, so nothing runs at all. Turning Erosion while
		// the Height pane is open costs nothing.
		if (
			COARSE_STAGES.indexOf(from) >
			COARSE_STAGES.indexOf(this.field.stage)
		) {
			this.building = false;
			return;
		}
		this.token++;
		this.startedAt = performance.now();
		this.status.textContent = `${COARSE_STAGE_SAYS[from]}...`;
		this.worker.postMessage({
			kind: "build",
			token: this.token,
			seed: this.settings.seedNumber,
			options: this.settings.coarseOptions(),
			from,
			until: this.field.stage,
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
		if (step.done) {
			this.building = false;
			if (this.pending) this.launch();
		}
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
