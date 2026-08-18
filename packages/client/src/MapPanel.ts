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
import { paintCoarseField } from "./paintCoarseField.js";

/** Pixels across the drawing. Height is half, so a degree is square at the equator. */
const WIDTH = 512;
const HEIGHT = 256;

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

	constructor(
		settings: PlanetSettings,
		onApply: (settings: PlanetSettings) => void,
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
			};
			if (field === this.field) button.classList.add("on");
			list.appendChild(button);
		}
		body.appendChild(list);

		this.canvas = document.createElement("canvas");
		this.canvas.width = WIDTH;
		this.canvas.height = HEIGHT;
		this.canvas.className = "maps-canvas";
		body.appendChild(this.canvas);
		this.context = this.canvas.getContext("2d")!;
		this.image = this.context.createImageData(WIDTH, HEIGHT);

		this.status = document.createElement("div");
		this.status.className = "maps-status";
		body.appendChild(this.status);

		this.says = document.createElement("p");
		this.says.className = "maps-says";
		this.says.textContent = this.field.says;
		body.appendChild(this.says);

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
		this.worker.onmessage = (event: MessageEvent<MapWorkerStep>) =>
			this.arrived(event.data);
		this.setup();
		this.rebuild("height");
	}

	/** A knob moved. Rebuild from the step that knob first reaches. */
	changed(settings: PlanetSettings): void {
		const before = this.settings;
		this.settings = settings;

		// The level decides the grid, which the worker holds for its whole life,
		// so a new level is a new worker rather than a rebuild.
		if (settings.coarseLevel !== this.level) {
			this.level = settings.coarseLevel;
			this.setup();
			this.rebuild("height");
			return;
		}
		this.rebuild(this.stageFor(before, settings));
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
		const ms = Math.round(performance.now() - this.startedAt);
		this.status.textContent = step.done
			? `${this.level === 0 ? "" : `level ${this.level}, `}${this.map.count.toLocaleString()} cells, ${ms} ms`
			: `${COARSE_STAGE_SAYS[step.stage]}... ${ms} ms`;
	}

	private paint(): void {
		if (!this.map) return;
		paintCoarseField(
			this.map,
			this.field,
			WIDTH,
			HEIGHT,
			this.image.data as unknown as Uint8ClampedArray,
		);
		this.context.putImageData(this.image, 0, 0);
	}
}
