import type { BiomeCloud, BiomeSheet, BiomesFacts } from "./BiomesMessage.js";
import type { BiomeTableDraft } from "./BiomeDraft.js";
import {
	ANY_LANDFORM,
	BIOME_PRESETS,
	BlockType,
	CONT_BANDS,
	CONT_NAMES,
	ERO_BANDS,
	ERO_NAMES,
	LANDFORMS,
	PV_BANDS,
	PV_NAMES,
	RISE_NAMES,
	allowedBiomes,
	biomeOf,
	gridAt,
	hash3,
} from "chamfer/generation";
import { biomeTableOf } from "./BiomeDraft.js";
import { outlinePatch } from "./outlinePatch.js";
import { paintPatch } from "./paintPatch.js";

/** What the "Start from" select reads for a preset, by key. */
const PRESET_LABELS: Record<string, string> = {
	plainElevation: "Plain, banded by elevation",
};

/** What one of the panel's pictures shows. */
export type BiomePicture =
	| "biomes"
	| "ground"
	| "landform"
	| "temperature"
	| "humidity"
	| "push"
	| "regions";

/**
 * Which of a build's two rectangles this panel reads: the whole planet's
 * land, or the patch in view.
 *
 * **One flag for two questions that turn out to be the same question.** The
 * diagram's cloud and every share on this panel both answer "where", and a
 * reader picks one place to look at once rather than choosing it twice.
 */
export type BiomeSpread = "planet" | "patch";

const SPREADS: readonly { value: BiomeSpread; label: string }[] = [
	{ value: "planet", label: "the planet" },
	{ value: "patch", label: "the patch" },
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

/** One entry a `<select>` groups under an `<optgroup>`. */
interface GroupedOption {
	readonly group: string;
	readonly value: number;
	readonly label: string;
}

/**
 * Every biome's own ground, grouped by the preset it came from.
 *
 * **The label a biome already carries, not one built from its block's own
 * name.** Two presets both name a block "Steppe ground" for reasons that have
 * nothing to do with each other, so the group is what disambiguates rather
 * than a prefix stitched onto every label.
 */
function groundOptions(): readonly GroupedOption[] {
	const out: GroupedOption[] = [];
	for (const [preset, set] of Object.entries(BIOME_PRESETS))
		for (const biome of set)
			out.push({
				group: PRESET_LABELS[preset] ?? preset,
				value: biome.block,
				label: biome.name,
			});
	return out;
}

/**
 * The materials a biome may cut into below its own surface.
 *
 * **A short, curated list rather than every block there is** — most biomes
 * want plain dirt, and the rest want one of a handful of raw materials rather
 * than another biome's own dedicated ground.
 */
const UNDERLAY_OPTIONS: readonly { value: number; label: string }[] = [
	{ value: BlockType.STONE, label: "Stone" },
	{ value: BlockType.SAND, label: "Sand" },
	{ value: BlockType.SANDSTONE, label: "Sandstone" },
	{ value: BlockType.TERRACOTTA, label: "Terracotta" },
	{ value: BlockType.SNOW, label: "Snow" },
];

/** A `<select>` grouped under an `<optgroup>` per {@link GroupedOption.group}. */
function selectOfGrouped(
	options: readonly GroupedOption[],
	value: number,
): HTMLSelectElement {
	const pick = document.createElement("select");
	const groups = new Map<string, HTMLOptGroupElement>();
	for (const opt of options) {
		let group = groups.get(opt.group);
		if (!group) {
			group = document.createElement("optgroup");
			group.label = opt.group;
			groups.set(opt.group, group);
			pick.append(group);
		}
		const option = document.createElement("option");
		option.value = String(opt.value);
		option.textContent = opt.label;
		group.append(option);
	}
	pick.value = String(value);
	return pick;
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

	/**
	 * "Biomes spread" -- which of the build's two rectangles this whole panel
	 * reads: the diagram's cloud of dots, the chip row, the biome list, the
	 * grid, and the line under the diagram all take this one flag, because a
	 * share or a dot with no name for which of two places it is worth is
	 * something a reader has to remember rather than read.
	 */
	spread: BiomeSpread = "planet";

	/** The continentalness band {@link buildGrid} is showing. */
	gridBand = 1;

	/**
	 * The height sheet on show.
	 *
	 * **A second selector rather than a fourth dimension drawn flat.** The
	 * grid is four axes and a table is two, so two of them pick the sheet
	 * and two are read across it -- and the pair that picks is the pair a
	 * reader switches between rather than compares side by side.
	 */
	gridRise = 1;

	/** The grid cell last clicked, for its outline and the select below it. */
	cellPicked = gridAt(1, 1, 1, 1);

	/**
	 * The finished biome map, always this one picture.
	 *
	 * **Built here and mounted by the page, not appended to this panel's own
	 * scroller.** The lab keeps the map in the world panel's head, beside the
	 * facts a build measured -- it is what every other picture on this panel
	 * is judged against, not one more row of the table that reads it. Every
	 * other field gets its own picture where the knobs that tune it are; this
	 * is the only one with nothing to select, because there is only ever one
	 * of it.
	 */
	readonly preview: HTMLElement;

	/**
	 * One field's own picture, built for each section that tunes it to mount
	 * at its own top.
	 *
	 * **Left-click moves the patch to the place clicked; right-click enlarges
	 * it.** Every picture here is a picture of the whole planet, so a click
	 * always names a place rather than a patch to jump to -- the same two
	 * actions {@link preview} itself answers to.
	 */
	readonly miniGround: HTMLElement;
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
	private readonly onMove: (latitude: number, longitude: number) => void;

	private readonly root: HTMLElement;
	private readonly chipRow: HTMLElement;
	private readonly chart: HTMLCanvasElement;
	private readonly chartInk: CanvasRenderingContext2D;
	private readonly says: HTMLElement;
	private readonly list: HTMLElement;
	private readonly gridTabs: HTMLElement;
	private readonly gridHost: HTMLElement;
	private readonly gridPick: HTMLSelectElement;
	private readonly shot: HTMLCanvasElement;
	private readonly shotInk: CanvasRenderingContext2D;
	private readonly presetPick: HTMLSelectElement;

	/**
	 * One picture, large.
	 *
	 * **A field at panel width says where its features are; at this size it
	 * says what they look like.** Built once and reused for whichever picture
	 * was last right-clicked, the same held sheet just painted into a bigger
	 * canvas -- there is no sharper reading to resample to, so the picture
	 * a reader gets here is the same pixels, larger.
	 */
	private readonly big: HTMLElement;
	private readonly bigCanvas: HTMLCanvasElement;
	private readonly bigInk: CanvasRenderingContext2D;
	private readonly bigName: HTMLElement;
	private bigShown: BiomePicture | null = null;

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
			spread?: BiomeSpread;
			onPicture?: () => void;
			onMove?: (latitude: number, longitude: number) => void;
		} = {},
	) {
		this.table = table;
		this.onChange = onChange;
		this.onPicture = options.onPicture ?? ((): void => {});
		this.onMove = options.onMove ?? ((): void => {});
		this.spread = options.spread ?? "planet";

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

		// The preset the table starts from, and the two other diagram-wide
		// knobs -- built here so `this.presetPick` exists for {@link build},
		// mounted at the bottom once the grid is in place (see below).
		this.presetPick = document.createElement("select");
		for (const name of Object.keys(BIOME_PRESETS)) {
			const option = document.createElement("option");
			option.value = name;
			option.textContent = PRESET_LABELS[name] ?? name;
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

		// The finished map, built for the page to mount wherever the world's
		// own picture belongs -- the world panel's head, not this panel's
		// scroller. Always the biomes reading: every other field has its own
		// picture below, and this is the one every one of them is judged
		// against.
		this.preview = document.createElement("div");
		this.preview.className = "biomes-preview";
		this.shot = document.createElement("canvas");
		this.shot.className = "biomes-shot";
		this.shotInk = this.shot.getContext("2d")!;
		this.watchShot(this.shot, "biomes", "Biomes");
		this.preview.append(this.shot);

		// **One picture per section, painted from the same held sheet.** The
		// lab keeps a field's picture where the knobs that tune it are, so
		// the thing being judged never scrolls away from the row being
		// turned.
		this.miniGround = this.buildMini("ground", null, "Terrain");
		this.miniLandform = this.buildMini("landform", null, "Landform");
		this.miniRegions = this.buildMini("regions", null, "Regions");
		this.miniTemperature = this.buildMini(
			"temperature",
			"heat",
			"Temperature",
		);
		this.miniHumidity = this.buildMini("humidity", "wet", "Humidity");
		this.miniPush = this.buildMini("push", "wild", "Biome noise");

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

		// **Its own fold, because the grid answers a different question than
		// the list above it.** The list is which biomes exist; the grid is
		// which of the six landforms every combination of the three terrain
		// curves comes to, one sheet per continentalness band with the
		// other two down and across.
		const gridSection = document.createElement("details");
		gridSection.className = "sub";
		gridSection.open = true;
		const gridSummary = document.createElement("summary");
		gridSummary.textContent = "The landform grid";
		gridSection.append(gridSummary);
		this.gridTabs = document.createElement("div");
		this.gridTabs.className = "biomes-grid-tabs";
		gridSection.append(this.gridTabs);
		this.gridHost = document.createElement("div");
		gridSection.append(this.gridHost);
		const gridFoot = document.createElement("div");
		gridFoot.className = "biomes-sheet-foot";
		gridFoot.innerHTML =
			"<span>valley</span><span>peaks &amp; valleys</span><span>peak</span>";
		gridSection.append(gridFoot);

		// **Edited here rather than in the grid itself.** A click on a cell
		// only ever selects it -- the grid draws six colours a reader has to
		// tell apart on sight, which a click cycling through them would ask
		// twice over; naming the one just clicked is what a select is for.
		const gridPickRow = document.createElement("div");
		gridPickRow.className = "knob";
		const gridPickLabel = document.createElement("label");
		gridPickLabel.textContent = "That cell is";
		this.gridPick = document.createElement("select");
		for (let n = 0; n < LANDFORMS.length; n++) {
			const option = document.createElement("option");
			option.value = String(n);
			option.textContent = LANDFORMS[n]!.name;
			this.gridPick.append(option);
		}
		this.gridPick.oninput = () => {
			this.table.grid =
				this.table.grid.slice(0, this.cellPicked) +
				this.gridPick.value +
				this.table.grid.slice(this.cellPicked + 1);
			this.shown = Number(this.gridPick.value);
			this.settle();
		};
		const gridPickNote = document.createElement("p");
		gridPickNote.className = "knob-note";
		gridPickNote.textContent =
			"three curves' answers and how high the ground stands, each cut " +
			"into bands -- how far inland and how high pick the sheet, " +
			"erosion and relief the cell. Shore is not in the grid, because " +
			"it needs to know how much room the low ground has, which no " +
			"reading here carries";
		gridPickRow.append(gridPickLabel, this.gridPick, gridPickNote);
		gridSection.append(gridPickRow);
		scroller.append(gridSection);

		// **The diagram, at the bottom.** Nothing here is climate: it is
		// which preset the table started from, and which of the two
		// rectangles this whole panel reads -- two questions about how the
		// panel reads a build that already ran, not about the world itself.
		const diagramSection = document.createElement("details");
		diagramSection.className = "sub";
		diagramSection.open = true;
		const diagramSummary = document.createElement("summary");
		diagramSummary.textContent = "The diagram";
		diagramSection.append(diagramSummary);

		const presetRow = document.createElement("div");
		presetRow.className = "knob";
		const presetLabel = document.createElement("label");
		presetLabel.textContent = "Start from";
		presetRow.append(presetLabel, this.presetPick);
		diagramSection.append(presetRow);

		// **A term of the table, not one of the numeric climate knobs** --
		// `humLapse` decides how this table's own climate reads the terrain,
		// the same reason `grid` is edited here rather than in the parameter
		// panel. `elevation` opens with this turned on; `plain` and
		// `holdridge` open with it off.

		// **One flag for the cloud of dots and every count on the panel.**
		// Both answer "where", and asking a reader to set the same answer
		// twice under two different names is asking them to keep the two in
		// sync by hand.
		const spreadRow = document.createElement("div");
		spreadRow.className = "knob";
		const spreadLabel = document.createElement("label");
		spreadLabel.textContent = "Biomes spread";
		const spreadPick = document.createElement("select");
		for (const { value, label } of SPREADS) {
			const option = document.createElement("option");
			option.value = value;
			option.textContent = label;
			spreadPick.append(option);
		}
		spreadPick.value = this.spread;
		const spreadNote = document.createElement("p");
		spreadNote.className = "knob-note";
		const saySpread = (): void => {
			spreadNote.textContent =
				this.spread === "patch"
					? "one dot per hexagon in view, and every share on this panel of the ground in view -- what the camera is standing in, which is one place and not a world"
					: "one dot per cell of the planet, and every share on this panel of the whole planet's land, which is what says whether a biome is worth keeping at all";
		};
		saySpread();
		spreadPick.oninput = () => {
			this.spread = spreadPick.value as BiomeSpread;
			saySpread();
			this.paintChart();
			this.build();
			this.onPicture();
		};
		spreadRow.append(spreadLabel, spreadPick, spreadNote);
		diagramSection.append(spreadRow);
		scroller.append(diagramSection);

		this.big = document.createElement("div");
		this.big.className = "plants-big";
		this.big.hidden = true;
		const bigFigure = document.createElement("figure");
		this.bigCanvas = document.createElement("canvas");
		this.bigInk = this.bigCanvas.getContext("2d")!;
		const bigCaption = document.createElement("figcaption");
		this.bigName = document.createElement("b");
		const bigHint = document.createElement("span");
		bigHint.textContent = "click anywhere to close";
		bigCaption.append(this.bigName, bigHint);
		bigFigure.append(this.bigCanvas, bigCaption);
		this.big.append(bigFigure);
		const closeBig = (): void => {
			this.big.hidden = true;
			this.bigShown = null;
		};
		this.big.onclick = closeBig;
		window.addEventListener("keydown", (event) => {
			if (event.key === "Escape") closeBig();
		});
		document.body.append(this.big);

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
		this.watchShot(canvas, picture, label);
		this.minis.push({ picture, canvas, ink });
		return holder;
	}

	/**
	 * Wires one picture's clicks: left moves the patch to the place clicked,
	 * right enlarges it.
	 *
	 * **Every picture here is the whole planet**, so a click always names a
	 * place rather than jumping between two different questions the way the
	 * lab's own pictures do when one of them shows the patch instead.
	 */
	private watchShot(
		canvas: HTMLCanvasElement,
		kind: BiomePicture,
		label: string,
	): void {
		canvas.addEventListener("click", (event) => {
			const box = canvas.getBoundingClientRect();
			const across = (event.clientX - box.left) / box.width;
			const down = (event.clientY - box.top) / box.height;
			const longitude = Math.max(
				-180,
				Math.min(180, Math.round(across * 360 - 180)),
			);
			const latitude = Math.max(
				-85,
				Math.min(85, Math.round((0.5 - down) * 180)),
			);
			this.onMove(latitude, longitude);
		});
		canvas.addEventListener("contextmenu", (event) => {
			event.preventDefault();
			this.showBig(kind, label);
		});
		canvas.title =
			"click to move the patch here, or right-click to enlarge";
	}

	/**
	 * One picture, large.
	 *
	 * There is no sharper reading to resample to -- the sheet a build sends
	 * back is one fixed resolution -- so this is the same pixels the small
	 * picture already holds, painted into a canvas CSS stretches to fill most
	 * of the window.
	 */
	private showBig(kind: BiomePicture, label: string): void {
		if (!this.sheet) return;
		this.bigShown = kind;
		this.bigName.textContent = label;
		this.big.hidden = false;
		this.paintKind(this.bigCanvas, this.bigInk, kind);
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
		// builds this biome anywhere at all. "Biomes spread" is the one flag
		// that answers which of the two this whole panel is reading.
		if (this.spread === "patch" && this.patchCloud) {
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
		} else if (this.spread === "planet" && this.sheet) {
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
		const shares =
			this.spread === "patch"
				? this.facts?.patchShares
				: this.facts?.planetShares;
		const allowed = this.allowedNow()[this.shown] ?? [];
		// **Everything the table holds, whichever ground is being looked
		// at.** The diagram is a picture of one landform and a dot that is
		// not in it would be a lie, but the list is the table -- and a biome
		// filed to a landform showed under that landform's chip alone, so on
		// Lowlands six of twenty-one were absent with nothing saying they
		// exist. A reader who can see a ground on the planet and cannot find
		// it here has no way to tune it and no way to tell it is in the
		// table at all.
		const here = new Set(allowed);
		const elsewhere = this.table.biomes
			.map((_, b) => b)
			.filter((b) => !here.has(b));
		for (const b of allowed)
			this.list.append(this.listRow(b, shares, true));
		if (elsewhere.length === 0) return;
		const note = document.createElement("div");
		note.className = "biomes-elsewhere";
		note.textContent = "on other ground";
		this.list.append(note);
		for (const b of elsewhere)
			this.list.append(this.listRow(b, shares, false));
	}

	/**
	 * One biome's row.
	 *
	 * `here` is whether this ground is one the landform being shown can
	 * actually build. A row for another landform's ground is dimmed and says
	 * which landform that is, and clicking it moves to that landform rather
	 * than picking a dot the diagram beside it does not draw -- which is
	 * also how a reader learns the rule.
	 */
	private listRow(
		b: number,
		shares: readonly number[] | undefined,
		here: boolean,
	): HTMLElement {
		{
			const biome = this.table.biomes[b]!;
			const row = document.createElement("div");
			row.className =
				"biomes-row" +
				(here && b === this.picked ? " picked" : "") +
				(here ? "" : " away");
			const chip = document.createElement("span");
			chip.className = "chip";
			chip.style.background = `#${biome.hex}`;
			const name = document.createElement("span");
			name.className = "biomes-name";
			name.textContent = biome.name;
			const share = document.createElement("span");
			share.className = "biomes-share";
			const of = shares?.[b] ?? 0;
			const form = LANDFORMS.findIndex((f) => f.key === biome.landform);
			share.textContent = here
				? of > 0
					? `${(of * 100).toFixed(1)}%`
					: "—"
				: (LANDFORMS[form]?.name ?? biome.landform);
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
				if (!here && form >= 0) this.shown = form;
				this.picked = b;
				this.build();
			};
			return row;
		}
	}

	private buildChips(): void {
		this.chipRow.textContent = "";
		const shares =
			this.spread === "patch"
				? this.facts?.formPatch
				: this.facts?.formPlanet;
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
		this.gridTabs.textContent = "";
		// **Two rows of tabs, because the grid has four axes and a table
		// has two.** How far inland picks one sheet and how high picks the
		// other; erosion and relief are read across whichever sheet the two
		// name.
		const tabs = (
			names: readonly string[],
			at: number,
			pick: (n: number) => void,
		): void => {
			const row = document.createElement("div");
			row.className = "biomes-grid-row";
			names.forEach((name, n) => {
				const button = document.createElement("button");
				button.type = "button";
				button.textContent = name;
				button.className = n === at ? "picked" : "";
				button.onclick = () => {
					pick(n);
					this.buildGrid();
				};
				row.append(button);
			});
			this.gridTabs.append(row);
		};
		tabs(CONT_NAMES, this.gridBand, (n) => (this.gridBand = n));
		tabs(RISE_NAMES, this.gridRise, (n) => (this.gridRise = n));

		this.gridHost.textContent = "";
		this.gridHost.className = "biomes-sheet";
		this.gridHost.style.setProperty("--columns", String(PV_BANDS));
		const corner = document.createElement("div");
		corner.className = "corner";
		this.gridHost.append(corner);
		for (let pv = 0; pv < PV_BANDS; pv++) {
			const head = document.createElement("div");
			head.className = "corner";
			head.textContent = PV_NAMES[pv]!;
			this.gridHost.append(head);
		}
		const shares =
			this.spread === "patch"
				? this.facts?.gridPatch
				: this.facts?.gridShares;
		for (let ero = 0; ero < ERO_BANDS; ero++) {
			const edge = document.createElement("div");
			edge.className = "edge";
			edge.textContent = ERO_NAMES[ero]!;
			this.gridHost.append(edge);
			for (let pv = 0; pv < PV_BANDS; pv++) {
				const at = gridAt(this.gridBand, this.gridRise, ero, pv);
				const form = Number(this.table.grid[at]);
				const cell = document.createElement("button");
				cell.type = "button";
				// **Plain, not washed with alpha.** The grid names one
				// landform a cell, and a colour softened toward the panel's
				// own background reads as a fact half-stated.
				cell.style.background = `#${LANDFORMS[form]!.hex}`;
				cell.className = at === this.cellPicked ? "picked" : "";
				const of = shares?.[at] ?? 0;
				cell.innerHTML =
					`${LANDFORMS[form]!.short}` +
					`<small>${of > 0 ? `${(of * 100).toFixed(1)}%` : "—"}</small>`;
				cell.title =
					`${CONT_NAMES[this.gridBand]}, ${RISE_NAMES[this.gridRise]} ` +
					`ground, ${ERO_NAMES[ero]} erosion, ` +
					`${PV_NAMES[pv]} relief → ${LANDFORMS[form]!.name}`;
				// **A click only selects the cell.** Naming a colour by eye
				// against five others is not a decision to make blind on
				// every click; the select below names the one just picked.
				cell.onclick = () => {
					this.cellPicked = at;
					this.shown = form;
					const allowed = this.allowedNow()[this.shown] ?? [];
					if (!allowed.includes(this.picked))
						this.picked = allowed[0] ?? this.picked;
					this.build();
				};
				this.gridHost.append(cell);
			}
		}

		this.gridPick.value = this.table.grid[this.cellPicked] ?? "0";
	}

	/**
	 * Which biome is being edited, what it comes to, and which ground it may
	 * stand on.
	 *
	 * **Where it stands is edited here rather than in the list**, because
	 * changing it can move the biome out of the list this panel is showing --
	 * the control has to outlive the row it would sit in.
	 */
	private saySelf(): void {
		this.says.textContent = "";
		const biome = this.table.biomes[this.picked];
		if (!biome) {
			const form = LANDFORMS[this.shown];
			if (form)
				this.says.innerHTML =
					`<b>${form.name}</b> has no biome, so nothing can be ` +
					`built on it — add one, or move one here`;
			return;
		}
		const shares =
			this.spread === "patch"
				? this.facts?.patchShares
				: this.facts?.planetShares;
		const of = shares?.[this.picked] ?? 0;
		const said = document.createElement("span");
		said.innerHTML =
			`<b>${biome.name}</b> at temperature <b>${biome.t.toFixed(2)}</b>, ` +
			`humidity <b>${biome.h.toFixed(2)}</b> — ` +
			`<b>${of > 0 ? `${(of * 100).toFixed(1)}%` : "—"}</b> of ` +
			`${this.spread === "patch" ? "the patch's land" : "the planet's land"} · stands on `;
		const pickForm = document.createElement("select");
		const anyOption = document.createElement("option");
		anyOption.value = ANY_LANDFORM;
		anyOption.textContent = "any ground";
		pickForm.append(anyOption);
		for (const form of LANDFORMS) {
			const option = document.createElement("option");
			option.value = form.key;
			option.textContent = form.name.toLowerCase();
			pickForm.append(option);
		}
		pickForm.value = biome.landform;
		pickForm.oninput = () => {
			biome.landform = pickForm.value;
			if (biome.landform !== ANY_LANDFORM) {
				const at = LANDFORMS.findIndex((f) => f.key === biome.landform);
				if (at >= 0) this.shown = at;
			}
			this.settle();
		};

		const builtFrom = document.createTextNode(" · built from ");
		const pickBlock = selectOfGrouped(groundOptions(), biome.block);
		pickBlock.oninput = () => {
			biome.block = Number(pickBlock.value);
			this.settle();
		};

		const cutInto = document.createTextNode(", cuts into ");
		const pickUnderlay = document.createElement("select");
		const dirtOption = document.createElement("option");
		dirtOption.value = "";
		dirtOption.textContent = "dirt";
		pickUnderlay.append(dirtOption);
		for (const opt of UNDERLAY_OPTIONS) {
			const option = document.createElement("option");
			option.value = String(opt.value);
			option.textContent = opt.label.toLowerCase();
			pickUnderlay.append(option);
		}
		pickUnderlay.value =
			biome.underlay !== undefined ? String(biome.underlay) : "";
		pickUnderlay.oninput = () => {
			biome.underlay =
				pickUnderlay.value === ""
					? undefined
					: Number(pickUnderlay.value);
			this.settle();
		};

		this.says.append(
			said,
			pickForm,
			builtFrom,
			pickBlock,
			cutInto,
			pickUnderlay,
		);
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
		this.paintKind(this.shot, this.shotInk, "biomes");
		for (const mini of this.minis)
			this.paintKind(mini.canvas, mini.ink, mini.picture);
		// The enlarged picture stays live through a rebuild rather than
		// freezing on whatever it held when it was opened.
		if (this.bigShown)
			this.paintKind(this.bigCanvas, this.bigInk, this.bigShown);
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
			// **The one picture that is not a colour by biome or by field.**
			// The ground arrives already tuned through the link, so this
			// reads the same block colours the landscape bench itself draws
			// its Terrain picture in, off nothing but the metres a cell
			// stands at.
			if (kind === "ground") {
				paintPatch(px, at, {
					metres: sheet.metres[n]!,
					raw: 0,
					layer: 0,
					rawLow: 0,
					rawHigh: 0,
					low: 0,
					high: 0,
					picture: "ground",
				});
				continue;
			}
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
				// **The sea is masked out here rather than left to the region
				// key.** A region is seeded only on land, but nothing stops a
				// stale or off-by-default key from reaching a sea cell, and a
				// hashed colour there would read as a region under water.
				c = sea ? SEA_INK : bytesOfRamp(regionColor(sheet.region[n]!));
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
		// **Where the patch beside this picture is standing.** Every sheet
		// here is the whole planet, and the diagram, the shares and the
		// three-dimensional patch are all readings taken somewhere on it --
		// without the box a reader has the answer and not the place. The
		// other three benches have drawn it since they had a map; this one
		// was the exception.
		if (this.facts)
			outlinePatch(px, sheet.width, sheet.height, {
				latitude: this.facts.patchAt.latitude,
				longitude: this.facts.patchAt.longitude,
				span: this.facts.span,
				radius: this.facts.patchAt.radius,
			});
		ink.putImageData(image, 0, 0);
	}
}
