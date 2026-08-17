import type { PlanetKnobs } from "./PlanetSettings.js";
import { KNOB_RANGES, PlanetSettings } from "./PlanetSettings.js";

/** One row of the panel. */
interface Knob {
	readonly key: keyof PlanetKnobs;
	readonly label: string;
	readonly digits?: number;
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
		note: "Changing any of these builds the world again.",
		knobs: [
			{ key: "radius", label: "Radius", digits: 0 },
			{ key: "blockSize", label: "Block size", digits: 2 },
			{ key: "chunkCells", label: "Chunk", digits: 0 },
			{ key: "coarseSpacing", label: "Coarse cell", digits: 0 },
			{ key: "crustMetres", label: "Crust reaches", digits: 0 },
		],
	},
	{
		title: "The ground",
		note: "Also a rebuild. The height scale is how tall a hill is and the landform size is how wide, and it is the width that decides whether the ground reads as hills or as a slope.",
		knobs: [
			{ key: "heightScale", label: "Height scale", digits: 0 },
			{ key: "reliefFeature", label: "Landform across", digits: 0 },
			{ key: "detailAmplitude", label: "Detail", digits: 0 },
			{ key: "detailFeature", label: "Detail across", digits: 0 },
			{ key: "landFraction", label: "Land", digits: 2 },
			{ key: "skirtCells", label: "Skirt", digits: 0 },
		],
	},
	{
		title: "The air",
		note: "Immediate. How tall the air is decides how strong a sunset is.",
		knobs: [
			{ key: "atmosphereTop", label: "Air reaches", digits: 0 },
			{ key: "zenithDepth", label: "Depth overhead", digits: 3 },
			{ key: "dayLength", label: "Day", digits: 0 },
		],
	},
	{
		title: "The clouds",
		note: "Immediate. One shell is a flat sheet, which is what today draws.",
		knobs: [
			{ key: "lowDeck", label: "Low deck", digits: 0 },
			{ key: "highDeck", label: "High deck", digits: 0 },
			{ key: "cloudPuff", label: "Puff", digits: 0 },
			{ key: "cloudShells", label: "Shells", digits: 0 },
		],
	},
	{
		title: "Drawing",
		note: "Immediate. What is held, and how much of it is drawn.",
		knobs: [{ key: "detail", label: "Full detail to", digits: 1 }],
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
export class ParameterPanel {
	private readonly root: HTMLElement;
	private readonly draft: PlanetKnobs;
	private readonly onLive: (settings: PlanetSettings) => void;
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
			for (const knob of group.knobs) section.appendChild(this.row(knob));
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

	private row(knob: Knob): HTMLElement {
		const range = KNOB_RANGES[knob.key as string]!;
		const wrap = document.createElement("div");
		wrap.className = "knob";
		const digits = knob.digits ?? 0;
		wrap.innerHTML =
			`<label>${knob.label}` +
			(range.rebuilds ? ' <i title="needs a rebuild">&#9679;</i>' : "") +
			`<b></b></label><input type="range">`;

		const input = wrap.querySelector("input")!;
		input.min = String(range.low);
		input.max = String(range.high);
		input.step = String(range.step);
		input.value = String(this.draft[knob.key]);

		const shown = wrap.querySelector("b")!;
		const write = () => {
			shown.textContent =
				`${Number(this.draft[knob.key]).toFixed(digits)}` +
				(range.unit ? ` ${range.unit}` : "");
		};
		write();

		input.oninput = () => {
			const numbers = this.draft as unknown as Record<string, number>;
			numbers[knob.key as string] = Number.parseFloat(input.value);
			write();
			this.touch(range.rebuilds);
		};
		return wrap;
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
			`<span>coarse <b>${settings.coarseCell.toFixed(0)} m</b>, level <b>${settings.coarseLevel}</b></span>` +
			`<span>landforms <b>${settings.knobs.reliefFeature} m</b> down to <b>${settings.smallestLandform.toFixed(0)} m</b>, <b>${settings.reliefOctaves}</b> octaves</span>` +
			`<span>horizon at eye height <b>${(settings.radius * Math.acos(settings.radius / (settings.radius + 1.7))).toFixed(0)} m</b></span>` +
			`<span>crust <b>${settings.crustDepth}</b> layers</span>` +
			`<span>tallest ground <b>${settings.maxElevation} m</b></span>` +
			`<span>cells a layer <b>${cells.toLocaleString("en-US")}</b></span>`;
	}
}
