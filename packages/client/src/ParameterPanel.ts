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
}

/** One titled run of rows. */
interface Group {
	readonly title: string;
	readonly note: string;
	readonly knobs: Knob[];
}

/**
 * What the panel shows, in the order the questions are usually asked.
 *
 * A knob is here because a number in it was chosen by looking at the result
 * rather than read off a table. One that nobody turns comes out again.
 */
const GROUPS: Group[] = [
	{
		title: "The planet",
		note: "Changing any of these builds the world again. The first two decide the cell address; the rest do not.",
		knobs: [
			{
				key: "radius",
				label: "Radius",
				digits: 0,
				says: "How big the planet is. Sets how far you can see, which goes as the square root of this, and how long a walk round takes, which goes as this. With the block size it also sets the subdivision depth, and the depth is two bits of every cell address.",
			},
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
				key: "coarseMap",
				label: "Coarse map",
				says: "Whether continents, sea, relief, rivers and erosion run at all. Off is the ground doc 08 describes before that tier existed: dry, textured by Detail alone, and a fraction of the world-creation cost. Every other knob in this group and the next stops mattering while it is off.",
			},
			{
				key: "coarseSpacing",
				label: "Coarse cell",
				digits: 0,
				says: "How finely the map of continents, rivers and lakes is drawn. It decides how wide a river is and nothing else: land share, sea level and where the water goes are the same at every setting. Halving it costs four times the world creation time and four times the memory.",
				enabledWhen: (k) => k.coarseMap,
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
		title: "The ground",
		note: "Also a rebuild. Height is how tall a hill is and landform is how wide, and it is the width that decides whether the ground reads as hills or as one long slope.",
		knobs: [
			{
				key: "heightScale",
				label: "Height scale",
				digits: 0,
				says: "How tall the terrain is. It multiplies the whole height field, so mountains and sea floors move together and the ground gets steeper without changing shape. The tallest peak comes out at about half this number.",
				enabledWhen: (k) => k.coarseMap,
			},
			{
				key: "reliefFeature",
				label: "Landform across",
				digits: 0,
				says: "How wide one hill or valley is. This is the knob that decides whether you are looking at hills or standing on a hillside: below about twice the horizon the ground reads as landforms, above it as a slope. Narrower also means fewer octaves, because the smallest hill stays at 64 m.",
				enabledWhen: (k) => k.coarseMap,
			},
			{
				key: "detailAmplitude",
				label: "Detail",
				digits: 0,
				says: "How far the fine noise moves the ground. With the coarse map on this is under the size the map can describe, added after it has decided where water is, so a large value puts hills through lakes. With the map off this is the whole of the terrain.",
			},
			{
				key: "detailFeature",
				label: "Detail across",
				digits: 0,
				says: "How wide one bump of that fine noise is. Below the coarse cell it is the only thing giving the ground texture between one map sample and the next.",
			},
			{
				key: "landFraction",
				label: "Land",
				digits: 2,
				says: "How much of the surface is left above the sea. Sea level is chosen to hit it, so lowering this floods the world rather than lowering the ground. It also decides how long rivers get, because a river cannot be longer than the land it crosses.",
				enabledWhen: (k) => k.coarseMap,
			},
			{
				key: "skirtCells",
				label: "Skirt",
				digits: 0,
				says: "How far a chunk's rim hangs below its edge, to cover the crack where a chunk meets a coarser neighbour. Zero shows the cracks.",
			},
		],
	},
	{
		title: "The air",
		note: "Immediate. How tall the air is decides how strong a sunset is.",
		knobs: [
			{
				key: "atmosphereTop",
				label: "Air reaches",
				digits: 0,
				says: "How high the air goes. On a planet this size correctly scaled air is 3,748 times too thin to see, so this is an invented number chosen by eye rather than a physical one.",
			},
			{
				key: "zenithDepth",
				label: "Depth overhead",
				digits: 3,
				says: "How thick the air reads looking straight up. Earth is 0.241.",
			},
		],
	},
	{
		title: "Time",
		note: "Immediate. Pausing freezes the sun and the moon exactly where they stood; dragging the time of day jumps there and pauses too.",
		knobs: [
			{
				key: "dayLength",
				label: "Day",
				digits: 0,
				says: "Seconds in a day. Below about two hours a walking player outruns the sunset and can hold it in place by walking west.",
			},
			{
				key: "paused",
				label: "Pause",
				says: "Stops the sun and the moon exactly where they are. Unchecking resumes from there, rather than jumping to wherever the clock would have reached.",
			},
			{
				key: "timeOfDay",
				label: "Time of day",
				digits: 2,
				says: "Where in the day to freeze, 0 at midnight to 1 at the next. Moving this pauses, the same as checking Pause.",
			},
		],
	},
	{
		title: "The clouds",
		note: "A rebuild. A cloud is a stack of hexagon shells, not a flat sheet, so shape follows from where the shells sit as much as from the noise.",
		knobs: [
			{
				key: "lowDeck",
				label: "Low deck",
				digits: 0,
				says: "How high the lower cloud deck sits, from the planet's own surface.",
			},
			{
				key: "highDeck",
				label: "High deck",
				digits: 0,
				says: "How high the upper deck sits. Two decks read as two layers of weather rather than one.",
			},
			{
				key: "cloudPuff",
				label: "Puff",
				digits: 0,
				says: "How wide one lump of cloud is. Clouds borrow the same hexagon lattice as the ground, higher up, so this is asked for in metres and answered as a level. Both decks and the shell spacing follow it.",
			},
			{
				key: "cloudShells",
				label: "Shells",
				digits: 0,
				says: "How many hexagons deep a deck runs. One is a single flat-topped layer; a thicker point in the horizontal pattern reliably fills more of its shells, so raising this is what turns a haze into billows.",
			},
		],
	},
	{
		title: "Drawing",
		note: "Immediate. What is held, and how much of it is drawn.",
		knobs: [
			{
				key: "detail",
				label: "Full detail to",
				digits: 1,
				says: "How many of its own widths away a chunk goes before it drops to the next coarser level. Higher holds more chunks at full detail, which costs generation time and memory rather than frame time.",
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
	private readonly rows: Row[] = [];
	private problems!: HTMLElement;
	private derived!: HTMLElement;
	private applyButton!: HTMLButtonElement;
	private dirty = false;

	constructor(
		settings: PlanetSettings,
		onLive: (settings: PlanetSettings) => void,
	) {
		this.draft = { ...settings.knobs };
		this.onLive = onLive;
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

		for (const group of GROUPS) {
			const section = document.createElement("section");
			section.innerHTML = `<h2>${group.title}</h2><p>${group.note}</p>`;
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
			`<span>cells a layer <b>${cells.toLocaleString("en-US")}</b></span>` +
			`<span>cell address <b>${settings.addressBits} bits</b></span>`;
	}
}
