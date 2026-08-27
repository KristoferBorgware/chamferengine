import type { CoarseField } from "./CoarseField.js";
import { BLOCK_COLORS } from "../terrain/blockColor.js";
import { BlockType } from "../terrain/BlockType.js";

/**
 * Every picture the editor can draw of a coarse map, in the order it lists
 * them.
 *
 * **Two pictures of one field.** The map carries a single array — metres above
 * sea level — and these are two ways of looking at it that stop at different
 * points in the build. Height is a grey ramp over the ground the noise makes,
 * before water has touched it, so it redraws without waiting for the slow step
 * and reads elevation everywhere. Ground is the finished surface in the blocks
 * the world builds from, in bands rather than a blend, because a block is one
 * thing or another.
 */
export const COARSE_FIELDS: readonly CoarseField[] = [
	{
		id: "height",
		key: "height",
		stage: "metres",
		label: "Height",
		scale: "linear",
		// Grey, and absolute metres like the other one, so Relief brightens it
		// rather than being normalised away. Sea level is the middle stop.
		ramp: {
			low: -400,
			high: 400,
			stops: [
				[0.03, 0.03, 0.04],
				[0.26, 0.27, 0.3],
				[0.5, 0.51, 0.54],
				[0.76, 0.77, 0.79],
				[1.0, 1.0, 1.0],
			],
		},
	},
	{
		id: "ground",
		key: "height",
		stage: "metres",
		label: "Ground",
		scale: "linear",
		// **Bands, not a blend, and every band is one of the world's blocks.**
		// This picture answers "what is the ground made of here", and the world
		// answers that with four blocks divided by three elevations -- so a
		// color between two of them is a block nothing builds. The bands run on
		// a 100 m grid so all three elevations land on edges: water under sea
		// level, grass to 300 m, bare stone from 300 to 400, snow over 400.
		//
		// **Water is one band because water is one block.** Depth is not a
		// second material -- what makes deep water darker than shallow is how
		// much of it a look passes through -- so shading it would draw sea
		// floors this world does not have. Height is the picture depth is read
		// from.
		//
		// Absolute metres rather than a range stretched to fit whatever this
		// planet holds. A ramp scaled to the field would draw every world the
		// same and make Relief a knob with no picture; stated in metres, a
		// 300 m world is green to its summit and raising Relief walks its peaks
		// up into rock and then snow.
		ramp: {
			low: -100,
			high: 500,
			hard: true,
			stops: [
				BLOCK_COLORS[BlockType.WATER]!,
				BLOCK_COLORS[BlockType.GRASS]!,
				BLOCK_COLORS[BlockType.GRASS]!,
				BLOCK_COLORS[BlockType.GRASS]!,
				BLOCK_COLORS[BlockType.STONE]!,
				BLOCK_COLORS[BlockType.SNOW]!,
			],
		},
	},
] as const;
