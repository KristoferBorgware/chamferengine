import type { BiomeCloud, BiomeSheet, BiomesFacts } from "./BiomesMessage.js";
import type { BiomeTableDraft } from "./BiomeDraft.js";
import {
	ANY_LANDFORM,
	BIOME_PRESETS,
	CONT_BANDS,
	CONT_NAMES,
	ERO_BANDS,
	ERO_NAMES,
	LANDFORMS,
	PV_BANDS,
	PV_NAMES,
	allowedBiomes,
	biomeOf,
	gridAt,
	hash3,
} from "chamfer/generation";
import { biomeTableOf } from "./BiomeDraft.js";

/** What the panel's one picture shows. */
export type BiomePicture =
	"biomes" | "landform" | "temperature" | "humidity" | "push" | "regions";

const PICTURES: readonly { value: BiomePicture; label: string }[] = [
	{ value: "biomes", label: "Biomes" },
	{ value: "landform", label: "Landform" },
	{ value: "regions", label: "Regions" },
	{ value: "temperature", label: "Temperature" },
	{ value: "humidity", label: "Humidity" },
	{ value: "push", label: "Biome noise" },
];

/** What the diagram's cloud is drawn from. */
export type BiomeCloudSource = "nothing" | "patch" | "planet";

const CLOUDS: readonly { value: BiomeCloudSource; label: string }[] = [
	{ value: "nothing", label: "nothing" },
	{ value: "patch", label: "the patch" },
	{ value: "planet", label: "the planet" },
];

/** How many pixels across the diagram is rasterised. */
const CHART = 300;

/** One sRGB hex as its three bytes. */
function bytesOf(hex: string): [number, number, number] {
	const n = parseInt(hex, 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** A ramp's `[0, 1]` floats as the bytes a canvas takes. */
function bytesOfRamp(
	c: readonly [number, number, number],
): [number, number, number] {
	return [
		Math.round(c[0] * 255),
		Math.round(c[1] * 255),
		Math.round(c[2] * 255),
	];
}

/**
 * The sea on every picture: one colour deepening with how much water a look
 * passes through, because the ocean is a surface and holds no blocks of its
 * own (doc 25).
 */
const SEA_COLOR: readonly [number, number, number] = [0.12, 0.32, 0.55];
const SEA_INK = bytesOfRamp(SEA_COLOR);

/** How many steps a field picture is cut into. */
const PICTURE_BANDS = 9;

/** Cold to hot, and dry to wet, as the two ramps the fields read on. */
const HEAT_RAMP: readonly (readonly [number, number, number])[] = [
	[0.62, 0.79, 0.92],
	[0.93, 0.93, 0.88],
	[0.85, 0.35, 0.26],
];
const GREY_RAMP: readonly (readonly [number, number, number])[] = [
	[0.09, 0.1, 0.12],
	[0.55, 0.56, 0.6],
	[0.95, 0.96, 0.98],
];
const WET_RAMP: readonly (readonly [number, number, number])[] = [
	[0.86, 0.78, 0.5],
	[0.92, 0.92, 0.9],
	[0.16, 0.4, 0.7],
];

/**
 * One reading in `[-1, 1]` as a step along a ramp, with a line at the edge
 * of each step.
 *
 * **Bands, not a wash.** A smooth gradient of a noise field shows its
 * brightness and hides its shape; cutting it into steps draws the contour
 * lines, and the contours are what say whether a field is broad and rolling
 * or narrow and folded.
 */
function bandRamp(
	v: number,
	ramp: readonly (readonly [number, number, number])[],
): [number, number, number] {
	const t = Math.max(0, Math.min(0.9999, (v + 1) / 2));
	const step = Math.floor(t * PICTURE_BANDS);
	const along = (step / (PICTURE_BANDS - 1)) * (ramp.length - 1);
	const lo = Math.min(ramp.length - 1, Math.floor(along));
	const hi = Math.min(ramp.length - 1, lo + 1);
	const mix = along - lo;
	const into = t * PICTURE_BANDS - step;
	const edge = into < 0.06 ? 0.5 : 1;
	return [
		(ramp[lo]![0] + (ramp[hi]![0] - ramp[lo]![0]) * mix) * edge,
		(ramp[lo]![1] + (ramp[hi]![1] - ramp[lo]![1]) * mix) * edge,
		(ramp[lo]![2] + (ramp[hi]![2] - ramp[lo]![2]) * mix) * edge,
	];
}

/**
 * A region's own colour, hashed off its seed's cell.
 *
 * Nothing about it means anything -- it exists so two regions side by side
 * can be told apart, which is the only question this picture answers. `-1`
 * is regions off or the sea, either of which reads as the sea's own colour.
 */
function regionColor(key: number): readonly [number, number, number] {
	if (key < 0) return SEA_COLOR;
	return [
		0.3 + 0.6 * hash3(key, 0, 0, 101),
		0.3 + 0.6 * hash3(0, key, 0, 211),
		0.3 + 0.6 * hash3(0, 0, key, 331),
	];
}

/**
 * The biomes: the diagram, the table under it, and the landform grid.
 *
 * **Its own panel, on its own side of the window.** The world panel is the
 * seed, the climate knobs and where the patch is standing; this is the table
 * those readings are turned into names by -- one dot per biome, every point of
 * the square belonging to whichever dot is nearest among the ones the shown
 * landform allows. Drag a dot and the planet recolours under it.
 */
export class BiomePanel {
	readonly table: BiomeTableDraft;
	picture: BiomePicture;

	/**
	 * What the diagram's cloud is drawn from.
	 *
	 * **`patch`, because that is the lab's own default.** A region of the
	 * square with no dots over it might be a biome the whole planet never
	 * builds, or it might just be nowhere near the camera; `planet` answers
	 * the first question and `patch` the second, and only one can be the
	 * default. The patch is also the cheaper of the two, sent whole with no
	 * subsampling however the planet reading is built.
	 */
	cloud: BiomeCloudSource = "patch";

	/**
	 * The finished map, and the selector that picks its reading.
	 *
	 * **Built here and mounted by the page, not appended to this panel's own
	 * scroller.** The lab keeps the map in the world panel's head, beside the
	 * facts a build measured -- it is what the diagram is being judged
	 * against, not one more row of the table that reads it.
	 */
	readonly preview: HTMLElement;

	/**
	 * One field's own picture, built for each section that tunes it to mount
	 * at its own top.
	 *
	 * **A click on one of these focuses {@link preview} on the same field.**
	 * A reader turning the knobs under Temperature should not have to find
	 * "Temperature" in a menu to see what they moved; the miniature already
	 * standing there is the shorter path to the same picture.
	 */
	readonly miniLandform: HTMLElement;
	readonly miniRegions: HTMLElement;
	readonly miniTemperature: HTMLElement;
	readonly miniHumidity: HTMLElement;
	readonly miniPush: HTMLElement;

	/** The landform whose diagram is shown, as an index into `LANDFORMS`. */
	shown = 2;

	/** The biome being edited, as an index into the table. */
	picked = 0;

	/**
	 * How far the push can carry the lookup, in the square's own units.
	 *
	 * A fact about the world's knobs rather than the table, so the page hands
	 * it in through {@link setPush} whenever the knob moves.
	 */
	private pushReach = 0;

	private readonly onChange: (settled: boolean) => void;
	private readonly onPicture: () => void;

	private readonly root: HTMLElement;
	private readonly chipRow: HTMLElement;
	private readonly chart: HTMLCanvasElement;
	private readonly chartInk: CanvasRenderingContext2D;
	private readonly says: HTMLElement;
	private readonly list: HTMLElement;
	private readonly gridHost: HTMLElement;
	private readonly shot: HTMLCanvasElement;
	private readonly shotInk: CanvasRenderingContext2D;
	private readonly presetPick: HTMLSelectElement;
	private readonly pictureSelect: HTMLSelectElement;

	/** Every miniature built, so a rebuild repaints all of them in one pass. */
	private readonly minis: {
		readonly picture: BiomePicture;
		readonly canvas: HTMLCanvasElement;
		readonly ink: CanvasRenderingContext2D;
	}[] = [];

	private facts: BiomesFacts | null = null;
	private sheet: BiomeSheet | null = null;
	private patchCloud: BiomeCloud | null = null;
	private dragging = false;

	constructor(
		table: BiomeTableDraft,
		onChange: (settled: boolean) => void,
		options: {
			picture?: BiomePicture;
			cloud?: BiomeCloudSource;
			onPicture?: () => void;
		} = {},
	) {
		this.table = table;
		this.onChange = onChange;
		this.onPicture = options.onPicture ?? ((): void => {});
		this.picture = options.picture ?? "biomes";
		this.cloud = options.cloud ?? "patch";

		this.root = document.createElement("aside");
		this.root.className = "plants biomes-panel";
		const head = document.createElement("div");
		head.className = "plants-head";
		const title = document.createElement("h1");
		title.textContent = "Biomes";
		head.append(title);
		this.root.append(head);

		const scroller = document.createElement("div");
		scroller.className = "plants-body";
		this.root.append(scroller);

		// The preset the table starts from, above everything it writes over.
		const presetRow = document.createElement("div");
		presetRow.className = "knob";
		const presetLabel = document.createElement("label");
		presetLabel.textContent = "Preset";
		this.presetPick = document.createElement("select");
		for (const name of Object.keys(BIOME_PRESETS)) {
			const option = document.createElement("option");
			option.value = name;
			option.textContent =
				name === "holdridge" ? "Holdridge life zones" : "Plain";
			this.presetPick.append(option);
		}
		this.presetPick.value = this.table.preset;
		this.presetPick.oninput = () => {
			const fresh = biomeTableOf(this.presetPick.value);
			this.table.preset = fresh.preset;
			this.table.biomes = fresh.biomes;
			this.table.grid = fresh.grid;
			this.picked = 0;
			this.settle();
		};
		presetRow.append(presetLabel, this.presetPick);
		scroller.append(presetRow);

		// The finished map and its selector, built for the page to mount
		// wherever the world's own picture belongs -- the world panel's head,
		// not this panel's scroller.
		this.preview = document.createElement("div");
		this.preview.className = "biomes-preview";
		const pictureRow = document.createElement("div");
		pictureRow.className = "knob";
		const pictureLabel = document.createElement("label");
		pictureLabel.textContent = "Picture";
		this.pictureSelect = document.createElement("select");
		for (const { value, label } of PICTURES) {
			const option = document.createElement("option");
			option.value = value;
			option.textContent = label;
			this.pictureSelect.append(option);
		}
		this.pictureSelect.value = this.picture;
		this.pictureSelect.oninput = () => {
			this.picture = this.pictureSelect.value as BiomePicture;
			this.paintSheet();
			this.onPicture();
		};
		pictureRow.append(pictureLabel, this.pictureSelect);
		this.preview.append(pictureRow);
		this.shot = document.createElement("canvas");
		this.shot.className = "biomes-shot";
		this.shotInk = this.shot.getContext("2d")!;
		this.preview.append(this.shot);

		// **One picture per section, painted from the same held sheet.** The
		// lab keeps a field's picture where the knobs that tune it are, so
		// the thing being judged never scrolls away from the row being
		// turned; a click on one focuses {@link preview} on the same field.
		this.miniLandform = this.buildMini("landform", null, "Landform");
		this.miniRegions = this.buildMini("regions", null, "Regions");
		this.miniTemperature = this.buildMini(
			"temperature",
			"heat",
			"Temperature",
		);
		this.miniHumidity = this.buildMini("humidity", "wet", "Humidity");
		this.miniPush = this.buildMini("push", "wild", "Biome noise");

		// **Which climate the diagram's cloud is drawn from, not what colours
		// the square.** A cell with no dots over it is a biome the shown
		// ground never reaches on the patch or on the planet, and those are
		// different questions -- so this stands apart from the picture above.
		const cloudRow = document.createElement("div");
		cloudRow.className = "knob";
		const cloudLabel = document.createElement("label");
		cloudLabel.textContent = "Show on it";
		const cloudPick = document.createElement("select");
		for (const { value, label } of CLOUDS) {
			const option = document.createElement("option");
			option.value = value;
			option.textContent = label;
			cloudPick.append(option);
		}
		cloudPick.value = this.cloud;
		cloudPick.oninput = () => {
			this.cloud = cloudPick.value as BiomeCloudSource;
			this.paintChart();
			this.onPicture();
		};
		cloudRow.append(cloudLabel, cloudPick);
		scroller.append(cloudRow);

		this.chipRow = document.createElement("div");
		this.chipRow.className = "biomes-chips";
		scroller.append(this.chipRow);

		this.chart = document.createElement("canvas");
		this.chart.className = "biomes-chart";
		this.chart.width = CHART;
		this.chart.height = CHART;
		this.chartInk = this.chart.getContext("2d")!;
		scroller.append(this.chart);
		const axes = document.createElement("div");
		axes.className = "biomes-axes";
		axes.innerHTML =
			"<span>dry</span><span>humidity</span><span>wet</span>";
		scroller.append(axes);

		this.says = document.createElement("p");
		this.says.className = "knob-note";
		scroller.append(this.says);

		this.list = document.createElement("div");
		scroller.append(this.list);

		const add = document.createElement("button");
		add.type = "button";
		add.className = "plants-add";
		add.textContent = "add a biome";
		add.onclick = () => this.addBiome();
		scroller.append(add);

		const gridTitle = document.createElement("h1");
		gridTitle.textContent = "The landform grid";
		gridTitle.className = "biomes-grid-title";
		scroller.append(gridTitle);
		this.gridHost = document.createElement("div");
		scroller.append(this.gridHost);

		document.body.append(this.root);
		this.wireChart();
		// The panel opens editing one kind of ground, so the biome it says it
		// is editing has to be one of that ground's own.
		const allowed = this.allowedNow()[this.shown] ?? [];
		if (!allowed.includes(this.picked)) this.picked = allowed[0] ?? 0;
		this.build();
	}

	/**
	 * One field's own miniature, for the page to mount at the top of the
	 * section that tunes it.
	 *
	 * `tint` is the same class the section's own heading carries, so the
	 * badge over the picture's corner and the heading above it read as one
	 * colour naming one field.
	 */
	private buildMini(
		picture: BiomePicture,
		tint: "heat" | "wet" | "wild" | null,
		label: string,
	): HTMLElement {
		const holder = document.createElement("div");
		holder.className = "knobs-shot" + (tint ? ` ${tint}` : "");
		const canvas = document.createElement("canvas");
		const badge = document.createElement("b");
		badge.textContent = label;
		holder.append(canvas, badge);
		const ink = canvas.getContext("2d")!;
		canvas.onclick = () => {
			this.picture = picture;
			this.pictureSelect.value = picture;
			this.paintSheet();
			this.onPicture();
		};
		this.minis.push({ picture, canvas, ink });
		return holder;
	}

	/** The push's reach moved with a knob, so the border bands move with it. */
	setPush(reach: number): void {
		if (reach === this.pushReach) return;
		this.pushReach = reach;
		this.paintChart();
	}

	/** Everything the last build measured, painted into the panel. */
	show(
		facts: BiomesFacts,
		sheet: BiomeSheet | null,
		patch: BiomeCloud,
	): void {
		this.facts = facts;
		if (sheet) this.sheet = sheet;
		this.patchCloud = patch;
		this.build();
		this.paintSheet();
	}

	// -----------------------------------------------------------------------
	// The diagram.
	// -----------------------------------------------------------------------

	private allowedNow(): readonly (readonly number[])[] {
		return allowedBiomes(this.table.biomes);
	}

	private paintChart(): void {
		const ink = this.chartInk;
		const biomes = this.table.biomes;
		const allowed = this.allowedNow()[this.shown] ?? [];
		const cells = 150;
		const image = ink.createImageData(cells, cells);
		const px = image.data;
		for (let r = 0; r < cells; r++)
			for (let q = 0; q < cells; q++) {
				const h = (q + 0.5) / cells;
				const t = 1 - (r + 0.5) / cells;
				// The nearest dot and the second nearest, because the border
				// band is drawn from the gap between them.
				let first = allowed[0] ?? -1;
				let other = first;
				let near = Infinity;
				let second = Infinity;
				for (let i = 0; i < allowed.length; i++) {
					const b = allowed[i]!;
					const dt = t - biomes[b]!.t;
					const dh = h - biomes[b]!.h;
					const d = dt * dt + dh * dh;
					if (d < near) {
						second = near;
						other = first;
						near = d;
						first = b;
					} else if (d < second) {
						second = d;
						other = b;
					}
				}
				const at = (r * cells + q) * 4;
				if (first < 0) {
					px[at] = 24;
					px[at + 1] = 26;
					px[at + 2] = 32;
					px[at + 3] = 255;
					continue;
				}
				// **The push is drawn as a woven band along every border.**
				// Half the gap between the two nearest dots is how far this
				// point stands from the line between them; anywhere the push
				// can carry the lookup across that line is dithered between
				// the two answers, so the picture says where a border is firm
				// and where the noise decides.
				const gap = (Math.sqrt(second) - Math.sqrt(near)) / 2;
				const which =
					gap < this.pushReach && (q + r) % 2 === 1 ? other : first;
				const [red, green, blue] = bytesOf(biomes[which]!.hex);
				px[at] = red;
				px[at + 1] = green;
				px[at + 2] = blue;
				px[at + 3] = 255;
			}
		// Drawn small and scaled up, because a Voronoi region is flat color
		// and the dots and names are drawn crisp over the top.
		ink.imageSmoothingEnabled = false;
		const off = document.createElement("canvas");
		off.width = cells;
		off.height = cells;
		off.getContext("2d")!.putImageData(image, 0, 0);
		ink.clearRect(0, 0, CHART, CHART);
		ink.drawImage(off, 0, 0, CHART, CHART);

		// **The cloud: what the shown ground's climate actually is, over
		// whichever rectangle is asked for.** The diagram's cell areas say
		// nothing about either -- land clusters in the middle of the square
		// and thins toward its corners, so a big cell can be a rare biome.
		// It is also where the regions show: at full pull every region is one
		// climate, so the cloud collapses from a smear into a scatter of
		// single points, one per region.
		//
		// **The patch and the planet are different questions.** One dot a
		// hexagon in view says which part of itself the camera is standing
		// in; one dot a cell of the planet says whether the shown ground
		// builds this biome anywhere at all. Only one can be the default, and
		// it is the patch -- the planet's cloud is a heavier reading nobody
		// asked for until they ask for it.
		if (this.cloud === "patch" && this.patchCloud) {
			const cloud = this.patchCloud;
			ink.fillStyle = "rgba(10, 12, 16, 0.42)";
			for (let n = 0; n < cloud.landform.length; n++) {
				if (cloud.landform[n] !== this.shown) continue;
				ink.fillRect(
					cloud.h[n]! * CHART - 0.5,
					(1 - cloud.t[n]!) * CHART - 0.5,
					1.6,
					1.6,
				);
			}
		} else if (this.cloud === "planet" && this.sheet) {
			const sheet = this.sheet;
			ink.fillStyle = "rgba(10, 12, 16, 0.4)";
			const tall = sheet.height;
			for (let r = 0; r < tall; r++) {
				// The sheet is an equirectangular picture, so a row near a
				// pole holds far more samples per square metre than the
				// equator's; keeping cos(latitude) of each row makes the
				// cloud a picture of ground rather than of the projection.
				const keep = Math.cos(((r + 0.5) / tall - 0.5) * Math.PI);
				const step = Math.max(1, Math.round(3 / keep));
				for (let q = r % step; q < sheet.width; q += step) {
					const n = r * sheet.width + q;
					if (sheet.landform[n] !== this.shown) continue;
					ink.fillRect(
						sheet.h[n]! * CHART - 0.5,
						(1 - sheet.t[n]!) * CHART - 0.5,
						1.6,
						1.6,
					);
				}
			}
		}

		for (const b of allowed ?? []) {
			const biome = biomes[b]!;
			const x = biome.h * CHART;
			const y = (1 - biome.t) * CHART;
			ink.beginPath();
			ink.arc(x, y, b === this.picked ? 6 : 4, 0, Math.PI * 2);
			ink.fillStyle = `#${biome.hex}`;
			ink.fill();
			ink.lineWidth = b === this.picked ? 2 : 1;
			ink.strokeStyle = b === this.picked ? "#fff" : "rgba(0,0,0,0.6)";
			ink.stroke();
			ink.font = "10px system-ui, sans-serif";
			ink.textAlign = "center";
			ink.fillStyle = "rgba(240, 244, 250, 0.92)";
			ink.strokeStyle = "rgba(10, 12, 16, 0.8)";
			ink.lineWidth = 3;
			const label = Math.max(12, Math.min(CHART - 4, y - 10));
			ink.strokeText(biome.name, x, label);
			ink.fillText(biome.name, x, label);
		}
	}

	private wireChart(): void {
		const place = (event: PointerEvent): { t: number; h: number } => {
			const box = this.chart.getBoundingClientRect();
			return {
				h: Math.max(
					0,
					Math.min(1, (event.clientX - box.left) / box.width),
				),
				t: Math.max(
					0,
					Math.min(1, 1 - (event.clientY - box.top) / box.height),
				),
			};
		};
		this.chart.addEventListener("pointerdown", (event) => {
			const at = place(event);
			const allowed = this.allowedNow()[this.shown] ?? [];
			let best = -1;
			let near = Infinity;
			for (const b of allowed) {
				const biome = this.table.biomes[b]!;
				const d =
					(biome.t - at.t) * (biome.t - at.t) +
					(biome.h - at.h) * (biome.h - at.h);
				if (d < near) {
					near = d;
					best = b;
				}
			}
			if (best < 0) return;
			this.picked = best;
			this.dragging = true;
			this.chart.setPointerCapture(event.pointerId);
			this.build();
		});
		this.chart.addEventListener("pointermove", (event) => {
			if (!this.dragging) return;
			const at = place(event);
			const biome = this.table.biomes[this.picked];
			if (!biome) return;
			biome.t = at.t;
			biome.h = at.h;
			this.paintChart();
			this.onChange(false);
		});
		const drop = (): void => {
			if (!this.dragging) return;
			this.dragging = false;
			this.settle();
		};
		this.chart.addEventListener("pointerup", drop);
		this.chart.addEventListener("pointercancel", drop);
	}

	// -----------------------------------------------------------------------
	// The table and the grid.
	// -----------------------------------------------------------------------

	private addBiome(): void {
		const from = this.table.biomes[this.picked] ??
			this.table.biomes[0] ?? {
				name: "Biome",
				hex: "93a95e",
				t: 0.5,
				h: 0.5,
				landform: LANDFORMS[this.shown]!.key,
				block: 3,
			};
		this.table.biomes.push({
			...from,
			name: `${from.name} II`,
			landform: LANDFORMS[this.shown]!.key,
			t: Math.min(1, from.t + 0.08),
			h: Math.min(1, from.h + 0.08),
		});
		this.picked = this.table.biomes.length - 1;
		this.settle();
	}

	private removeBiome(at: number): void {
		// A landform with no biome has no answer for its ground, so its last
		// one is declined rather than removed.
		const gone = this.table.biomes[at];
		if (!gone) return;
		const rest = this.table.biomes.filter((_, n) => n !== at);
		const allowed = allowedBiomes(rest);
		if (allowed.some((set) => set.length === 0)) return;
		this.table.biomes = rest;
		if (this.picked >= rest.length) this.picked = rest.length - 1;
		this.settle();
	}

	private buildList(): void {
		this.list.textContent = "";
		const shares = this.facts?.planetShares;
		const allowed = this.allowedNow()[this.shown] ?? [];
		for (const b of allowed) {
			const biome = this.table.biomes[b]!;
			const row = document.createElement("div");
			row.className = "biomes-row" + (b === this.picked ? " picked" : "");
			const chip = document.createElement("span");
			chip.className = "chip";
			chip.style.background = `#${biome.hex}`;
			const name = document.createElement("span");
			name.className = "biomes-name";
			name.textContent = biome.name;
			const share = document.createElement("span");
			share.className = "biomes-share";
			const of = shares?.[b] ?? 0;
			share.textContent = of > 0 ? `${(of * 100).toFixed(1)}%` : "—";
			const drop = document.createElement("button");
			drop.type = "button";
			drop.className = "drop";
			drop.textContent = "×";
			drop.onclick = (event) => {
				event.stopPropagation();
				this.removeBiome(b);
			};
			row.append(chip, name, share, drop);
			row.onclick = () => {
				this.picked = b;
				this.build();
			};
			this.list.append(row);
		}
	}

	private buildChips(): void {
		this.chipRow.textContent = "";
		const shares = this.facts?.formPlanet;
		LANDFORMS.forEach((form, at) => {
			const chip = document.createElement("button");
			chip.type = "button";
			chip.className =
				"biomes-form" + (at === this.shown ? " shown" : "");
			const swatch = document.createElement("span");
			swatch.className = "chip";
			swatch.style.background = `#${form.hex}`;
			const of = shares?.[at] ?? 0;
			chip.append(swatch, `${form.name} ${(of * 100).toFixed(1)}%`);
			chip.onclick = () => {
				this.shown = at;
				const allowed = this.allowedNow()[at] ?? [];
				if (!allowed.includes(this.picked))
					this.picked = allowed[0] ?? this.picked;
				this.build();
			};
			this.chipRow.append(chip);
		});
	}

	private buildGrid(): void {
		this.gridHost.textContent = "";
		const shares = this.facts?.gridShares;
		for (let cont = 0; cont < CONT_BANDS; cont++) {
			const sheetTitle = document.createElement("p");
			sheetTitle.className = "knob-note";
			sheetTitle.textContent = CONT_NAMES[cont]!;
			this.gridHost.append(sheetTitle);
			const sheet = document.createElement("div");
			sheet.className = "biomes-grid";
			sheet.style.gridTemplateColumns = `repeat(${PV_BANDS}, 1fr)`;
			for (let ero = 0; ero < ERO_BANDS; ero++)
				for (let pv = 0; pv < PV_BANDS; pv++) {
					const at = gridAt(cont, ero, pv);
					const form = Number(this.table.grid[at]);
					const cell = document.createElement("button");
					cell.type = "button";
					cell.className = "biomes-cell";
					cell.style.background = `#${LANDFORMS[form]!.hex}55`;
					cell.title = `${ERO_NAMES[ero]} erosion, ${PV_NAMES[pv]} relief`;
					const of = shares?.[at] ?? 0;
					cell.innerHTML =
						`<b>${LANDFORMS[form]!.short}</b>` +
						`<i>${(of * 100).toFixed(1)}%</i>`;
					cell.onclick = () => {
						// A click cycles the cell through the landforms, so
						// the grid is edited by looking rather than typing.
						// The shore is a height rule, never a grid cell.
						const next =
							form >= LANDFORMS.length - 1 ? 1 : form + 1;
						this.table.grid =
							this.table.grid.slice(0, at) +
							String(next) +
							this.table.grid.slice(at + 1);
						this.settle();
					};
					sheet.append(cell);
				}
			this.gridHost.append(sheet);
		}
	}

	private saySelf(): void {
		const biome = this.table.biomes[this.picked];
		if (!biome) {
			this.says.textContent = "";
			return;
		}
		const planet = this.facts?.planetShares[this.picked] ?? 0;
		const patch = this.facts?.patchShares[this.picked] ?? 0;
		this.says.innerHTML =
			`<b>${biome.name}</b> at temperature <b>${biome.t.toFixed(2)}</b>, ` +
			`humidity <b>${biome.h.toFixed(2)}</b> — ` +
			`<b>${(planet * 100).toFixed(1)}%</b> of the planet's land, ` +
			`<b>${(patch * 100).toFixed(1)}%</b> of the patch · stands on ` +
			`<b>${biome.landform === ANY_LANDFORM ? "any ground" : biome.landform}</b>`;
	}

	private build(): void {
		this.presetPick.value = this.table.preset;
		this.buildChips();
		this.paintChart();
		this.saySelf();
		this.buildList();
		this.buildGrid();
	}

	private settle(): void {
		this.build();
		this.onChange(true);
	}

	// -----------------------------------------------------------------------
	// The planet picture.
	// -----------------------------------------------------------------------

	private paintSheet(): void {
		this.paintKind(this.shot, this.shotInk, this.picture);
		for (const mini of this.minis)
			this.paintKind(mini.canvas, mini.ink, mini.picture);
	}

	/**
	 * One field, painted into one canvas out of the held sheet.
	 *
	 * Shared by {@link preview} and every section's own miniature, so a
	 * reader never sees two different colourings of the same field.
	 */
	private paintKind(
		canvas: HTMLCanvasElement,
		ink: CanvasRenderingContext2D,
		kind: BiomePicture,
	): void {
		const sheet = this.sheet;
		if (!sheet) return;
		if (canvas.width !== sheet.width || canvas.height !== sheet.height) {
			canvas.width = sheet.width;
			canvas.height = sheet.height;
		}
		const image = ink.createImageData(sheet.width, sheet.height);
		const px = image.data;
		const count = sheet.width * sheet.height;
		// The biome map colors by block, so a hex is looked up per block once.
		const byBlock = new Map<number, [number, number, number]>();
		for (const biome of this.table.biomes)
			byBlock.set(biome.block, bytesOf(biome.hex));
		const formInk = LANDFORMS.map((form) => bytesOf(form.hex));
		for (let n = 0; n < count; n++) {
			const at = n * 4;
			const sea = sheet.landform[n]! < 0;
			let c: readonly [number, number, number] = SEA_INK;
			if (kind === "biomes") {
				if (!sea) c = byBlock.get(sheet.block[n]!) ?? [255, 0, 255];
			} else if (kind === "landform") {
				if (!sea) c = formInk[sheet.landform[n]!]!;
			} else if (kind === "temperature") {
				c = bytesOfRamp(bandRamp(2 * sheet.t[n]! - 1, HEAT_RAMP));
			} else if (kind === "humidity") {
				c = bytesOfRamp(bandRamp(2 * sheet.h[n]! - 1, WET_RAMP));
			} else if (kind === "push") {
				// The temperature push as banded grey, the humidity push as a
				// contour over it: two washes of colour in one picture read
				// as neither.
				const grey = bandRamp(sheet.pushT[n]!, GREY_RAMP);
				const along = Math.max(
					0,
					Math.min(0.9999, (sheet.pushH[n]! + 1) / 2),
				);
				const into =
					along * PICTURE_BANDS - Math.floor(along * PICTURE_BANDS);
				c = bytesOfRamp(
					into < 0.06
						? [grey[0] * 0.4, grey[1] * 0.45, grey[2] * 0.55]
						: grey,
				);
			} else {
				c = bytesOfRamp(regionColor(sheet.region[n]!));
			}
			px[at] = c[0];
			px[at + 1] = c[1];
			px[at + 2] = c[2];
			px[at + 3] = 255;
		}
		// **Region borders, not the coastline.** A region's own colour
		// already sets it apart from the sea; what this picture needs drawn
		// is where one region gives way to the next.
		if (kind === "regions")
			for (let r = 0; r < sheet.height; r++)
				for (let q = 0; q < sheet.width; q++) {
					const n = r * sheet.width + q;
					if (sheet.landform[n]! < 0) continue;
					const right =
						q + 1 < sheet.width &&
						sheet.region[n]! !== sheet.region[n + 1]!;
					const under =
						r + 1 < sheet.height &&
						sheet.region[n]! !== sheet.region[n + sheet.width]!;
					if (!right && !under) continue;
					const at = n * 4;
					px[at] = 12;
					px[at + 1] = 14;
					px[at + 2] = 18;
				}
		// **The coastline, on every field picture whose own colour would
		// not otherwise say where the ground ends.** A climate map on its
		// own is a set of blobs with nothing to place them against; the
		// line where the ground crosses sea level says which blob is over a
		// continent and which is over open water.
		if (kind === "temperature" || kind === "humidity" || kind === "push")
			for (let r = 0; r < sheet.height; r++)
				for (let q = 0; q < sheet.width; q++) {
					const n = r * sheet.width + q;
					const sea = sheet.landform[n]! < 0;
					const right =
						q + 1 < sheet.width &&
						sea !== sheet.landform[n + 1]! < 0;
					const under =
						r + 1 < sheet.height &&
						sea !== sheet.landform[n + sheet.width]! < 0;
					if (!right && !under) continue;
					const at = n * 4;
					px[at] = 12;
					px[at + 1] = 14;
					px[at + 2] = 18;
				}
		ink.putImageData(image, 0, 0);
	}
}
