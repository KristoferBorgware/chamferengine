import type { PlanetKnobs } from "./PlanetSettings.js";
import { KNOB_RANGES, PlanetSettings } from "./PlanetSettings.js";

/** One row of the panel. */
interface Knob {
	readonly key: keyof PlanetKnobs;
	readonly label: string;

	/** What turning it does, in one or two sentences, under the slider. */
	readonly says: string;

	readonly digits?: number;

	/**
	 * Whether this row does anything, given the rest of the draft.
	 *
	 * A row that fails this is disabled rather than hidden: the number is
	 * still there to look at, and turning the knob it depends on back on picks
	 * up wherever this one was left.
	 */
	readonly enabledWhen?: (knobs: PlanetKnobs) => boolean;

	/** Whether the map pane redraws when this moves. */
	readonly map?: boolean;
}

/** One titled run of rows. */
interface Group {
	readonly title: string;
	readonly note: string;

	/** Whether the group starts folded away. */
	readonly folded?: boolean;

	readonly knobs: Knob[];
}

/**
 * What the panel shows, grouped by what a knob decides and ordered by how much
 * of the world it moves.
 *
 * **Only three knobs move a coastline.** Swept across their whole ranges
 * against the land-or-sea state of every cell, Land changes 25 to 50% of the
 * surface, Landform across 17 to 18%, and Radius 16 to 17%. Every other knob
 * measured changes **none of it** — which does not make them useless, only
 * about something else: how tall the ground stands, how finely it is drawn, how
 * deep it runs. So the first group is open and the rest are folded, and a knob
 * comes out only when it is shown to do nothing at all.
 */
const GROUPS: Group[] = [
	{
		title: "Where the land is",
		note: "The only knobs that move a coastline, and the ones the map redraws for. Swept across their whole ranges, Land changes 25 to 50% of the surface, Landform across 17%, and Radius 16%.",
		knobs: [
			{
				key: "radius",
				map: true,
				label: "Radius",
				digits: 0,
				says: "How big the planet is. Sets how far you can see, which goes as the square root of this, and how long a walk round takes, which goes as this. With the block size it also sets the subdivision depth, and the depth is two bits of every cell address.",
			},
			{
				key: "landFraction",
				map: true,
				label: "Land",
				digits: 2,
				says: "How much of the surface is left above the sea. Sea level is chosen to hit it, so lowering this floods the world rather than lowering the ground. It also decides how long rivers get, because a river cannot be longer than the land it crosses.",
				enabledWhen: (k) => k.coarseMap && !k.plain,
			},
			{
				key: "reliefFeature",
				map: true,
				label: "Landform across",
				digits: 0,
				says: "How wide one hill or valley is. This is the knob that decides whether you are looking at hills or standing on a hillside: below about twice the horizon the ground reads as landforms, above it as a slope. Narrower also means fewer octaves, because the smallest hill stays at 64 m.",
				enabledWhen: (k) => k.coarseMap && !k.plain,
			},
			{
				key: "coarseMap",
				map: true,
				label: "Coarse map",
				says: "Whether continents, sea, relief, rivers and erosion run at all. Off is the ground doc 08 describes before that tier existed: dry, textured by Detail alone, and a fraction of the world-creation cost. Every other knob in this group stops mattering while it is off, and so does How the ground stands.",
				enabledWhen: (k) => !k.plain,
			},
			{
				key: "coarseSpacing",
				map: true,
				label: "Coarse cell",
				digits: 0,
				says: "How finely the map of continents, rivers and lakes is drawn. It decides how wide a river is and nothing else: land share, sea level and where the water goes are the same at every setting. Halving it costs four times the world creation time and four times the memory. A wide radius and a fine cell together are capped coarser than asked rather than building a map hundreds of millions of cells wide — the readout below is what you get.",
				enabledWhen: (k) => k.coarseMap && !k.plain,
			},
		],
	},
	{
		title: "How the ground stands",
		note: "How far the map's numbers reach in metres, and the detail laid over them. None of these moves a coastline, so the map does not redraw for them.",
		folded: true,
		knobs: [
			{
				key: "heightScale",
				label: "Height scale",
				digits: 0,
				says: "How tall the terrain is. It multiplies the whole height field, so mountains and sea floors move together and the ground gets steeper without changing shape. The tallest peak comes out at about half this number.",
				enabledWhen: (k) => k.coarseMap && !k.plain,
			},
			{
				key: "detailAmplitude",
				label: "Detail",
				digits: 0,
				says: "How far the fine noise moves the ground. With the coarse map on this is under the size the map can describe, added after it has decided where water is, so a large value puts hills through lakes. With the map off this is the whole of the terrain.",
				enabledWhen: (k) => !k.plain,
			},
			{
				key: "detailFeature",
				label: "Detail across",
				digits: 0,
				says: "How wide one bump of that fine noise is. Below the coarse cell it is the only thing giving the ground texture between one map sample and the next.",
				enabledWhen: (k) => !k.plain,
			},
		],
	},
	{
		title: "The cell grid",
		note: "How big a cell is, how many make a chunk, and how deep the world runs. The first two decide the cell address.",
		folded: true,
		knobs: [
			{
				key: "blockSize",
				label: "Block size",
				digits: 2,
				says: "How wide one cell is. Fixed for the life of the world. The radius moves to whatever makes this size exact, so the number above is a request and the readout below is what you get.",
			},
			{
				key: "chunkCells",
				label: "Chunk",
				digits: 0,
				says: "How many cells along one edge of a chunk, which is the unit that is generated, meshed, stored and sent. Smaller chunks redraw less when one block changes and cost more of everything else. It does not appear in a cell address.",
			},
			{
				key: "crustMetres",
				label: "Crust reaches",
				digits: 0,
				says: "How far down the world goes, from above the tallest peak to the floor. It has to reach below the deepest sea floor or the ocean falls out of the bottom. This is the layer count, and the layer is ten bits of every cell address.",
			},
		],
	},
	{
		title: "Paused",
		note: "Builds the world again. What is left is the lattice and nothing else, which is the only state the level of detail can be judged in.",
		folded: true,
		knobs: [
			{
				key: "plain",
				label: "Plain planet",
				says: "Holds nine things off at once: the coarse map, the detail noise, water, the air, the day, the clouds, the moon, the stars, and the light moving at all. What is left is a smooth green sphere of cells lit as at noon. Nothing is removed -- every knob below keeps its setting and comes back when this is unchecked.",
			},
		],
	},
	{
		title: "The air",
		note: "How thick the sky is and how far up it reaches.",
		folded: true,
		knobs: [
			{
				key: "atmosphereTop",
				label: "Air reaches",
				digits: 0,
				says: "How high the air goes. On a planet this size correctly scaled air is 3,748 times too thin to see, so this is an invented number chosen by eye rather than a physical one.",
				enabledWhen: (k) => !k.plain,
			},
			{
				key: "zenithDepth",
				label: "Depth overhead",
				digits: 3,
				says: "How thick the air reads looking straight up. Earth is 0.241.",
				enabledWhen: (k) => !k.plain,
			},
		],
	},
	{
		title: "Time",
		note: "How long a day is, and where in one the light stands.",
		folded: true,
		knobs: [
			{
				key: "dayLength",
				label: "Day",
				digits: 0,
				says: "Seconds in a day. Below about two hours a walking player outruns the sunset and can hold it in place by walking west.",
				enabledWhen: (k) => !k.plain,
			},
			{
				key: "paused",
				label: "Pause",
				says: "Stops the sun and the moon exactly where they are. Unchecking resumes from there, rather than jumping to wherever the clock would have reached.",
				enabledWhen: (k) => !k.plain,
			},
			{
				key: "timeOfDay",
				label: "Time of day",
				digits: 2,
				says: "Where in the day to freeze, 0 at midnight to 1 at the next. Moving this pauses, the same as checking Pause.",
				enabledWhen: (k) => !k.plain,
			},
		],
	},
	{
		title: "The clouds",
		note: "Where the two decks sit, and how a puff is shaped.",
		folded: true,
		knobs: [
			{
				key: "cloudsDrawn",
				label: "Draw the clouds",
				says: "Whether the two decks are drawn. Off empties the buffer and stops the pass, and the decks keep being built and turned by the wind, so turning it back on shows them where they would have been. To stop building them as well, use Plain planet.",
				enabledWhen: (k) => !k.plain,
			},
			{
				key: "lowDeck",
				label: "Low deck",
				digits: 0,
				says: "How high the lower cloud deck sits, from the planet's own surface.",
				enabledWhen: (k) => !k.plain,
			},
			{
				key: "highDeck",
				label: "High deck",
				digits: 0,
				says: "How high the upper deck sits. Two decks read as two layers of weather rather than one.",
				enabledWhen: (k) => !k.plain,
			},
			{
				key: "cloudPuff",
				label: "Puff",
				digits: 0,
				says: "How wide one lump of cloud is. Clouds borrow the same hexagon lattice as the ground, higher up, so this is asked for in metres and answered as a level. Both decks and the shell spacing follow it. A puff fine enough, combined with enough shells, is capped coarser than asked rather than filling a buffer the renderer cannot hold — the readout below is what you get.",
				enabledWhen: (k) => !k.plain,
			},
			{
				key: "cloudShells",
				label: "Shells",
				digits: 0,
				says: "How many hexagons deep a deck runs. One is a single flat-topped layer; a thicker point in the horizontal pattern reliably fills more of its shells, so raising this is what turns a haze into billows. Raising it also lowers how fine Puff is allowed to go, for the same reason.",
				enabledWhen: (k) => !k.plain,
			},
		],
	},
	{
		title: "Drawing",
		note: "What the renderer does with the world once it exists.",
		folded: true,
		knobs: [
			{
				key: "detail",
				label: "Full detail to",
				digits: 1,
				says: "How many of its own widths away a chunk goes before it drops to the next coarser level. Higher holds more chunks at full detail, which costs generation time and memory rather than frame time.",
			},
			{
				key: "apron",
				label: "Apron",
				says: "Whether a chunk also draws the ring of cells just beyond its rim. Two levels tile their shared boundary with hexagons of two sizes and those do not interlock, so without it strips of ground belong to nobody and the sky shows through the planet. Off shows the holes.",
			},
			{
				key: "seamOverlay",
				label: "Seam overlay",
				says: "Paints the joins instead of hiding them: yellow cells sit on a face edge, blue cells on a chunk boundary, and orange is the apron ring a chunk draws past its own rim. For finding where a hole came from, not for playing under.",
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

			const note = document.createElement("p");
			note.textContent = group.note;
			section.appendChild(note);

			for (const knob of group.knobs) {
				const row = this.row(knob);
				this.rows.push(row);
				section.appendChild(row.wrap);
			}
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
			`<small>${knob.says}</small>`;

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
		const write = () => {
			if (toggle)
				input.checked = this.draft[knob.key] as unknown as boolean;
			else {
				input.value = String(this.draft[knob.key]);
				shown!.textContent =
					`${Number(this.draft[knob.key]).toFixed(digits)}` +
					(range.unit ? ` ${range.unit}` : "");
			}
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

	/** A change was made: either hand it over now, or wait for the button. */
	private touch(rebuilds: boolean): void {
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
				? `<span>coarse <b>${settings.coarseCell.toFixed(0)} m</b>, level <b>${settings.coarseLevel}</b></span>` +
					`<span>landforms <b>${settings.knobs.reliefFeature} m</b> down to <b>${settings.smallestLandform.toFixed(0)} m</b>, <b>${settings.reliefOctaves}</b> octaves</span>`
				: `<span>coarse map <b>off</b></span>`) +
			`<span>horizon at eye height <b>${(settings.radius * Math.acos(settings.radius / (settings.radius + 1.7))).toFixed(0)} m</b></span>` +
			`<span>crust <b>${settings.crustDepth}</b> layers</span>` +
			`<span>tallest ground <b>${settings.maxElevation} m</b></span>` +
			`<span>cloud puff <b>${settings.cloudPuff.toFixed(0)} m</b>, level <b>${settings.cloudLevel}</b></span>` +
			`<span>cells a layer <b>${cells.toLocaleString("en-US")}</b></span>` +
			`<span>cell address <b>${settings.addressBits} bits</b></span>`;
	}
}
