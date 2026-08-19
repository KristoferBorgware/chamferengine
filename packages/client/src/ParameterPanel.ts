import type { KnobRange, PlanetKnobs } from "./PlanetSettings.js";
import { KNOB_RANGES, PlanetSettings } from "./PlanetSettings.js";

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
		title: "Where the land is",
		knobs: [
			{
				key: "noiseBasis",
				map: true,
				label: "Noise",
				choices: [
					{ value: "value", label: "Value" },
					{ value: "perlin", label: "Perlin" },
					{ value: "simplex", label: "OpenSimplex2" },
					{ value: "psrd", label: "Psrd" },
					{ value: "cellular", label: "Cellular" },
				],
				enabledWhen: (k) => k.coarseMap && !k.plain,
			},
			{
				key: "cellFeature",
				map: true,
				label: "Cells",
				choices: [
					{ value: "f1", label: "Nearest" },
					{ value: "f2f1", label: "Seams" },
				],
				enabledWhen: (k) => k.coarseMap && !k.plain,
				shownWhen: (k) => k.noiseBasis === "cellular",
			},
			{
				key: "jitter",
				map: true,
				label: "Jitter",
				digits: 2,
				enabledWhen: (k) => k.coarseMap && !k.plain,
				shownWhen: (k) => k.noiseBasis === "cellular",
			},
			{
				key: "spin",
				map: true,
				label: "Spin",
				digits: 2,
				enabledWhen: (k) => k.coarseMap && !k.plain,
				shownWhen: (k) => k.noiseBasis === "psrd",
			},
			{
				key: "noiseScale",
				map: true,
				label: "Noise scale",
				digits: 0,
				enabledWhen: (k) => k.coarseMap && !k.plain,
			},
			{
				key: "octaves",
				map: true,
				label: "Octaves",
				digits: 0,
				enabledWhen: (k) => k.coarseMap && !k.plain,
			},
			{
				key: "persistence",
				map: true,
				label: "Persistence",
				digits: 2,
				enabledWhen: (k) => k.coarseMap && !k.plain,
			},
			{
				key: "lacunarity",
				map: true,
				label: "Lacunarity",
				digits: 2,
				enabledWhen: (k) => k.coarseMap && !k.plain,
			},
			{
				key: "ridge",
				map: true,
				label: "Ridges",
				digits: 2,
				enabledWhen: (k) => k.coarseMap && !k.plain,
			},
			{
				key: "seaDepth",
				map: true,
				label: "Sea depth",
				digits: 0,
				enabledWhen: (k) => k.coarseMap && !k.plain,
			},
			{
				key: "warpAmplitude",
				map: true,
				label: "Warp",
				digits: 2,
				enabledWhen: (k) => k.coarseMap && !k.plain,
			},
			{
				key: "warpScale",
				map: true,
				label: "Warp scale",
				digits: 0,
				enabledWhen: (k) => k.coarseMap && !k.plain,
				shownWhen: (k) => k.warpAmplitude > 0,
			},
			{
				key: "landFraction",
				map: true,
				label: "Land",
				digits: 2,
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
				key: "offsetX",
				map: true,
				label: "Offset X",
				digits: 0,
				enabledWhen: (k) => k.coarseMap && !k.plain,
			},
			{
				key: "offsetY",
				map: true,
				label: "Offset Y",
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
				key: "radius",
				map: true,
				label: "Radius",
				digits: 0,
				given: (s) =>
					Math.abs(s.radius - s.knobs.radius) < 1
						? null
						: `${s.radius.toFixed(0)} m, depth ${s.depth}`,
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
				given: (s) =>
					Math.abs(s.cloudPuff - s.knobs.cloudPuff) < 1
						? null
						: `${s.cloudPuff.toFixed(0)} m, level ${s.cloudLevel}`,
			},
			{
				key: "cloudShells",
				label: "Shells",
				digits: 0,
				enabledWhen: (k) => !k.plain,
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
				key: "apron",
				label: "Apron",
			},
			{
				key: "seamOverlay",
				label: "Seam overlay",
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
	private readonly rows: Row[] = [];

	/** Each named part's own element, so another pane can host one. */
	private readonly sections = new Map<string, HTMLElement>();
	private problems!: HTMLElement;
	private derived!: HTMLElement;
	private applyButton!: HTMLButtonElement;
	private dirty = false;

	constructor(
		settings: PlanetSettings,
		onLive: (settings: PlanetSettings) => void,
		onDraft: (settings: PlanetSettings) => void = () => {},
	) {
		this.draft = { ...settings.knobs };
		this.onLive = onLive;
		this.onDraft = onDraft;
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
			this.touch(true);
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

			this.touch(range.rebuilds);
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
			this.touch(true);
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

	private touch(rebuilds: boolean): void {
		// Pull every knob inside the range the rest of the draft leaves it,
		// before anything downstream reads one. A slider that cannot reach a
		// refusal is worth more than a refusal that explains itself.
		Object.assign(this.draft, PlanetSettings.settle(this.draft));
		this.onDraft(this.settings);
		if (rebuilds) {
			this.dirty = true;
			this.applyButton.classList.add("wants");
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
					`<span>ground <b>${settings.knobs.noiseScale.toFixed(0)} m</b> down to <b>${settings.smallestLandform.toFixed(0)} m</b> across, over <b>${settings.knobs.octaves}</b> octaves</span>`
				: `<span>height map <b>off</b></span>`) +
			`<span>horizon at eye height <b>${(settings.radius * Math.acos(settings.radius / (settings.radius + 1.7))).toFixed(0)} m</b></span>` +
			`<span>crust <b>${settings.crustDepth}</b> layers</span>` +
			`<span>tallest ground <b>${settings.maxElevation} m</b></span>` +
			`<span>cloud puff <b>${settings.cloudPuff.toFixed(0)} m</b>, level <b>${settings.cloudLevel}</b></span>` +
			`<span>cells a layer <b>${cells.toLocaleString("en-US")}</b></span>` +
			`<span>cell address <b>${settings.addressBits} bits</b></span>`;
	}
}
