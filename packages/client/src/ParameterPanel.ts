import type { KnobRange, PlanetKnobs } from "./PlanetSettings.js";
import {
	KNOB_RANGES,
	LIVE_TERRAIN_KNOBS,
	PlanetSettings,
} from "./PlanetSettings.js";
import {
	MOUNTAIN_SEED_OFFSET,
	TERRAIN_SEED_OFFSET,
	layerNoiseSettings,
	octaveNoise,
	seedFromString,
	splineAt,
} from "chamfer/generation";
import { PLAYER_DEFAULTS } from "chamfer/player";

/** One row of the panel. */
interface Knob {
	readonly key: keyof PlanetKnobs;
	readonly label: string;

	readonly digits?: number;

	/**
	 * Whether this row does anything, given the rest of the draft.
	 *
	 * A row that fails this is disabled rather than hidden: the number is
	 * still there to look at, and turning the knob it depends on back on picks
	 * up wherever this one was left.
	 */
	readonly enabledWhen?: (knobs: PlanetKnobs) => boolean;

	/**
	 * Whether this row is drawn at all, given the rest of the draft.
	 *
	 * A row that fails this is taken off the panel rather than greyed out. It
	 * is for a knob that has no meaning under the current choice -- a jitter
	 * with no feature points to jitter -- where a disabled row would be a
	 * question the reader has to answer before dismissing.
	 */
	readonly shownWhen?: (knobs: PlanetKnobs) => boolean;

	/** Whether the map pane redraws when this moves. */
	readonly map?: boolean;

	/**
	 * What the world got, when that is not what was asked for, as numbers.
	 *
	 * Several of these are requests rather than settings: a puff size and a map
	 * cell are both answered as a lattice level, and a radius moves to whatever
	 * makes the block size exact.
	 */
	readonly given?: (settings: PlanetSettings) => string | null;

	/**
	 * Whether this row is a curve rather than a number.
	 *
	 * A curve is dragged, not slid: across is the layer's own noise value and
	 * up is what it controls, and the shape between two points is what puts an
	 * edge on a region. There is no slider that says that.
	 */
	readonly curve?: boolean;

	/** Named choices, for a knob that is one of a few things rather than a number. */
	readonly choices?: readonly {
		readonly value: string;
		readonly label: string;
	}[];
}

/** One titled run of rows. */
interface Group {
	readonly title: string;

	/** Whether the group starts folded away. */
	readonly folded?: boolean;

	readonly knobs: Knob[];
}

/**
 * What the panel shows, grouped by what a knob decides and ordered by how much
 * of the world it moves.
 *
 * **No prose.** A row is a label, a number and its unit, and under it the
 * bounds the rest of the draft leaves it -- nothing that has to be read. Every
 * knob here moves a picture, so the picture is the explanation.
 */
const GROUPS: Group[] = [
	{
		title: "The terrain layer",
		knobs: [
			{
				key: "terrainCurve",
				map: true,
				label: "Terrain \u2192 base height",
				curve: true,
				enabledWhen: (k) => k.coarseMap && !k.plain,
			},
			{
				key: "terrainScale",
				map: true,
				label: "Terrain scale",
				digits: 0,
				enabledWhen: (k) => k.coarseMap && !k.plain,
			},
			{
				key: "terrainOctaves",
				map: true,
				label: "Terrain octaves",
				digits: 0,
				enabledWhen: (k) => k.coarseMap && !k.plain,
			},
			{
				key: "terrainPersistence",
				map: true,
				label: "Terrain persistence",
				digits: 2,
				enabledWhen: (k) => k.coarseMap && !k.plain,
			},
			{
				key: "terrainLacunarity",
				map: true,
				label: "Terrain lacunarity",
				digits: 2,
				enabledWhen: (k) => k.coarseMap && !k.plain,
			},
			{
				key: "terrainOffsetX",
				map: true,
				label: "Terrain offset X",
				digits: 0,
				enabledWhen: (k) => k.coarseMap && !k.plain,
			},
			{
				key: "terrainOffsetY",
				map: true,
				label: "Terrain offset Y",
				digits: 0,
				enabledWhen: (k) => k.coarseMap && !k.plain,
			},
			{
				key: "coarseMap",
				map: true,
				label: "Height map",
				enabledWhen: (k) => !k.plain,
			},
		],
	},
	{
		title: "The mountain layer",
		knobs: [
			{
				key: "mountainLayer",
				map: true,
				label: "Mountain layer",
				enabledWhen: (k) => k.coarseMap && !k.plain,
			},
			{
				key: "merge",
				map: true,
				label: "Mountains",
				choices: [
					{ value: "gated", label: "Above the line" },
					{ value: "roughen", label: "Roughen" },
				],
				enabledWhen: (k) => k.coarseMap && !k.plain && k.mountainLayer,
			},
			{
				key: "mountainLine",
				map: true,
				label: "Mountain line",
				digits: 2,
				enabledWhen: (k) => k.coarseMap && !k.plain && k.mountainLayer,
				shownWhen: (k) => k.merge === "gated",
			},
			{
				key: "mountainDetail",
				map: true,
				label: "Detail on top",
				digits: 2,
				enabledWhen: (k) => k.coarseMap && !k.plain && k.mountainLayer,
			},
			{
				key: "peakScale",
				map: true,
				label: "Peak scale",
				digits: 1,
				enabledWhen: (k) => k.coarseMap && !k.plain && k.mountainLayer,
			},
			{
				key: "mountainCurve",
				map: true,
				label: "Mountain \u2192 range height",
				curve: true,
				enabledWhen: (k) => k.coarseMap && !k.plain && k.mountainLayer,
			},
			{
				key: "mountainScale",
				map: true,
				label: "Mountain scale",
				digits: 0,
				enabledWhen: (k) => k.coarseMap && !k.plain && k.mountainLayer,
			},
			{
				key: "mountainOctaves",
				map: true,
				label: "Mountain octaves",
				digits: 0,
				enabledWhen: (k) => k.coarseMap && !k.plain && k.mountainLayer,
			},
			{
				key: "mountainPersistence",
				map: true,
				label: "Mountain persistence",
				digits: 2,
				enabledWhen: (k) => k.coarseMap && !k.plain && k.mountainLayer,
			},
			{
				key: "mountainLacunarity",
				map: true,
				label: "Mountain lacunarity",
				digits: 2,
				enabledWhen: (k) => k.coarseMap && !k.plain && k.mountainLayer,
			},
			{
				key: "mountainOffsetX",
				map: true,
				label: "Mountain offset X",
				digits: 0,
				enabledWhen: (k) => k.coarseMap && !k.plain && k.mountainLayer,
			},
			{
				key: "mountainOffsetY",
				map: true,
				label: "Mountain offset Y",
				digits: 0,
				enabledWhen: (k) => k.coarseMap && !k.plain && k.mountainLayer,
			},
		],
	},
	{
		title: "How high and how wet",
		knobs: [
			{
				key: "landFraction",
				map: true,
				label: "Land",
				digits: 2,
				enabledWhen: (k) => k.coarseMap && !k.plain,
			},
			{
				key: "seaLevel",
				map: true,
				label: "Sea level",
				digits: 0,
				enabledWhen: (k) => k.coarseMap && !k.plain,
			},
			{
				key: "relief",
				map: true,
				label: "Relief",
				digits: 0,
				enabledWhen: (k) => k.coarseMap && !k.plain,
			},
			{
				key: "seaDepth",
				map: true,
				label: "Sea depth",
				digits: 0,
				enabledWhen: (k) => k.coarseMap && !k.plain,
			},
		],
	},
	{
		title: "How finely it is drawn",
		folded: true,
		knobs: [
			{
				key: "coarseSpacing",
				map: true,
				label: "Map cell",
				digits: 0,
				enabledWhen: (k) => k.coarseMap && !k.plain,
				given: (s) =>
					Math.abs(s.coarseCell - s.knobs.coarseSpacing) < 1
						? null
						: `${s.coarseCell.toFixed(0)} m, level ${s.coarseLevel}`,
			},
			{
				key: "subdivisionDepth",
				map: true,
				label: "Depth",
				digits: 0,
				given: (s) =>
					`${s.radius.toFixed(0)} m radius, ${(10 * 4 ** s.depth + 2).toLocaleString("en-US")} cells a layer`,
			},
		],
	},
	{
		title: "The cell grid",
		folded: true,
		knobs: [
			{
				key: "blockSize",
				label: "Block size",
				digits: 2,
			},
			{
				key: "chunkCells",
				label: "Chunk",
				digits: 0,
			},
			{
				key: "crustMetres",
				label: "Crust reaches",
				digits: 0,
				given: (s) =>
					s.crustCap === "asked"
						? null
						: `${(s.crustDepth * s.knobs.blockSize).toFixed(0)} m, ${s.crustDepth} layers`,
			},
		],
	},
	{
		title: "Paused",
		folded: true,
		knobs: [
			{
				key: "plain",
				label: "Plain planet",
			},
		],
	},
	{
		title: "The air",
		folded: true,
		knobs: [
			{
				key: "atmosphereTop",
				label: "Air reaches",
				digits: 0,
				enabledWhen: (k) => !k.plain,
			},
			{
				key: "zenithDepth",
				label: "Depth overhead",
				digits: 3,
				enabledWhen: (k) => !k.plain,
			},
		],
	},
	{
		title: "Time",
		folded: true,
		knobs: [
			{
				key: "dayLength",
				label: "Day",
				digits: 0,
				enabledWhen: (k) => !k.plain,
			},
			{
				key: "paused",
				label: "Pause",
				enabledWhen: (k) => !k.plain,
			},
			{
				key: "timeOfDay",
				label: "Time of day",
				digits: 2,
				enabledWhen: (k) => !k.plain,
			},
		],
	},
	{
		title: "The sea",
		folded: true,
		knobs: [
			{
				key: "seaDrawn",
				label: "Draw the sea",
				enabledWhen: (k) => !k.plain,
			},
			{
				key: "waveHeight",
				label: "Wave height",
				digits: 1,
				enabledWhen: (k) => !k.plain,
			},
			{
				key: "waveScale",
				label: "Between crests",
				digits: 0,
				enabledWhen: (k) => !k.plain,
			},
			{
				key: "waveSpeed",
				label: "Wave speed",
				digits: 2,
				enabledWhen: (k) => !k.plain,
			},
			{
				key: "seaWireframe",
				label: "Show the mesh",
				enabledWhen: (k) => !k.plain && k.seaDrawn,
			},
			{
				key: "seaChop",
				label: "Chop",
				digits: 1,
				enabledWhen: (k) => !k.plain,
			},
			{
				key: "seaFoam",
				label: "Foam",
				digits: 2,
				enabledWhen: (k) => !k.plain,
			},
			{
				key: "seaOpacity",
				label: "How solid",
				digits: 2,
				enabledWhen: (k) => !k.plain,
			},
			{
				key: "seaClarity",
				label: "See into it",
				digits: 0,
				enabledWhen: (k) => !k.plain,
			},
			{
				key: "seaGlint",
				label: "Sun on the water",
				digits: 2,
				enabledWhen: (k) => !k.plain,
			},
		],
	},
	{
		title: "The clouds",
		folded: true,
		knobs: [
			{
				key: "cloudsDrawn",
				label: "Draw the clouds",
				enabledWhen: (k) => !k.plain,
			},
			{
				key: "lowDeck",
				label: "Low deck",
				digits: 0,
				enabledWhen: (k) => !k.plain,
			},
			{
				key: "highDeck",
				label: "High deck",
				digits: 0,
				enabledWhen: (k) => !k.plain,
			},
			{
				key: "cloudPuff",
				label: "Puff",
				digits: 0,
				enabledWhen: (k) => !k.plain,
			},
			{
				key: "cloudClusters",
				label: "Formations",
				digits: 0,
				enabledWhen: (k) => !k.plain,
			},
			{
				key: "cloudDensity",
				label: "Puffs each",
				digits: 0,
				enabledWhen: (k) => !k.plain,
			},
			{
				key: "cloudSpread",
				label: "Formation across",
				digits: 0,
				enabledWhen: (k) => !k.plain,
			},
		],
	},
	{
		title: "The grid",
		folded: true,
		knobs: [
			{
				key: "gridMode",
				label: "Grid",
			},
			{
				key: "gridLevels",
				label: "Levels",
				shownWhen: (k) => k.gridMode,
			},
			{
				key: "gridCells",
				label: "Cells",
				shownWhen: (k) => k.gridMode,
			},
			{
				key: "gridChunks",
				label: "Chunks",
				shownWhen: (k) => k.gridMode,
			},
			{
				key: "gridFaces",
				label: "Faces",
				shownWhen: (k) => k.gridMode,
			},
		],
	},
	{
		title: "Drawing",
		folded: true,
		knobs: [
			{
				key: "detail",
				label: "Full detail to",
				digits: 1,
			},
			{
				key: "buildCull",
				label: "Build only what is in view",
			},
			{
				key: "cullMargin",
				label: "Keep beyond the view",
				digits: 0,
				shownWhen: (k) => k.buildCull,
			},
			{
				key: "nearestFirst",
				label: "Build nearest first",
			},
			{
				key: "apron",
				label: "Apron",
			},
			{
				key: "seamOverlay",
				label: "Seam overlay",
			},
			{
				key: "freezeView",
				label: "Freeze view",
			},
		],
	},
	{
		title: "The player",
		folded: true,
		knobs: [
			{
				key: "walkSpeed",
				label: "Walk speed",
				digits: 1,
			},
		],
	},
];

/**
 * A bench for choosing numbers by looking at the result.
 *
 * Describing a planet's size to somebody and asking whether it reads well is
 * slow and inexact. This turns the numbers into sliders beside the world they
 * make, so the question is answered by looking rather than by arguing.
 *
 * **Scaffolding, not a feature.** It appears behind `?panel=1` and nowhere
 * else, and it comes out when the numbers it was built to settle are settled.
 *
 * A knob that changes what the world *is* reloads the page with the new
 * settings in the query string, which rebuilds everything from the top and
 * leaves a link to what was being looked at. One that only changes how the
 * world is drawn is handed straight to the caller.
 */
/** One built row, held onto so {@link ParameterPanel.refresh} can update it. */
interface Row {
	readonly knob: Knob;
	readonly wrap: HTMLElement;
	readonly input: HTMLInputElement;
	readonly write: () => void;
}

export class ParameterPanel {
	private readonly root: HTMLElement;
	private readonly draft: PlanetKnobs;
	private readonly onLive: (settings: PlanetSettings) => void;

	/** Told whenever the draft moves, so a pane drawing from it can keep up. */
	private readonly onDraft: (settings: PlanetSettings) => void;

	/**
	 * Told when a knob in {@link LIVE_TERRAIN_KNOBS} moves and **Live
	 * rebuild** is on, instead of the knob only marking the Rebuild button
	 * dirty. Never called for a knob outside that set: those still need the
	 * device and the address width a full reload gives them.
	 */
	private readonly onLiveRebuild: (settings: PlanetSettings) => void;
	private readonly rows: Row[] = [];

	/** Each named part's own element, so another pane can host one. */
	private readonly sections = new Map<string, HTMLElement>();
	private problems!: HTMLElement;
	private derived!: HTMLElement;
	private applyButton!: HTMLButtonElement;
	private dirty = false;

	/**
	 * Whether a knob in {@link LIVE_TERRAIN_KNOBS} rebuilds the terrain on the
	 * spot rather than waiting for **Rebuild**.
	 *
	 * Off by default. A live rebuild runs on the thread that draws -- there is
	 * no worker for it, the way the map preview has one -- so a big map and a
	 * fast drag can still be felt as a stutter. The checkbox is how someone
	 * opts into that trade rather than finding it turned on for them.
	 */
	private liveRebuild = false;

	constructor(
		settings: PlanetSettings,
		onLive: (settings: PlanetSettings) => void,
		onDraft: (settings: PlanetSettings) => void = () => {},
		onLiveRebuild: (settings: PlanetSettings) => void = () => {},
	) {
		this.draft = { ...settings.knobs };
		this.onLive = onLive;
		this.onDraft = onDraft;
		this.onLiveRebuild = onLiveRebuild;
		this.root = document.createElement("aside");
		this.root.className = "knobs";
		this.build();
		document.body.appendChild(this.root);
	}

	/**
	 * One named part's element, for a pane that wants to hold it instead.
	 *
	 * The node is handed over rather than rebuilt, so moving it changes where
	 * it is drawn and nothing else: this panel still owns the draft, the rows
	 * and the settling, and every slider keeps working from wherever it lands.
	 */
	section(title: string): HTMLElement | null {
		return this.sections.get(title) ?? null;
	}

	/** The world the sliders currently describe. */
	get settings(): PlanetSettings {
		return new PlanetSettings(this.draft);
	}

	private build(): void {
		const head = document.createElement("button");
		head.className = "knobs-head";
		head.textContent = "Parameters";
		head.onclick = () => this.root.classList.toggle("shut");
		this.root.appendChild(head);

		const body = document.createElement("div");
		body.className = "knobs-body";
		this.root.appendChild(body);

		const seed = document.createElement("div");
		seed.className = "knob";
		seed.innerHTML =
			'<label>Seed</label><input type="text" spellcheck="false">';
		const seedInput = seed.querySelector("input")!;
		seedInput.value = this.draft.seed;
		seedInput.oninput = () => {
			this.draft.seed = seedInput.value;
			this.touch(true, "seed");
		};
		this.sections.set("Seed", seed);
		body.appendChild(seed);

		// A group is a fold, and only the first is open. Twenty-six rows at one
		// prominence is the thing this release set out to fix, and the order
		// they are in is what each one decides rather than which subsystem
		// happens to read it.
		for (const group of GROUPS) {
			const section = document.createElement("section");
			if (group.folded) section.classList.add("shut");

			const head = document.createElement("h2");
			const toggle = document.createElement("button");
			toggle.className = "knobs-fold";
			toggle.textContent = group.title;
			toggle.onclick = () => section.classList.toggle("shut");
			head.appendChild(toggle);
			section.appendChild(head);

			for (const knob of group.knobs) {
				const row = this.row(knob);
				this.rows.push(row);
				section.appendChild(row.wrap);
			}
			this.sections.set(group.title, section);
			body.appendChild(section);
		}

		this.problems = document.createElement("div");
		this.problems.className = "knobs-problems";
		body.appendChild(this.problems);

		this.derived = document.createElement("div");
		this.derived.className = "knobs-derived";
		body.appendChild(this.derived);

		// **Try it, do not default to it.** A live rebuild runs on the thread
		// that draws, with no worker to keep the frame free the way the map
		// preview's does, so a big map and a fast drag can be felt as a
		// stutter. The checkbox is how that trade is opted into rather than
		// discovered.
		const live = document.createElement("div");
		live.className = "knobs-live";
		live.innerHTML =
			'<label><input type="checkbox"> Live rebuild — flush the terrain ' +
			"and rebuild it on every change, no reload</label>";
		const liveInput = live.querySelector("input")!;
		liveInput.checked = this.liveRebuild;
		liveInput.onchange = () => {
			this.liveRebuild = liveInput.checked;
		};
		body.appendChild(live);

		const bar = document.createElement("div");
		bar.className = "knobs-bar";
		this.applyButton = document.createElement("button");
		this.applyButton.textContent = "Rebuild";
		this.applyButton.onclick = () => this.rebuild();
		const reset = document.createElement("button");
		reset.textContent = "Defaults";
		reset.onclick = () => {
			location.search = "panel=1";
		};
		const copy = document.createElement("button");
		copy.textContent = "Copy link";
		copy.onclick = () => {
			void navigator.clipboard?.writeText(this.href());
		};
		bar.append(this.applyButton, reset, copy);
		body.appendChild(bar);

		this.refresh();
	}

	private row(knob: Knob): Row {
		if (knob.curve) return this.curveRow(knob);
		if (knob.choices) return this.choiceRow(knob);
		const range = KNOB_RANGES[knob.key as string]!;
		const toggle = typeof this.draft[knob.key] === "boolean";
		const wrap = document.createElement("div");
		wrap.className = "knob";
		const digits = knob.digits ?? 0;
		wrap.innerHTML =
			`<label>${knob.label}` +
			(range.rebuilds ? ' <i title="needs a rebuild">&#9679;</i>' : "") +
			// The map pane answers to five knobs and not the other nineteen, and
			// nothing on a slider used to say which. Turning Height scale and
			// watching the map sit still is the shape of complaint this marks.
			(knob.map ? ' <em title="the map redraws for this">map</em>' : "") +
			(toggle ? "" : "<b></b>") +
			`</label><input type="${toggle ? "checkbox" : "range"}">` +
			"<u></u>";

		const input = wrap.querySelector("input")!;
		if (toggle) {
			input.checked = this.draft[knob.key] as unknown as boolean;
		} else {
			input.min = String(range.low);
			input.max = String(range.high);
			input.step = String(range.step);
			input.value = String(this.draft[knob.key]);
		}

		const shown = wrap.querySelector("b");
		const answer = wrap.querySelector("u")!;
		const write = () => {
			if (toggle)
				input.checked = this.draft[knob.key] as unknown as boolean;
			else {
				// The ends move with the rest of the draft, so a combination
				// that cannot be built cannot be dragged to either.
				const live = this.settings.rangeFor(knob.key);
				input.min = String(live.low);
				input.max = String(live.high);
				wrap.classList.toggle(
					"bound",
					live.low > range.low || live.high < range.high,
				);
				input.value = String(this.draft[knob.key]);
				shown!.textContent =
					`${Number(this.draft[knob.key]).toFixed(digits)}` +
					(range.unit ? ` ${range.unit}` : "");
			}
			const given = knob.given?.(this.settings) ?? null;
			const wall = toggle ? null : this.wallOf(knob, range);
			const said = [wall, given].filter(Boolean).join(" ");
			answer.textContent = said;
			answer.classList.toggle("some", said.length > 0);
		};
		write();

		input.oninput = () => {
			const values = this.draft as unknown as Record<
				string,
				number | boolean
			>;
			values[knob.key as string] = toggle
				? input.checked
				: Number.parseFloat(input.value);

			// Dragging a specific time pauses, so the clock does not carry on
			// past whatever was just asked for -- the same as a video scrubber.
			if (knob.key === "timeOfDay")
				(this.draft as unknown as Record<string, boolean>).paused =
					true;

			this.touch(range.rebuilds, knob.key);
		};
		return { knob, wrap, input, write };
	}

	/** The ends this slider has been pulled to, when they are not its own. */
	private wallOf(knob: Knob, range: KnobRange): string | null {
		const live = this.settings.rangeFor(knob.key);
		const unit = range.unit ? ` ${range.unit}` : "";
		const say = (v: number): string =>
			`${v.toFixed(knob.digits ?? 0)}${unit}`;
		const parts: string[] = [];
		if (live.low > range.low) parts.push(`min ${say(live.low)}`);
		if (live.high < range.high) parts.push(`max ${say(live.high)}`);
		return parts.length > 0 ? parts.join(" · ") : null;
	}

	/** A change was made: either hand it over now, or wait for the button. */
	/**
	 * A knob that is a curve, dragged rather than slid.
	 *
	 * Across is the layer's own noise value, `-1` to `1`; up is what it
	 * controls, `0` to `1`. Drag a point to move it, click the empty curve to
	 * add one, shift-click a point to take it away. **The two ends keep their
	 * x** so the curve always spans the whole range and nothing downstream has
	 * to guess what happens past it; their heights are free like every other
	 * point's.
	 *
	 * **The four points it opens with are a starting shape, not the shape.**
	 * Where a drag matters is where the world actually lands on the curve --
	 * noise clusters around its own middle, so equal widths cover wildly
	 * unequal amounts of planet.
	 */
	private curveRow(knob: Knob): Row {
		const wrap = document.createElement("div");
		wrap.className = "knob curved";
		wrap.innerHTML =
			`<label>${knob.label}` +
			' <i title="needs a rebuild">&#9679;</i>' +
			(knob.map ? ' <em title="the map redraws for this">map</em>' : "") +
			'</label><canvas width="280" height="84"></canvas>' +
			"<u>drag \u00b7 click to add \u00b7 shift-click to remove</u>";
		const canvas = wrap.querySelector("canvas")!;
		const g = canvas.getContext("2d")!;
		// **Resolution rather than a bigger box.** The canvas already fills
		// its row at `width: 100%`; what made the curve blurry was drawing it
		// at 260x78 intrinsic pixels and letting CSS stretch that, which on
		// any display denser than one device pixel per CSS pixel is a scaled
		// bitmap. Capped at 2x so a very dense display does not pay for detail
		// nobody's eye resolves.
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		canvas.width = 280 * dpr;
		canvas.height = 84 * dpr;
		const pad = 5 * dpr;
		const toX = (v: number): number =>
			pad + ((v + 1) / 2) * (canvas.width - pad * 2);
		const toY = (v: number): number =>
			canvas.height - pad - v * (canvas.height - pad * 2);
		const fromX = (px: number): number =>
			((px - pad) / (canvas.width - pad * 2)) * 2 - 1;
		const fromY = (py: number): number =>
			(canvas.height - pad - py) / (canvas.height - pad * 2);
		const points = (): [number, number][] =>
			this.draft[knob.key] as unknown as [number, number][];

		/** Which layer this curve reads, from the knob it belongs to. */
		const layer: "terrain" | "mountain" =
			knob.key === "terrainCurve" ? "terrain" : "mountain";

		// **Where the world actually lands on this curve.** Behind the curve
		// is a histogram of the layer's own field over the sphere, sampled the
		// same way the lab's did: noise clusters around its own middle, so
		// equal widths of a curve cover wildly unequal amounts of planet, and
		// the histogram is the only way to see that rather than assume the
		// axis is evenly populated. Recomputed only when the layer's own
		// shape -- not the curve dragged over it -- changes, which is the
		// same reason `refresh()` can call `write()` on every knob move
		// without this row re-sampling the sphere every time.
		const HIST_BINS = 28;
		const HIST_SAMPLES = 1800;
		const GOLDEN = Math.PI * (3 - Math.sqrt(5));
		let histKey = "";
		let hist = new Float32Array(HIST_BINS);
		let histMax = 0;
		const refreshHistogram = (): void => {
			const k = this.draft as unknown as Record<string, number>;
			const key = [
				this.draft.seed,
				k[`${layer}Scale`],
				k[`${layer}Octaves`],
				k[`${layer}Persistence`],
				k[`${layer}Lacunarity`],
				k[`${layer}OffsetX`],
				k[`${layer}OffsetY`],
			].join(":");
			if (key === histKey) return;
			histKey = key;
			const settings = layerNoiseSettings(this.settings.layerFor(layer));
			const offset =
				layer === "terrain"
					? TERRAIN_SEED_OFFSET
					: MOUNTAIN_SEED_OFFSET;
			const seed = (seedFromString(this.draft.seed) + offset) | 0;
			hist = new Float32Array(HIST_BINS);
			histMax = 0;
			for (let n = 0; n < HIST_SAMPLES; n++) {
				const z = 1 - (2 * n + 1) / HIST_SAMPLES;
				const ring = Math.sqrt(Math.max(0, 1 - z * z));
				const a = n * GOLDEN;
				const v = octaveNoise(
					Math.cos(a) * ring,
					z,
					Math.sin(a) * ring,
					seed,
					settings,
				);
				const bin = Math.max(
					0,
					Math.min(
						HIST_BINS - 1,
						Math.floor(((v + 1) / 2) * HIST_BINS),
					),
				);
				hist[bin]! += 1;
				if (hist[bin]! > histMax) histMax = hist[bin]!;
			}
		};

		const draw = (): void => {
			refreshHistogram();
			const curve = points();
			g.clearRect(0, 0, canvas.width, canvas.height);
			g.fillStyle = "#0b0e13";
			g.fillRect(0, 0, canvas.width, canvas.height);
			if (histMax > 0) {
				g.fillStyle = "rgba(111, 208, 255, 0.16)";
				const wide = (canvas.width - pad * 2) / HIST_BINS;
				for (let n = 0; n < HIST_BINS; n++) {
					const tall =
						(hist[n]! / histMax) * (canvas.height - pad * 2);
					if (tall <= 0) continue;
					g.fillRect(
						pad + n * wide,
						canvas.height - pad - tall,
						Math.max(1, wide - 0.5 * dpr),
						tall,
					);
				}
			}
			g.strokeStyle = "#232b36";
			g.beginPath();
			g.moveTo(toX(0), pad);
			g.lineTo(toX(0), canvas.height - pad);
			g.stroke();
			// The gate is drawn on the curve it cuts: Mountain line is a
			// height on this curve's own vertical axis, so saying it as a
			// number in another group would make the reader hold two pictures
			// at once.
			if (knob.key === "terrainCurve" && this.draft.merge === "gated") {
				let low = Infinity;
				let high = -Infinity;
				for (const [, out] of curve) {
					if (out < low) low = out;
					if (out > high) high = out;
				}
				g.strokeStyle = "rgba(255, 180, 84, 0.55)";
				g.setLineDash([3 * dpr, 3 * dpr]);
				g.beginPath();
				const at = toY(low + this.draft.mountainLine * (high - low));
				g.moveTo(pad, at);
				g.lineTo(canvas.width - pad, at);
				g.stroke();
				g.setLineDash([]);
			}
			g.strokeStyle = "#6fd0ff";
			g.lineWidth = 1.5 * dpr;
			g.beginPath();
			for (let px = pad; px <= canvas.width - pad; px++) {
				const y = toY(splineAt(curve, fromX(px)));
				if (px === pad) g.moveTo(px, y);
				else g.lineTo(px, y);
			}
			g.stroke();
			g.fillStyle = "#e8ecf2";
			for (const [x, y] of curve) {
				g.beginPath();
				g.arc(toX(x), toY(y), 3 * dpr, 0, Math.PI * 2);
				g.fill();
			}
		};

		let dragging = -1;
		const spot = (e: PointerEvent): [number, number] => {
			const box = canvas.getBoundingClientRect();
			return [
				((e.clientX - box.left) / box.width) * canvas.width,
				((e.clientY - box.top) / box.height) * canvas.height,
			];
		};
		const nearest = (px: number, py: number): number => {
			const curve = points();
			let best = -1;
			let far = 12 * dpr;
			for (let n = 0; n < curve.length; n++) {
				const d = Math.hypot(
					toX(curve[n]![0]) - px,
					toY(curve[n]![1]) - py,
				);
				if (d < far) {
					far = d;
					best = n;
				}
			}
			return best;
		};
		canvas.addEventListener("pointerdown", (e) => {
			if (wrap.classList.contains("off")) return;
			e.preventDefault();
			const [px, py] = spot(e);
			const at = nearest(px, py);
			const curve = points();
			if (at >= 0 && e.shiftKey) {
				// Never below two, or the curve stops being a curve.
				if (curve.length > 2 && at > 0 && at < curve.length - 1) {
					curve.splice(at, 1);
					draw();
					this.touch(true, knob.key);
				}
				return;
			}
			if (at >= 0) dragging = at;
			else {
				const x = Math.max(-1, Math.min(1, fromX(px)));
				const y = Math.max(0, Math.min(1, fromY(py)));
				curve.push([x, y]);
				curve.sort((a, b) => a[0] - b[0]);
				dragging = curve.findIndex((q) => q[0] === x && q[1] === y);
				draw();
				this.touch(true, knob.key);
			}
			canvas.setPointerCapture(e.pointerId);
		});
		canvas.addEventListener("pointermove", (e) => {
			if (dragging < 0) return;
			const curve = points();
			const [px, py] = spot(e);
			const first = dragging === 0;
			const last = dragging === curve.length - 1;
			if (!first && !last)
				curve[dragging]![0] = Math.max(
					curve[dragging - 1]![0] + 0.01,
					Math.min(curve[dragging + 1]![0] - 0.01, fromX(px)),
				);
			curve[dragging]![1] = Math.max(0, Math.min(1, fromY(py)));
			draw();
			this.touch(true, knob.key);
		});
		const drop = (): void => {
			dragging = -1;
		};
		canvas.addEventListener("pointerup", drop);
		canvas.addEventListener("pointercancel", drop);

		draw();
		return {
			knob,
			wrap,
			input: canvas as unknown as HTMLInputElement,
			write: draw,
		};
	}

	/** A knob that is one of a few named things rather than a number. */
	private choiceRow(knob: Knob): Row {
		const wrap = document.createElement("div");
		wrap.className = "knob";
		wrap.innerHTML =
			`<label>${knob.label}` +
			' <i title="needs a rebuild">&#9679;</i>' +
			(knob.map ? ' <em title="the map redraws for this">map</em>' : "") +
			`</label><select></select>`;
		const select = wrap.querySelector("select")!;
		for (const choice of knob.choices!) {
			const option = document.createElement("option");
			option.value = choice.value;
			option.textContent = choice.label;
			select.appendChild(option);
		}
		select.value = String(this.draft[knob.key]);
		select.onchange = () => {
			(this.draft as unknown as Record<string, string>)[knob.key] =
				select.value;
			this.touch(true, knob.key);
		};
		return {
			knob,
			wrap,
			input: select as unknown as HTMLInputElement,
			write: () => {
				select.value = String(this.draft[knob.key]);
				select.disabled = knob.enabledWhen
					? !knob.enabledWhen(this.draft)
					: false;
				wrap.classList.toggle("off", select.disabled);
			},
		};
	}

	private touch(rebuilds: boolean, key: keyof PlanetKnobs): void {
		// Pull every knob inside the range the rest of the draft leaves it,
		// before anything downstream reads one. A slider that cannot reach a
		// refusal is worth more than a refusal that explains itself.
		Object.assign(this.draft, PlanetSettings.settle(this.draft));
		this.onDraft(this.settings);
		if (rebuilds) {
			this.dirty = true;
			this.applyButton.classList.add("wants");
			// **Live rebuild only ever reaches the terrain.** The device, the
			// chunk address width and the crust are still a real reload's job
			// -- this panel has no way to know a knob outside
			// `LIVE_TERRAIN_KNOBS` is safe to swap under a running world, so it
			// does not try. `dirty` stays set either way: a live rebuild shows
			// the new ground, not the new sea radius or the new sky, so
			// Rebuild is still the way to see everything the knob changed.
			if (this.liveRebuild && this.settings.problems().length === 0) {
				if (LIVE_TERRAIN_KNOBS.has(key))
					this.onLiveRebuild(this.settings);
			}
		} else {
			this.onLive(this.settings);
		}
		this.refresh();
	}

	private href(): string {
		const params = this.settings.toParams();
		params.set("panel", "1");
		return `${location.pathname}?${params.toString()}`;
	}

	private rebuild(): void {
		if (this.settings.problems().length > 0) return;
		location.href = this.href();
	}

	/** Show what follows from the sliders, and anything that stops a rebuild. */
	private refresh(): void {
		const settings = this.settings;

		for (const row of this.rows) {
			// A row with no meaning under the current choices comes off the
			// panel, so nothing has to be read and dismissed.
			const shown = row.knob.shownWhen?.(this.draft) ?? true;
			row.wrap.hidden = !shown;
			if (!shown) continue;
			row.write();
			const on = row.knob.enabledWhen?.(this.draft) ?? true;
			row.input.disabled = !on;
			row.wrap.classList.toggle("off", !on);
		}

		const trouble = settings.problems();
		this.problems.innerHTML = trouble
			.map((line) => `<p>${line}</p>`)
			.join("");
		this.problems.classList.toggle("some", trouble.length > 0);
		this.applyButton.disabled = trouble.length > 0;
		this.applyButton.classList.toggle(
			"wants",
			this.dirty && !trouble.length,
		);

		const cells = 10 * 4 ** settings.depth + 2;
		this.derived.innerHTML =
			`<span>depth <b>${settings.depth}</b></span>` +
			`<span>radius <b>${settings.radius.toFixed(0)} m</b></span>` +
			`<span>chunk <b>${settings.chunkSpan.toFixed(0)} m</b></span>` +
			`<span>chunk level <b>${settings.chunkLevel}</b></span>` +
			(settings.knobs.coarseMap
				? `<span>map cell <b>${settings.coarseCell.toFixed(0)} m</b>, level <b>${settings.coarseLevel}</b></span>` +
					`<span>terrain <b>${settings.knobs.terrainScale.toFixed(0)} m</b> down to <b>${settings.narrowestOf("terrain").toFixed(0)} m</b>, over <b>${settings.knobs.terrainOctaves}</b> octaves</span>` +
					(settings.knobs.mountainLayer
						? `<span>mountains <b>${settings.knobs.mountainScale.toFixed(0)} m</b> down to <b>${settings.narrowestOf("mountain").toFixed(0)} m</b>, over <b>${settings.knobs.mountainOctaves}</b> octaves</span>`
						: `<span>mountain layer <b>off</b></span>`)
				: `<span>height map <b>off</b></span>`) +
			// The camera's own height, not a figure typed in beside it: the two
			// drifted apart the moment one of them moved.
			`<span>horizon at eye height <b>${(settings.radius * Math.acos(settings.radius / (settings.radius + PLAYER_DEFAULTS.eyeHeight))).toFixed(0)} m</b></span>` +
			`<span>crust <b>${settings.crustDepth}</b> layers</span>` +
			`<span>tallest ground <b>${settings.maxElevation} m</b></span>` +
			`<span>cells a layer <b>${cells.toLocaleString("en-US")}</b></span>` +
			`<span>cell address <b>${settings.addressBits} bits</b></span>`;
	}
}
