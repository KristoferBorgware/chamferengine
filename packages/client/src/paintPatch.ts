import type { PatchPicture } from "./PatchLook.js";
import { GROUND_LINES } from "chamfer/generation";

/**
 * The world's own block colors, linear, in band order.
 *
 * **Under sea level the ground is sand, not water.** The ocean is a surface at
 * one radius rather than a body of blocks, so a sea floor is bare and what
 * makes it blue is the water a look passes through on the way to it. Painting
 * the floor water-colored would show a material the world does not build.
 */
export const BAND_COLORS: readonly (readonly [number, number, number])[] = [
	[0.76, 0.7, 0.5],
	[0.26, 0.44, 0.19],
	[0.42, 0.42, 0.45],
	[0.92, 0.94, 0.97],
];

/** What the sea is, and how far a look reaches into it. */
const SEA_COLOR: readonly [number, number, number] = [0.12, 0.32, 0.55];
const SEA_CLARITY = 45;

/** Which of the four materials stands at a height. */
export function bandOf(metres: number): number {
	if (metres <= 0) return 0;
	if (metres < GROUND_LINES.rock) return 1;
	if (metres < GROUND_LINES.snow) return 2;
	return 3;
}

/** What one pixel of a picture is drawn from. */
export interface PatchPixel {
	readonly metres: number;
	readonly raw: number;
	readonly layer: number;

	/** Metres erosion moved the ground here, and what the picture saturates at. */
	readonly cut: number;
	readonly cutScale: number;
	readonly rawLow: number;
	readonly rawHigh: number;
	readonly picture: PatchPicture;
	readonly contours: boolean;
}

/**
 * One pixel of ground, in whichever picture is selected.
 *
 * Shared by the flat patch and the flat planet, so the two never drift into
 * describing the same height with two different colors. The picture is written
 * to a screen, so the linear block colors are given the curve a screen expects.
 */
export function paintPatch(
	px: Uint8ClampedArray,
	at: number,
	pixel: PatchPixel,
): void {
	if (pixel.picture === "erosion") {
		// **What the water did, on its own.** Cut is red and fill is blue, both
		// against how many metres moved rather than against the height they
		// moved from, so a valley floor a metre lower reads the same wherever
		// it stands. Ground nothing touched is the grey in the middle. The
		// scale is what the run reached, because how far erosion moves the
		// ground depends on the relief, the cell and the strength.
		const t = Math.max(
			-1,
			Math.min(1, pixel.cut / Math.max(0.01, pixel.cutScale)),
		);
		const grey = 0.18;
		px[at] = 255 * Math.pow(grey + Math.max(0, -t) * 0.75, 1 / 2.2);
		px[at + 1] = 255 * Math.pow(grey, 1 / 2.2);
		px[at + 2] = 255 * Math.pow(grey + Math.max(0, t) * 0.75, 1 / 2.2);
		px[at + 3] = 255;
		return;
	}
	if (pixel.picture === "terrain" || pixel.picture === "mountain") {
		const t = Math.max(0, Math.min(1, pixel.layer));
		px[at] = 255 * Math.pow(0.04 + 0.56 * t, 1 / 2.2);
		px[at + 1] = 255 * Math.pow(0.05 + 0.8 * t, 1 / 2.2);
		px[at + 2] = 255 * Math.pow(0.09 + 0.91 * t, 1 / 2.2);
		px[at + 3] = 255;
		return;
	}
	if (pixel.picture !== "ground") {
		// Grey, and stopping at a different step of the build: Height reads
		// elevation everywhere rather than naming a block, and Raw stops before
		// sea level has been taken off the field at all.
		const t =
			pixel.picture === "raw"
				? Math.max(
						0,
						Math.min(
							1,
							(pixel.raw - pixel.rawLow) /
								Math.max(1e-6, pixel.rawHigh - pixel.rawLow),
						),
					)
				: Math.max(0, Math.min(1, (pixel.metres + 400) / 800));
		const v = 255 * Math.pow(t, 1 / 2.2);
		px[at] = v;
		px[at + 1] = v;
		px[at + 2] = pixel.picture === "raw" ? v * 0.9 : v;
		px[at + 3] = 255;
		return;
	}

	const band = BAND_COLORS[bandOf(pixel.metres)]!;
	// Land shades by how far it stands above the band it started in, so a band
	// is one material and still has shape in it. Sea is the floor seen through
	// water, so it shades by how much water is over it -- which is why a beach
	// shows sand and a deep does not.
	const color: [number, number, number] = [0, 0, 0];
	let shade: number;
	if (pixel.metres <= 0) {
		const through = 1 - Math.exp(pixel.metres / SEA_CLARITY);
		for (let ch = 0; ch < 3; ch++)
			color[ch] = band[ch]! + (SEA_COLOR[ch]! - band[ch]!) * through;
		shade = 1;
	} else {
		for (let ch = 0; ch < 3; ch++) color[ch] = band[ch]!;
		shade = 0.72 + 0.28 * Math.min(1, (pixel.metres % 100) / 100);
	}
	if (pixel.contours) {
		// A ring every hundred metres, on the same grid the two material lines
		// sit on.
		const into = ((pixel.metres % 100) + 100) % 100;
		if (into < 4) shade *= 0.6;
	}
	px[at] = 255 * Math.pow(Math.min(1, color[0] * shade), 1 / 2.2);
	px[at + 1] = 255 * Math.pow(Math.min(1, color[1] * shade), 1 / 2.2);
	px[at + 2] = 255 * Math.pow(Math.min(1, color[2] * shade), 1 / 2.2);
	px[at + 3] = 255;
}
