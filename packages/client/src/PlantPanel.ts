import type { PlantLayerDraft } from "./PlantDraft.js";
import type { PlantRow, PlantSection } from "./PLANT_ROWS.js";
import type { PlantPicture } from "./paintPlantSheet.js";
import type { PlantSheet, PlantTally } from "./VegetationMessage.js";
import { PLANT_SECTIONS } from "./PLANT_ROWS.js";
import {
	PLANT_SPECIES,
	PLANT_SPECIES_NAMES,
	splineAt,
} from "chamfer/generation";
import { applySpecies, makePlantLayer } from "./PlantDraft.js";
import { paintPlantSheet } from "./paintPlantSheet.js";

/** A linear colour as the hex a stylesheet takes, through the screen's curve. */
function inkOf(color: readonly [number, number, number]): string {
	const byte = (v: number): string =>
		Math.round(255 * Math.pow(Math.max(0, Math.min(1, v)), 1 / 2.2))
			.toString(16)
			.padStart(2, "0");
	return `#${byte(color[0])}${byte(color[1])}${byte(color[2])}`;
}

/** One built control, and what it takes to bring it back in line with the draft. */
interface Built {
	readonly row: PlantRow;
	readonly layer: PlantLayerDraft;
	readonly wrap: HTMLElement;
	readonly input?: HTMLInputElement | HTMLSelectElement;
	readonly readout?: HTMLElement;
	readonly note?: HTMLElement;
	readonly redraw?: () => void;
	readonly bars?: HTMLElement;
	readonly shot?: HTMLCanvasElement;
	readonly badge?: HTMLElement;
	readonly section?: HTMLElement;
}

/** What the panel was last handed to draw its pictures and its bars from. */
interface Drawn {
	readonly sheets: readonly PlantSheet[];
	readonly tallies: readonly PlantTally[];
	readonly metres: Float32Array;
	readonly grown: ReadonlyMap<number, number>;
}

/**
 * The plants: every layer, and the one switch that says what you walk into.
 *
 * **Its own panel, on its own side of the window.** A plant and the ground it
 * stands on are different questions: the world panel is the seed, how finely
 * the ground is drawn and where on the planet the patch stands, and this is
 * the plant itself -- where it grows, its trunk, its branches and its leaves.
 *
 * **A card is rebuilt whole rather than patched.** It holds a canvas, a curve
 * editor with a pointer capture on it and four sections; the list changes only
 * when a person adds or drops a layer, which is rare and never inside a frame.
 */
export class PlantPanel {
	private readonly root: HTMLElement;
	private readonly host: HTMLElement;
	private readonly cards = new Map<number, HTMLElement>();
	private readonly counts = new Map<number, HTMLElement>();
	private built: Built[] = [];
	private readonly onChange: (settled: boolean) => void;
	private readonly picker: HTMLElement;
	private readonly big: HTMLElement;
	private readonly bigCanvas: HTMLCanvasElement;
	private readonly bigName: HTMLElement;
	private bigShown = 0;
	private drawn: Drawn | null = null;
	private nextId = 1;

	readonly layers: PlantLayerDraft[];

	/**
	 * Which of the two pictures every layer draws, and whether leaves collide.
	 *
	 * One choice for all of them: two pictures answering different questions
	 * side by side is not a comparison.
	 */
	picture: PlantPicture = "noise";

	constructor(
		layers: PlantLayerDraft[],
		onChange: (settled: boolean) => void,
		options: {
			readonly picture?: PlantPicture;
			readonly extras?: HTMLElement;
		} = {},
	) {
		this.layers = layers;
		this.onChange = onChange;
		this.picture = options.picture ?? "noise";
		for (const layer of layers)
			this.nextId = Math.max(this.nextId, layer.id + 1);

		this.root = document.createElement("aside");
		this.root.className = "plants";
		const head = document.createElement("div");
		head.className = "plants-head";
		const title = document.createElement("h1");
		title.textContent = "Plants";
		head.append(title);
		this.root.append(head);

		const scroller = document.createElement("div");
		scroller.className = "plants-body";
		this.root.append(scroller);

		const top = document.createElement("div");
		top.className = "plants-top";
		top.append(this.pictureRow());
		if (options.extras) top.append(options.extras);
		scroller.append(top);

		this.host = document.createElement("div");
		scroller.append(this.host);

		const add = document.createElement("button");
		add.type = "button";
		add.className = "plants-add";
		add.textContent = "+ Vegetation";
		add.onclick = () => {
			this.picker.hidden = false;
		};
		scroller.append(add);
		document.body.append(this.root);

		this.picker = this.buildPicker();
		const { big, canvas, name } = this.buildBig();
		this.big = big;
		this.bigCanvas = canvas;
		this.bigName = name;
		this.build();
	}

	/** Which layer picture every card draws, as one row above the cards. */
	private pictureRow(): HTMLElement {
		const wrap = document.createElement("div");
		wrap.className = "knob";
		const label = document.createElement("label");
		label.textContent = "Layers show";
		const select = document.createElement("select");
		for (const [value, text] of [
			["noise", "The noise"],
			["density", "The density"],
		]) {
			const option = document.createElement("option");
			option.value = value!;
			option.textContent = text!;
			select.append(option);
		}
		select.value = this.picture;
		const note = document.createElement("p");
		note.className = "knob-note";
		const say = (): void => {
			note.innerHTML =
				this.picture === "noise"
					? "the reading itself, black at −1 and white at +1 · the " +
						"whole field, sea included, because a field has a value " +
						"everywhere and the picture above says where the land is"
					: "the reading through the curve, in the layer's own green · " +
						"which is what the world will do, with the sea left " +
						"black because nothing grows in it";
		};
		select.oninput = () => {
			this.picture = select.value as PlantPicture;
			say();
			this.paint();
		};
		say();
		wrap.append(label, select, note);
		return wrap;
	}

	/** Every layer's card, from scratch. */
	private build(): void {
		this.host.textContent = "";
		this.built = [];
		this.cards.clear();
		this.counts.clear();
		for (const layer of this.layers) this.host.append(this.card(layer));
		this.refresh();
		this.paint();
	}

	private card(layer: PlantLayerDraft): HTMLElement {
		const card = document.createElement("details");
		card.className = "layer";
		card.open = layer.open;
		card.addEventListener("toggle", () => {
			layer.open = card.open;
		});
		const head = document.createElement("summary");

		const off = document.createElement("input");
		off.type = "checkbox";
		off.className = "switch";
		off.checked = layer.on;
		off.title = "grow this layer";
		off.onclick = (event) => event.stopPropagation();
		off.oninput = () => {
			layer.on = off.checked;
			card.classList.toggle("off", !layer.on);
			this.onChange(true);
		};

		// The card wears the leaf over the wood, which is what a plant shows
		// most of.
		const chip = document.createElement("span");
		chip.className = "chip";
		chip.style.background = inkOf(layer.leaf);
		chip.style.boxShadow = `inset 0 0 0 2px ${inkOf(layer.wood)}`;

		const name = document.createElement("span");
		name.textContent = layer.species;
		const grown = document.createElement("span");
		grown.className = "grown";
		this.counts.set(layer.id, grown);

		const drop = document.createElement("button");
		drop.type = "button";
		drop.className = "drop";
		drop.textContent = "✕";
		drop.title = "remove this layer";
		drop.onclick = (event) => {
			event.stopPropagation();
			event.preventDefault();
			this.layers.splice(this.layers.indexOf(layer), 1);
			this.build();
			this.onChange(true);
		};

		head.append(off, chip, name, grown, drop);
		card.classList.toggle("off", !layer.on);
		card.append(head);

		const body = document.createElement("div");
		body.className = "body";
		card.append(body);
		body.append(this.speciesRow(layer));
		for (const part of PLANT_SECTIONS)
			body.append(this.section(layer, part));
		this.cards.set(layer.id, card);
		return card;
	}

	/**
	 * The species dropdown, which is a template rather than an identity.
	 *
	 * Picking one writes its numbers into the rows below and they stay
	 * editable, so two layers of one species that have been dragged apart are
	 * two different plants.
	 */
	private speciesRow(layer: PlantLayerDraft): HTMLElement {
		const wrap = document.createElement("div");
		wrap.className = "knob";
		const label = document.createElement("label");
		label.textContent = "Species";
		const select = document.createElement("select");
		for (const species of PLANT_SPECIES_NAMES) {
			const option = document.createElement("option");
			option.value = species;
			option.textContent = species;
			select.append(option);
		}
		select.value = layer.species;
		select.oninput = () => {
			applySpecies(layer, select.value);
			this.build();
			this.onChange(true);
		};
		const note = document.createElement("p");
		note.className = "knob-note";
		note.textContent =
			"a template for the rows below · they stay editable, so two layers " +
			"of one species can be two different plants";
		wrap.append(label, select, note);
		return wrap;
	}

	private section(layer: PlantLayerDraft, part: PlantSection): HTMLElement {
		const set = document.createElement("details");
		set.className = "sub";
		set.open = part.open !== false;
		const legend = document.createElement("summary");
		legend.append(document.createTextNode(part.name));
		set.append(legend);
		for (const row of part.rows) {
			if (row.kind === "switch") {
				const box = document.createElement("input");
				box.type = "checkbox";
				box.className = "switch";
				box.checked = layer[row.flag ?? "branches"];
				box.title = row.title ?? "";
				box.onclick = (event) => event.stopPropagation();
				box.oninput = () => {
					layer[row.flag ?? "branches"] = box.checked;
					this.onChange(true);
					this.refresh();
				};
				legend.prepend(box);
				this.built.push({
					row,
					layer,
					wrap: set,
					input: box,
					section: set,
				});
				continue;
			}
			if (row.kind === "picture") {
				set.append(this.pictureOf(layer));
				continue;
			}
			if (row.kind === "curve") {
				set.append(this.curveOf(layer, row));
				continue;
			}
			set.append(this.slider(layer, row));
		}
		return set;
	}

	/** One layer's own picture, in the section where that layer is tuned. */
	private pictureOf(layer: PlantLayerDraft): HTMLElement {
		const wrap = document.createElement("div");
		wrap.className = "knob pictured";
		const holder = document.createElement("div");
		holder.className = "shot leaf";
		const canvas = document.createElement("canvas");
		canvas.width = 1;
		canvas.height = 1;
		// **A field at panel width says where its shapes are; filling the
		// window says what they look like.** Which of those a curve is being
		// dragged against is the whole question.
		canvas.title = "enlarge";
		canvas.onclick = () => this.enlarge(layer.id);
		const badge = document.createElement("b");
		badge.textContent = layer.species;
		badge.style.background = inkOf(layer.leaf);
		holder.append(canvas, badge);
		wrap.append(holder);
		this.built.push({
			row: { key: "picture" },
			layer,
			wrap,
			shot: canvas,
			badge,
		});
		return wrap;
	}

	/** One slider, its readout and the words under it. */
	private slider(layer: PlantLayerDraft, row: PlantRow): HTMLElement {
		const wrap = document.createElement("div");
		wrap.className = "knob";
		const label = document.createElement("label");
		label.textContent = row.label ?? row.key;
		const readout = document.createElement("output");
		const input = document.createElement("input");
		input.type = "range";
		input.min = String(row.low ?? 0);
		input.max = String(row.high ?? 1);
		input.step = String(row.step ?? 0.01);
		input.value = String(
			layer.values[row.key as keyof typeof layer.values] ?? 0,
		);
		input.oninput = () => {
			layer.values[row.key as keyof typeof layer.values] = Number(
				input.value,
			);
			this.refresh();
			this.onChange(false);
		};
		input.onchange = () => this.onChange(true);
		wrap.append(label, readout, input);
		const built: Built = { row, layer, wrap, input, readout };
		if (row.note) {
			const note = document.createElement("p");
			note.className = "knob-note";
			wrap.append(note);
			this.built.push({ ...built, note });
		} else this.built.push(built);
		return wrap;
	}

	/**
	 * A draggable curve over one layer's own points, with the field behind it.
	 *
	 * **The bars are what make the x axis mean anything.** A field's range is
	 * `-1` to `+1` and it reaches nowhere near either end, so a drag near the
	 * middle moves a fifth of the land and the same drag out at the end reaches
	 * a couple of percent of it. Drawn behind the curve rather than under it,
	 * so the two share an x axis exactly and nothing has to be lined up by eye.
	 */
	private curveOf(layer: PlantLayerDraft, row: PlantRow): HTMLElement {
		const wrap = document.createElement("div");
		wrap.className = "knob curved";
		const label = document.createElement("label");
		label.textContent = row.label ?? "Noise → density";
		const canvas = document.createElement("canvas");
		canvas.className = "curve";
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		canvas.width = 300 * dpr;
		canvas.height = 96 * dpr;
		const g = canvas.getContext("2d")!;
		const pad = 6 * dpr;
		const toX = (v: number): number =>
			pad + ((v + 1) / 2) * (canvas.width - pad * 2);
		const toY = (v: number): number =>
			canvas.height - pad - v * (canvas.height - pad * 2);
		const fromX = (px: number): number =>
			((px - pad) / (canvas.width - pad * 2)) * 2 - 1;
		const fromY = (py: number): number =>
			(canvas.height - pad - py) / (canvas.height - pad * 2);

		const axis = document.createElement("div");
		axis.className = "axis";
		const along = document.createElement("div");
		along.textContent =
			"x: the layer's own noise, −1 to +1 · y: how much of Density this " +
			"place takes";
		const bars = document.createElement("div");
		axis.append(along, bars);
		const help = document.createElement("p");
		help.className = "curve-help";
		help.textContent =
			"drag a point · click the curve to add one · shift-click a point " +
			"to remove it";
		wrap.append(label, canvas, axis, help);

		const draw = (): void => {
			const points = layer.curve;
			g.fillStyle = "#0b0e13";
			g.fillRect(0, 0, canvas.width, canvas.height);
			const tally = this.drawn?.tallies.find((t) => t.id === layer.id);
			if (tally && tally.tallest > 0) {
				g.fillStyle = "rgba(255, 255, 255, 0.13)";
				const bins = tally.counts.length;
				const wide = (canvas.width - pad * 2) / bins;
				for (let n = 0; n < bins; n++) {
					const tall =
						(tally.counts[n]! / tally.tallest) *
						(canvas.height - pad * 2);
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
			g.lineWidth = dpr;
			g.beginPath();
			g.moveTo(toX(0), pad);
			g.lineTo(toX(0), canvas.height - pad);
			g.stroke();
			g.strokeStyle = inkOf(layer.leaf);
			g.lineWidth = 1.5 * dpr;
			g.beginPath();
			for (let px = pad; px <= canvas.width - pad; px++) {
				const y = toY(splineAt(points, fromX(px)));
				if (px === pad) g.moveTo(px, y);
				else g.lineTo(px, y);
			}
			g.stroke();
			g.fillStyle = "#e8ecf2";
			for (const [x, y] of points) {
				g.beginPath();
				g.arc(toX(x), toY(y), 3 * dpr, 0, Math.PI * 2);
				g.fill();
			}
		};

		let dragging = -1;
		const spot = (event: PointerEvent): [number, number] => {
			const box = canvas.getBoundingClientRect();
			return [
				((event.clientX - box.left) / box.width) * canvas.width,
				((event.clientY - box.top) / box.height) * canvas.height,
			];
		};
		const nearest = (px: number, py: number): number => {
			let best = -1;
			let far = 12 * dpr;
			layer.curve.forEach(([x, y], n) => {
				const dx = toX(x) - px;
				const dy = toY(y) - py;
				const d = Math.sqrt(dx * dx + dy * dy);
				if (d < far) {
					far = d;
					best = n;
				}
			});
			return best;
		};
		canvas.addEventListener("pointerdown", (event) => {
			event.preventDefault();
			const [px, py] = spot(event);
			const at = nearest(px, py);
			const points = layer.curve;
			if (at >= 0 && event.shiftKey) {
				// Never below two, or the curve stops being a curve.
				if (points.length > 2 && at > 0 && at < points.length - 1) {
					points.splice(at, 1);
					draw();
					this.onChange(true);
				}
				return;
			}
			if (at >= 0) dragging = at;
			else {
				const x = Math.max(-1, Math.min(1, fromX(px)));
				const y = Math.max(0, Math.min(1, fromY(py)));
				points.push([x, y]);
				points.sort((a, b) => a[0] - b[0]);
				dragging = points.findIndex((p) => p[0] === x && p[1] === y);
				draw();
				this.onChange(true);
			}
			canvas.setPointerCapture(event.pointerId);
		});
		canvas.addEventListener("pointermove", (event) => {
			if (dragging < 0) return;
			const points = layer.curve;
			const [px, py] = spot(event);
			const first = dragging === 0;
			const last = dragging === points.length - 1;
			// The ends hold their x, so the curve always covers the whole range
			// and nothing has to guess what happens past it.
			if (!first && !last)
				points[dragging]![0] = Math.max(
					points[dragging - 1]![0] + 0.01,
					Math.min(points[dragging + 1]![0] - 0.01, fromX(px)),
				);
			points[dragging]![1] = Math.max(0, Math.min(1, fromY(py)));
			draw();
			this.onChange(false);
		});
		const drop = (): void => {
			if (dragging < 0) return;
			dragging = -1;
			this.onChange(true);
		};
		canvas.addEventListener("pointerup", drop);
		canvas.addEventListener("pointercancel", drop);

		this.built.push({ row, layer, wrap, redraw: draw, bars });
		return wrap;
	}

	/** Picking a species is picking a starting point, so it is a named grid. */
	private buildPicker(): HTMLElement {
		const pick = document.createElement("div");
		pick.className = "plants-pick";
		pick.hidden = true;
		const box = document.createElement("div");
		box.innerHTML =
			"<h2>A new layer</h2><p>A species is a bundle of numbers, never a " +
			"model — picking one writes its numbers into the layer and they " +
			"stay editable afterwards. <b>Custom</b> starts from the plain " +
			"defaults.</p>";
		const list = document.createElement("div");
		list.className = "plants-pick-list";
		for (const species of PLANT_SPECIES_NAMES) {
			const button = document.createElement("button");
			button.type = "button";
			const chip = document.createElement("span");
			chip.className = "chip";
			const preset = PLANT_SPECIES[species]!;
			chip.style.background = inkOf(preset.leaf);
			chip.style.boxShadow = `inset 0 0 0 2px ${inkOf(preset.wood)}`;
			button.append(chip, document.createTextNode(species));
			button.onclick = () => {
				pick.hidden = true;
				this.layers.push(makePlantLayer(species, this.nextId++));
				this.build();
				this.onChange(true);
			};
			list.append(button);
		}
		box.append(list);
		pick.append(box);
		pick.onclick = (event) => {
			if (event.target === pick) pick.hidden = true;
		};
		document.body.append(pick);
		return pick;
	}

	/** One layer's picture, filling the window, until it is clicked away. */
	private buildBig(): {
		big: HTMLElement;
		canvas: HTMLCanvasElement;
		name: HTMLElement;
	} {
		const big = document.createElement("div");
		big.className = "plants-big";
		big.hidden = true;
		const figure = document.createElement("figure");
		const canvas = document.createElement("canvas");
		const caption = document.createElement("figcaption");
		const name = document.createElement("b");
		const hint = document.createElement("span");
		hint.textContent = "click anywhere to close";
		caption.append(name, hint);
		figure.append(canvas, caption);
		big.append(figure);
		big.onclick = () => {
			big.hidden = true;
			this.bigShown = 0;
		};
		document.body.append(big);
		return { big, canvas, name };
	}

	private enlarge(id: number): void {
		this.bigShown = id;
		this.big.hidden = false;
		const layer = this.layers.find((one) => one.id === id);
		this.bigName.textContent = layer
			? `${layer.species} — ${this.picture === "noise" ? "the field" : "the density"}`
			: "";
		this.paint();
	}

	/** What the last build grew, and the fields every picture is drawn from. */
	show(drawn: Drawn): void {
		this.drawn = drawn;
		this.refresh();
		this.paint();
	}

	/** Repaint every layer picture from the sheets the last build handed over. */
	private paint(): void {
		const drawn = this.drawn;
		if (!drawn) return;
		for (const made of this.built) {
			if (!made.shot) continue;
			const sheet = drawn.sheets.find((one) => one.id === made.layer.id);
			if (!sheet) continue;
			this.drawShot(made.shot, sheet, made.layer, drawn.metres);
		}
		if (this.bigShown === 0 || this.big.hidden) return;
		const layer = this.layers.find((one) => one.id === this.bigShown);
		const sheet = drawn.sheets.find((one) => one.id === this.bigShown);
		if (layer && sheet)
			this.drawShot(this.bigCanvas, sheet, layer, drawn.metres);
	}

	private drawShot(
		canvas: HTMLCanvasElement,
		sheet: PlantSheet,
		layer: PlantLayerDraft,
		metres: Float32Array,
	): void {
		if (canvas.width !== sheet.width || canvas.height !== sheet.height) {
			canvas.width = sheet.width;
			canvas.height = sheet.height;
		}
		const context = canvas.getContext("2d");
		if (!context) return;
		const image = context.createImageData(sheet.width, sheet.height);
		paintPlantSheet(
			sheet,
			metres,
			layer.curve,
			layer.leaf,
			this.picture,
			image.data,
		);
		context.putImageData(image, 0, 0);
	}

	/** Bring every control back in line with the draft it edits. */
	refresh(): void {
		for (const made of this.built) {
			const { row, layer, wrap, input, readout, note, redraw, bars } =
				made;
			if (row.kind === "switch") {
				const box = input as HTMLInputElement;
				const flag = row.flag ?? "branches";
				box.checked = layer[flag];
				box.disabled = row.disabledWhen
					? row.disabledWhen(layer)
					: false;
				wrap.classList.toggle("off", !layer[flag] || box.disabled);
				continue;
			}
			if (redraw) {
				redraw();
				// **An unlabelled histogram is a shape, not a measurement.** How
				// much land it counts is what says whether a hump at the left is
				// a continent's worth of ground or a rounding error.
				const tally = this.drawn?.tallies.find(
					(t) => t.id === layer.id,
				);
				if (bars)
					bars.textContent = tally
						? `bars: how much of the planet's ${tally.land.toLocaleString("en-US")} land cells read each value`
						: "bars: the layer is off, so nothing is counted";
				continue;
			}
			if (made.badge) {
				made.badge.textContent = layer.species;
				made.badge.style.background = inkOf(layer.leaf);
				continue;
			}
			if (!input || !readout) continue;
			const value =
				layer.values[row.key as keyof typeof layer.values] ?? 0;
			(input as HTMLInputElement).value = String(value);
			readout.textContent =
				value.toFixed(row.digits ?? 2) +
				(row.unit ? ` ${row.unit}` : "");
			if (note && row.note) note.innerHTML = row.note(layer);
		}
		for (const [id, element] of this.counts) {
			const count = this.drawn?.grown.get(id) ?? 0;
			element.textContent = count
				? `${count.toLocaleString("en-US")} plants`
				: "none";
		}
		for (const [id, card] of this.cards) {
			const layer = this.layers.find((one) => one.id === id);
			if (layer) card.classList.toggle("off", !layer.on);
		}
	}
}
