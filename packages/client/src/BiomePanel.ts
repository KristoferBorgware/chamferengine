import type { BiomeSheet, BiomesFacts } from "./BiomesMessage.js";
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
} from "chamfer/generation";
import { biomeTableOf } from "./BiomeDraft.js";

/** What the panel's one picture shows. */
export type BiomePicture =
	| "biomes"
	| "landform"
	| "temperature"
	| "humidity"
	| "push"
	| "regions";

const PICTURES: readonly { value: BiomePicture; label: string }[] = [
	{ value: "biomes", label: "Biomes" },
	{ value: "landform", label: "Landform" },
	{ value: "temperature", label: "Temperature" },
	{ value: "humidity", label: "Humidity" },
	{ value: "push", label: "The push" },
	{ value: "regions", label: "Regions" },
];

/** The sea on every picture, as CSS and as bytes. */
const SEA_INK = [24, 44, 74] as const;

/** How many pixels across the diagram is rasterised. */
const CHART = 300;

/** One sRGB hex as its three bytes. */
function bytesOf(hex: string): [number, number, number] {
	const n = parseInt(hex, 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
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

	/** The landform whose diagram is shown, as an index into `LANDFORMS`. */
	shown = 2;

	/** The biome being edited, as an index into the table. */
	picked = 0;

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

	private facts: BiomesFacts | null = null;
	private sheet: BiomeSheet | null = null;
	private dragging = false;

	constructor(
		table: BiomeTableDraft,
		onChange: (settled: boolean) => void,
		options: { picture?: BiomePicture; onPicture?: () => void } = {},
	) {
		this.table = table;
		this.onChange = onChange;
		this.onPicture = options.onPicture ?? ((): void => {});
		this.picture = options.picture ?? "biomes";

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

		// One picture of the planet, in whichever reading is asked for.
		const pictureRow = document.createElement("div");
		pictureRow.className = "knob";
		const pictureLabel = document.createElement("label");
		pictureLabel.textContent = "Picture";
		const pick = document.createElement("select");
		for (const { value, label } of PICTURES) {
			const option = document.createElement("option");
			option.value = value;
			option.textContent = label;
			pick.append(option);
		}
		pick.value = this.picture;
		pick.oninput = () => {
			this.picture = pick.value as BiomePicture;
			this.paintSheet();
			this.onPicture();
		};
		pictureRow.append(pictureLabel, pick);
		scroller.append(pictureRow);

		this.shot = document.createElement("canvas");
		this.shot.className = "biomes-shot";
		this.shotInk = this.shot.getContext("2d")!;
		scroller.append(this.shot);

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
		axes.innerHTML = "<span>dry</span><span>humidity</span><span>wet</span>";
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

	/** Everything the last build measured, painted into the panel. */
	show(facts: BiomesFacts, sheet: BiomeSheet | null): void {
		this.facts = facts;
		if (sheet) this.sheet = sheet;
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
		const allowed = this.allowedNow()[this.shown];
		const cells = 100;
		const image = ink.createImageData(cells, cells);
		const px = image.data;
		for (let r = 0; r < cells; r++)
			for (let q = 0; q < cells; q++) {
				const h = (q + 0.5) / cells;
				const t = 1 - (r + 0.5) / cells;
				const winner = biomeOf(t, h, allowed, biomes);
				const at = (r * cells + q) * 4;
				const [red, green, blue] =
					winner < 0 ? [30, 34, 42] : bytesOf(biomes[winner]!.hex);
				const dim = winner === this.picked ? 1 : 0.62;
				px[at] = red * dim;
				px[at + 1] = green * dim;
				px[at + 2] = blue * dim;
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

		// **The cloud: where this landform's ground actually lands in the
		// square.** The diagram's cell areas say nothing about the planet --
		// land clusters in the middle of the square and thins toward its
		// corners, so a big cell can be a rare biome. The cloud is what makes
		// the balance readable, and it is also where the regions show: at full
		// pull every region is one climate, so the cloud collapses from a
		// smear into a scatter of single points, one per region.
		if (this.sheet) {
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
		const from =
			this.table.biomes[this.picked] ??
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
			row.className =
				"biomes-row" + (b === this.picked ? " picked" : "");
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
						const next = form >= LANDFORMS.length - 1 ? 1 : form + 1;
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
		const sheet = this.sheet;
		if (!sheet) return;
		if (
			this.shot.width !== sheet.width ||
			this.shot.height !== sheet.height
		) {
			this.shot.width = sheet.width;
			this.shot.height = sheet.height;
		}
		const image = this.shotInk.createImageData(sheet.width, sheet.height);
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
			let ink: readonly [number, number, number] = SEA_INK;
			if (this.picture === "biomes") {
				if (!sea)
					ink = byBlock.get(sheet.block[n]!) ?? [255, 0, 255];
			} else if (this.picture === "landform") {
				if (!sea) ink = formInk[sheet.landform[n]!]!;
			} else if (this.picture === "temperature") {
				const t = sheet.t[n]!;
				ink = [40 + 215 * t, 60 + 80 * t, 230 - 190 * t];
				if (sea) ink = ink.map((v) => v * 0.35) as [number, number, number];
			} else if (this.picture === "humidity") {
				const h = sheet.h[n]!;
				ink = [210 - 170 * h, 160 - 30 * h, 60 + 170 * h];
				if (sea) ink = ink.map((v) => v * 0.35) as [number, number, number];
			} else if (this.picture === "push") {
				// The temperature push as banded grey, the humidity push as a
				// contour over it: two washes of color in one picture read as
				// neither.
				const bandT = Math.floor(((sheet.pushT[n]! + 1) / 2) * 9) / 9;
				const grey = 30 + 200 * bandT;
				const along = ((sheet.pushH[n]! + 1) / 2) * 9;
				const into = along - Math.floor(along);
				const edge = into < 0.1 ? 0.5 : 1;
				ink = [grey * edge, grey * edge, grey * edge * 1.1];
			} else {
				if (sheet.region[n]! < 0) ink = sea ? SEA_INK : [60, 60, 66];
				else {
					// A region's color is hashed off its key, so it is stable
					// while a knob moves and no two neighbours agree.
					const key = sheet.region[n]!;
					const hue = (key * 2654435761) % 360;
					const c = 0.5;
					const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
					const six = Math.floor(hue / 60) % 6;
					const rgb = [
						[c, x, 0],
						[x, c, 0],
						[0, c, x],
						[0, x, c],
						[x, 0, c],
						[c, 0, x],
					][six]!;
					ink = rgb.map((v) => 60 + v * 300) as [
						number,
						number,
						number,
					];
					if (sea) ink = ink.map((v) => v * 0.3) as [number, number, number];
				}
			}
			px[at] = ink[0];
			px[at + 1] = ink[1];
			px[at + 2] = ink[2];
			px[at + 3] = 255;
		}
		this.shotInk.putImageData(image, 0, 0);
	}
}
