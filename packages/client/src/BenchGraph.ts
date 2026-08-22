import type { PatchAlong } from "./PatchLook.js";
import type { PatchField } from "./patchField.js";
import { GROUND_LINES } from "chamfer/generation";

/** The logical width the graph is drawn in, then scaled to the canvas. */
const WIDTH = 320;

/** Sea level and the two material lines, with what to draw each in. */
const MARKS: readonly (readonly [number, string, string])[] = [
	[0, "#3b6ea8", "sea"],
	[GROUND_LINES.rock, "#5a5a62", "rock"],
	[GROUND_LINES.snow, "#8a8f98", "snow"],
];

/**
 * The patch as sections, every line of it drawn over the others.
 *
 * **One section says what one line of ground does; all of them draw the
 * silhouette** -- how high the whole patch stands, where its ridges are, and
 * how much of it sits at any height. Where the lines bunch is where most of the
 * ground is, so the picture carries the distribution as well as the shape.
 * Which way the sections run is the only choice, because a section along one
 * axis and a section along the other say the same kind of thing.
 *
 * Drawn in a fixed logical box and scaled up to whatever the canvas is, so the
 * text keeps its size on screen rather than shrinking with the panel.
 */
export class BenchGraph {
	private readonly canvas: HTMLCanvasElement;
	private readonly ctx: CanvasRenderingContext2D;
	private readonly says: HTMLElement;

	constructor(canvas: HTMLCanvasElement, says: HTMLElement) {
		this.canvas = canvas;
		this.ctx = canvas.getContext("2d")!;
		this.says = says;
	}

	draw(field: PatchField, along: PatchAlong): void {
		const scale = this.canvas.width / WIDTH;
		const height = this.canvas.height / scale;
		const g = this.ctx;
		g.setTransform(1, 0, 0, 1, 0, 0);
		g.clearRect(0, 0, this.canvas.width, this.canvas.height);
		g.setTransform(scale, 0, 0, scale, 0, 0);
		const pad = { left: 40, right: 8, top: 10, bottom: 24 };
		const plotW = WIDTH - pad.left - pad.right;
		const plotH = height - pad.top - pad.bottom;
		g.fillStyle = "#12161d";
		g.fillRect(0, 0, WIDTH, height);

		const across = field.across;
		const last = across - 1;
		const alongX = along === "x";
		const xHigh = field.span;
		let yLow = Math.min(field.lowest, 0);
		let yHigh = Math.max(field.highest, 1);
		const room = (yHigh - yLow) * 0.06 || 1;
		yLow -= room;
		yHigh += room;
		const toX = (v: number): number => pad.left + (v / xHigh) * plotW;
		const toY = (v: number): number =>
			pad.top + plotH - ((v - yLow) / (yHigh - yLow)) * plotH;

		g.font = "9.5px system-ui, sans-serif";
		for (const [metres, color, name] of MARKS) {
			if (metres < yLow || metres > yHigh) continue;
			const y = toY(metres);
			g.strokeStyle = color;
			g.setLineDash(metres === 0 ? [] : [3, 3]);
			g.beginPath();
			g.moveTo(pad.left, y);
			g.lineTo(WIDTH - pad.right, y);
			g.stroke();
			g.setLineDash([]);
			g.fillStyle = color;
			g.fillText(name, 4, y + 3);
		}

		g.strokeStyle = "#2e3a48";
		g.beginPath();
		g.moveTo(pad.left, pad.top);
		g.lineTo(pad.left, pad.top + plotH);
		g.lineTo(WIDTH - pad.right, pad.top + plotH);
		g.stroke();
		g.fillStyle = "#8b95a4";
		g.fillText(`${Math.round(yHigh)} m`, 4, pad.top + 8);
		g.fillText(`${Math.round(yLow)} m`, 4, pad.top + plotH - 1);
		g.textAlign = "center";
		g.fillText(
			`${Math.round(xHigh).toLocaleString("en-US")} m across the patch, every line of it`,
			pad.left + plotW / 2,
			height - 6,
		);
		g.textAlign = "left";

		const at = (line: number, step: number): number =>
			field.height[alongX ? line * across + step : step * across + line]!;
		const stride = Math.max(1, Math.floor(across / 90));
		g.lineWidth = 0.4;
		g.strokeStyle = "rgba(111, 208, 255, 0.15)";
		for (let line = 0; line < across; line += stride) {
			g.beginPath();
			for (let step = 0; step < across; step++) {
				const x = toX(step * field.step);
				const y = toY(at(line, step));
				if (step === 0) g.moveTo(x, y);
				else g.lineTo(x, y);
			}
			g.stroke();
		}
		// The middle line solid, so there is one section to read against the
		// elevations rather than only a mass.
		g.lineWidth = 1.1;
		g.strokeStyle = "#6fd0ff";
		g.beginPath();
		const mid = last >> 1;
		for (let step = 0; step < across; step++) {
			const x = toX(step * field.step);
			const y = toY(at(mid, step));
			if (step === 0) g.moveTo(x, y);
			else g.lineTo(x, y);
		}
		g.stroke();
		g.lineWidth = 1;

		this.says.textContent =
			`${Math.ceil(across / stride)} lines · ` +
			`ground ${Math.round(field.lowest)} to ${Math.round(field.highest)} m`;
	}
}
