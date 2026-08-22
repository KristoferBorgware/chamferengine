import type { BenchWorld } from "./BenchWorld.js";
import type { PatchField, PatchFrame } from "./patchField.js";
import type { PatchPicture } from "./PatchLook.js";
import type { PlanetSettings } from "./PlanetSettings.js";
import { positionOf } from "chamfer/coordinates";
import { paintPatch } from "./paintPatch.js";

/** How many pixels across the flat planet is drawn. */
const PLANET_WIDE = 256;

/**
 * The small flat picture above the knobs: the patch, or the whole planet.
 *
 * **The patch is one place and the planet is the world.** A patch a few
 * kilometres across says what the ground does underfoot and cannot say where
 * the continents are; the planet answers the second question, flat, because a
 * globe drawn small hides half of itself.
 *
 * Clicking the planet stands the patch somewhere: finding a range by dragging
 * two sliders is a search with the answer already on screen, so the answer is
 * what you click.
 */
export class BenchPreview {
	private readonly canvas: HTMLCanvasElement;
	private readonly ctx: CanvasRenderingContext2D;

	constructor(
		canvas: HTMLCanvasElement,
		onPick: (place: { latitude: number; longitude: number }) => void,
	) {
		this.canvas = canvas;
		this.ctx = canvas.getContext("2d")!;
		canvas.style.cursor = "crosshair";
		canvas.addEventListener("click", (event: MouseEvent) => {
			if (this.showing !== "planet") return;
			const box = canvas.getBoundingClientRect();
			const across = (event.clientX - box.left) / box.width;
			const down = (event.clientY - box.top) / box.height;
			// The projection is longitude across and latitude down, which
			// inverts to two divisions.
			onPick({
				latitude: (0.5 - down) * 180,
				longitude: across * 360 - 180,
			});
		});
	}

	private showing: "patch" | "planet" = "patch";

	/** Draw the patch as it was sampled, one pixel a point. */
	patch(field: PatchField, picture: PatchPicture, contours: boolean): void {
		this.showing = "patch";
		const n = field.across - 1;
		this.resize(n, n);
		const image = this.ctx.createImageData(n, n);
		for (let r = 0; r < n; r++)
			for (let q = 0; q < n; q++) {
				const from = r * field.across + q;
				paintPatch(image.data, ((n - 1 - r) * n + q) * 4, {
					metres: field.height[from]!,
					raw: field.raw[from]!,
					layer: field.layer[from]!,
					rawLow: field.rawLow,
					rawHigh: field.rawHigh,
					picture,
					contours,
				});
			}
		this.ctx.putImageData(image, 0, 0);
	}

	/**
	 * Draw the whole planet, longitude across and latitude down.
	 *
	 * The one projection where a pixel's direction is two cosines and no case
	 * analysis. It stretches the poles, and it is a picture of where things are
	 * rather than a map anything is measured off.
	 */
	planet(
		world: BenchWorld,
		settings: PlanetSettings,
		frame: PatchFrame,
		span: number,
		picture: PatchPicture,
		contours: boolean,
	): void {
		this.showing = "planet";
		const index = world.cells;
		if (!index) return;
		const wide = PLANET_WIDE;
		const tall = wide / 2;
		this.resize(wide, tall);
		const image = this.ctx.createImageData(wide, tall);
		const layer = picture === "mountain" ? world.mountain : world.terrain;
		let rawLow = Infinity;
		let rawHigh = -Infinity;
		for (const v of world.raw) {
			if (v < rawLow) rawLow = v;
			if (v > rawHigh) rawHigh = v;
		}
		for (let r = 0; r < tall; r++) {
			const lat = (0.5 - (r + 0.5) / tall) * 180;
			for (let q = 0; q < wide; q++) {
				const lon = ((q + 0.5) / wide) * 360 - 180;
				const dir = positionOf(
					{ latitude: lat, longitude: lon, altitude: 0 },
					1,
				);
				paintPatch(image.data, (r * wide + q) * 4, {
					metres: index.sampleAt(world.height, dir),
					raw: index.sampleAt(world.raw, dir),
					layer: index.sampleAt(layer, dir),
					rawLow,
					rawHigh,
					picture,
					contours,
				});
			}
		}
		this.ctx.putImageData(image, 0, 0);

		// The patch, outlined where it stands, so the plane and the map are one
		// place rather than two pictures.
		const half = span / 2 / settings.radius;
		const lat = (settings.knobs.patchLatitude * Math.PI) / 180;
		const across = half / Math.max(0.15, Math.cos(lat));
		const x = ((settings.knobs.patchLongitude + 180) / 360) * wide;
		const top = (0.5 - settings.knobs.patchLatitude / 180) * tall;
		this.ctx.strokeStyle = "rgba(255, 180, 84, 0.9)";
		this.ctx.lineWidth = 1;
		this.ctx.strokeRect(
			x - (across / (2 * Math.PI)) * wide - 0.5,
			top - (half / Math.PI) * tall - 0.5,
			Math.max(2, ((across * 2) / (2 * Math.PI)) * wide) + 1,
			Math.max(2, ((half * 2) / Math.PI) * tall) + 1,
		);
		void frame;
	}

	private resize(width: number, height: number): void {
		if (this.canvas.width === width && this.canvas.height === height)
			return;
		this.canvas.width = width;
		this.canvas.height = height;
	}
}
