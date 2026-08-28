import type { CaveCells, CavePlanSheet } from "./CaveMessage.js";
import type { CavePlan } from "./PatchLook.js";
import { latticeContour } from "./latticeContour.js";
import { marchingSquares } from "./marchingSquares.js";

/** The line the raster's contour is drawn in, and the lattice's own. */
const RASTER_LINE = "#6fd0ff";
const LATTICE_LINE = "#ffb56b";

/** What the plan is drawn on, behind everything else. */
const BACKDROP = "#05070a";

/** How much of the plan's own band a passage's shade runs over. */
function passageColor(open: number): string {
	// Bright at the spine and falling off to the rim, which is the same
	// quantity a roof height would be taken from -- so the picture reads as a
	// passage with a shape rather than as a stencil.
	const t = Math.min(1, Math.max(0, open));
	return `rgb(${Math.round(40 + 200 * t)},${Math.round(60 + 170 * t)},${Math.round(80 + 90 * t)})`;
}

/** What a plan pass drew, for the line under it. */
export interface PlanSays {
	readonly across: number;
	readonly segments: number;
	readonly latticeSegments: number;
}

/**
 * The plan: one slice of the cave field over the patch, drawn four ways.
 *
 * **The picture and the world are two different things and the plan holds
 * both.** The raster is the field sampled on a square grid, which is what a
 * contour is meant for and what says where the passages *are*; the hexagons are
 * what the world is built out of, and where the two part company is where the
 * lattice cannot draw what the field says.
 *
 * One scale for both axes, or the hexagons stop being hexagons: the canvas
 * takes the patch's own shape rather than a square with the picture stranded
 * across the middle of it.
 */
export function drawCavePlan(
	canvas: HTMLCanvasElement,
	scratch: HTMLCanvasElement,
	plan: CavePlanSheet,
	cells: CaveCells,
	picture: CavePlan,
	lattice: boolean,
	threshold: number,
): PlanSays {
	const ctx = canvas.getContext("2d");
	if (!ctx) return { across: 0, segments: 0, latticeSegments: 0 };
	const wide = cells.high[0] - cells.low[0];
	const tall = cells.high[1] - cells.low[1];
	const size = canvas.width;
	const scale = size / wide;
	canvas.height = Math.max(1, Math.round((size * tall) / wide));
	// **North is up.** The flat frame's north grows the way a map's does and a
	// canvas grows downward, so the picture is drawn from the far edge back.
	const toPixel = (e: number, n: number): [number, number] => [
		(e - cells.low[0]) * scale,
		(cells.high[1] - n) * scale,
	];

	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.fillStyle = BACKDROP;
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	if (picture !== "hexes") {
		scratch.width = plan.across;
		scratch.height = plan.across;
		const g = scratch.getContext("2d");
		if (g) {
			const image = g.createImageData(plan.across, plan.across);
			for (let r = 0; r < plan.across; r++)
				for (let q = 0; q < plan.across; q++) {
					const from = r * plan.across + q;
					// The sheet is sampled from the south edge outward and a
					// picture runs the other way, so the rows are turned over
					// here rather than everywhere they are read.
					const to = (plan.across - 1 - r) * plan.across + q;
					const band = plan.band[from]!;
					const v = plan.value[from]!;
					const open =
						band > 0 ? Math.max(0, (band - Math.abs(v)) / band) : 0;
					let red: number;
					let green: number;
					let blue: number;
					if (open > 0) {
						red = 40 + 200 * open;
						green = 60 + 170 * open;
						blue = 80 + 90 * open;
					} else {
						const away = Math.min(1, Math.abs(v));
						red = 10 + 14 * away;
						green = 14 + 18 * away;
						blue = 20 + 26 * away;
					}
					image.data[to * 4] = red;
					image.data[to * 4 + 1] = green;
					image.data[to * 4 + 2] = blue;
					image.data[to * 4 + 3] = 255;
				}
			g.putImageData(image, 0, 0);
			ctx.imageSmoothingEnabled = true;
			ctx.drawImage(scratch, 0, 0, canvas.width, canvas.height);
		}
	}

	if (picture === "hexes" || picture === "both") {
		for (let c = 0; c < cells.count; c++) {
			const open = cells.open[c]!;
			if (open <= 0) continue;
			ctx.beginPath();
			for (let m = 0; m < 6; m++) {
				const [px, py] = toPixel(
					cells.corners[c * 12 + m * 2]!,
					cells.corners[c * 12 + m * 2 + 1]!,
				);
				if (m === 0) ctx.moveTo(px, py);
				else ctx.lineTo(px, py);
			}
			ctx.closePath();
			ctx.fillStyle = passageColor(open);
			ctx.fill();
		}
	}

	// The contour itself: the two edges of the band, at plus and minus the
	// width. Nothing is drawn at all where the ceiling shuts the depth out,
	// because the field still crosses zero there and no passage does.
	const edges = [-threshold, threshold];
	let segments = 0;
	if (picture !== "hexes") {
		ctx.strokeStyle = RASTER_LINE;
		ctx.lineWidth = 1.6;
		ctx.beginPath();
		const across = plan.across;
		for (const level of edges)
			marchingSquares(plan.value, across, across, level, (a, b) => {
				const shut =
					plan.band[
						Math.min(
							across * across - 1,
							Math.max(
								0,
								Math.round(a[1]) * across + Math.round(a[0]),
							),
						)
					] === 0;
				if (shut) return;
				segments++;
				const px = (p: readonly [number, number]): [number, number] => [
					(p[0] / (across - 1)) * canvas.width,
					((across - 1 - p[1]) / (across - 1)) * canvas.height,
				];
				const [ax, ay] = px(a);
				const [bx, by] = px(b);
				ctx.moveTo(ax, ay);
				ctx.lineTo(bx, by);
			});
		ctx.stroke();
	}

	let latticeSegments = 0;
	if (lattice) {
		ctx.strokeStyle = LATTICE_LINE;
		ctx.lineWidth = 1.2;
		ctx.beginPath();
		for (const level of edges)
			latticeContour(cells, level, (a, b) => {
				latticeSegments++;
				const [ax, ay] = toPixel(a[0], a[1]);
				const [bx, by] = toPixel(b[0], b[1]);
				ctx.moveTo(ax, ay);
				ctx.lineTo(bx, by);
			});
		ctx.stroke();
	}

	return { across: wide, segments, latticeSegments };
}
