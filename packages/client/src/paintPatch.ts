import type { PatchPicture } from "./PatchLook.js";
import { BLOCK_COLORS, BlockType, GROUND_LINES } from "chamfer/generation";
import { SEA_CLARITY, SEA_COLORS } from "chamfer/render";

/**
 * The world's own block colors, linear, in band order.
 *
 * **The engine's, not a copy of them.** A picture of the map is a picture of
 * what the world builds there, so a colour chosen twice is two worlds -- and
 * the two would drift the first time either was retuned.
 *
 * **Under sea level the ground is sand, not water.** The ocean is a surface at
 * one radius rather than a body of blocks, so a sea floor is bare and what
 * makes it blue is the water a look passes through on the way to it. Painting
 * the floor water-colored would show a material the world does not build.
 */
export const BAND_COLORS: readonly (readonly [number, number, number])[] = [
	BLOCK_COLORS[BlockType.SAND]!,
	BLOCK_COLORS[BlockType.GRASS]!,
	BLOCK_COLORS[BlockType.STONE]!,
	BLOCK_COLORS[BlockType.SNOW]!,
];

/** Which of the four materials stands at a height. */
export function bandOf(metres: number): number {
	if (metres <= 0) return 0;
	if (metres < GROUND_LINES.rock) return 1;
	if (metres < GROUND_LINES.snow) return 2;
	return 3;
}

/**
 * How many steps a noise picture is cut into.
 *
 * **A smooth ramp of grey says where a field is high and never says how fast.**
 * A layer's picture is read to judge its shapes -- how wide they are, how
 * steeply one runs into the next -- and that is a question about the gradient,
 * which a continuous ramp shows nowhere. Cut into steps it is a contour map.
 */
const PICTURE_BANDS = 9;

/**
 * One noise reading as a step of grey, with a dark line at each step's edge.
 *
 * The reading runs `-1` to `1`, which is the whole range an octave stack fills.
 * The line is what makes the steps read as contours rather than as posterising.
 */
function bandGrey(reading: number): number {
	const t = Math.max(0, Math.min(0.9999, (reading + 1) / 2));
	const step = Math.floor(t * PICTURE_BANDS);
	const grey = 0.06 + (step / (PICTURE_BANDS - 1)) * 0.92;
	const into = t * PICTURE_BANDS - step;
	return grey * (into < 0.06 ? 0.45 : 1);
}

/** What one pixel of a picture is drawn from. */
export interface PatchPixel {
	readonly metres: number;
	readonly raw: number;

	/** The layer's own noise reading, `-1` to `1`, before any curve. */
	readonly layer: number;

	readonly rawLow: number;
	readonly rawHigh: number;

	/** The ground's own range here, which Height is drawn against. */
	readonly low: number;
	readonly high: number;
	readonly picture: PatchPicture;
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
	if (
		pixel.picture === "continent" ||
		pixel.picture === "erosion" ||
		pixel.picture === "peaks" ||
		pixel.picture === "carve"
	) {
		const v = 255 * bandGrey(pixel.layer);
		px[at] = v;
		px[at + 1] = v;
		px[at + 2] = v;
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
				: Math.max(
						0,
						Math.min(
							1,
							(pixel.metres - pixel.low) /
								Math.max(1, pixel.high - pixel.low),
						),
					);
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
		// **The sea's own two colours, the ones the shell in the world is
		// drawn with.** How much of the look is water decides both how far the
		// floor shows through and which of the two it is seen against: a shore
		// is sand under a tint, and open water never gets back out.
		const through = 1 - Math.exp(pixel.metres / SEA_CLARITY);
		for (let ch = 0; ch < 3; ch++) {
			const water =
				SEA_COLORS.shallow[ch]! +
				(SEA_COLORS.deep[ch]! - SEA_COLORS.shallow[ch]!) * through;
			color[ch] = band[ch]! + (water - band[ch]!) * through;
		}
		shade = 1;
	} else {
		for (let ch = 0; ch < 3; ch++) color[ch] = band[ch]!;
		shade = 0.72 + 0.28 * Math.min(1, (pixel.metres % 100) / 100);
		// A ring every hundred metres, on the same grid the two material lines
		// sit on and the same one the patch draws. A flat picture has no
		// shading at all, so this is the whole of what says how steep anything
		// is. **Land only**: the sea is a surface at one radius, so a contour
		// on it would be a ring drawn on water that is everywhere level.
		const into = pixel.metres % 100;
		if (into < 4) shade *= 0.6;
	}
	px[at] = 255 * Math.pow(Math.min(1, color[0] * shade), 1 / 2.2);
	px[at + 1] = 255 * Math.pow(Math.min(1, color[1] * shade), 1 / 2.2);
	px[at + 2] = 255 * Math.pow(Math.min(1, color[2] * shade), 1 / 2.2);
	px[at + 3] = 255;
}
