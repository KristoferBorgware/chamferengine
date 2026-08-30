import type { PlantLayerDraft, PlantNumberKey } from "./PlantDraft.js";

/** One row of a layer card: a slider, a switch, the curve, or the picture. */
export interface PlantRow {
	readonly key: string;
	readonly label?: string;

	/** A row that is not a slider says which of the five it is. */
	readonly kind?: "curve" | "picture" | "switch" | "biomes";

	/** Which boolean of the draft a switch reads, when the row is one. */
	readonly flag?: "branches" | "leaves";

	/** The hover text on a switch, which has no label of its own. */
	readonly title?: string;

	readonly low?: number;
	readonly high?: number;
	readonly step?: number;
	readonly digits?: number;
	readonly unit?: string;

	/** What the row is for, in words, under the control. */
	readonly note?: (layer: PlantLayerDraft) => string;

	/** Whether the row answers to anything at all in the draft as it stands. */
	readonly disabledWhen?: (layer: PlantLayerDraft) => boolean;
}

/** One folding section of a layer card. */
export interface PlantSection {
	readonly name: string;

	/** Whether it opens unfolded. */
	readonly open?: boolean;

	/** The switch in its heading, which turns the whole section off. */
	readonly flag?: "branches" | "leaves";

	readonly rows: readonly PlantRow[];
}

/** One number's row, so the common shape is written once. */
const slider = (
	key: PlantNumberKey,
	label: string,
	low: number,
	high: number,
	step: number,
	digits: number,
	unit?: string,
	note?: (layer: PlantLayerDraft) => string,
): PlantRow => ({
	key,
	label,
	low,
	high,
	step,
	digits,
	...(unit === undefined ? {} : { unit }),
	...(note === undefined ? {} : { note }),
});

/** How wide a layer's widest and narrowest octaves are, in metres. */
function octaveSpan(layer: PlantLayerDraft): string {
	const widest = layer.values.feature * layer.values.featureScale;
	const narrowest =
		widest / layer.values.lacunarity ** (layer.values.octaves - 1);
	return (
		`widest <b>${Math.round(widest).toLocaleString("en-US")} m</b>, ` +
		`narrowest <b>${Math.round(narrowest).toLocaleString("en-US")} m</b>`
	);
}

/**
 * The rows every vegetation layer carries, in the sections a reader meets them
 * in.
 *
 * **A layer is one kind of plant and everywhere it grows**, which is two
 * questions and not one. *Where* is a noise field of its own read through a
 * curve, and it has to be a field rather than a number because pine on the
 * northern slopes and palm at the shore is a statement about places while a
 * density is a statement about a planet. *What* is the trunk, the branches and
 * the leaves the field then puts there.
 *
 * **Every row here is per layer.** Two layers are two whole plants -- their own
 * noise, their own curve, their own shape -- and nothing is shared but the
 * world they stand on. That is what makes adding a second species an addition
 * rather than a mode.
 */
export const PLANT_SECTIONS: readonly PlantSection[] = [
	{
		name: "Where it grows",
		open: true,
		rows: [
			{
				key: "biomes",
				kind: "biomes",
				label: "Biomes",
				note: () =>
					"grows only in these, by name -- empty is every biome a " +
					"world has",
			},
			{ key: "curve", kind: "curve", label: "Noise → density" },
			{ key: "picture", kind: "picture" },
			slider(
				"density",
				"Density",
				0,
				40,
				0.1,
				1,
				"plants per 100 blocks",
				() =>
					"the densest the curve can ask for · the curve says " +
					"<b>where</b> and this says <b>how many</b>, so re-drawing " +
					"one never undoes the other",
			),
			// **A size in metres, because a frequency is a number about a sphere
			// and a stand of trees is a thing on the ground.** The coarse row
			// carries the decade and the fine one picks the value inside it,
			// since one slider cannot hold a hundred metres and a hundred
			// kilometres at a resolution anybody can drag.
			slider("feature", "Feature", 20, 1000, 10, 0, "m"),
			slider(
				"featureScale",
				"Feature scale",
				1,
				100,
				1,
				0,
				"x",
				octaveSpan,
			),
			slider("octaves", "Octaves", 1, 8, 1, 0),
			slider("persistence", "Falloff", 0.1, 0.9, 0.05, 2),
			slider("lacunarity", "Step between octaves", 1.5, 3, 0.1, 1, "x"),
			slider("fold", "Fold", 0, 1, 0.05, 2, undefined, (layer) =>
				layer.values.fold === 0
					? "the plain sum, bit for bit"
					: "creases every octave at its own zero crossing, which " +
						"draws a stand with an edge rather than one that fades",
			),
			slider(
				"sizeSpread",
				"Size spread",
				0,
				0.8,
				0.05,
				2,
				undefined,
				() =>
					"each plant scales off its own hash, so a stand has " +
					"saplings in it",
			),
		],
	},
	{
		name: "Trunk",
		rows: [
			slider("height", "Height", 0.5, 90, 0.5, 1, "m"),
			slider("trunk", "Base radius", 0.1, 4, 0.05, 2, "m"),
			slider(
				"taper",
				"Taper",
				0.3,
				1,
				0.02,
				2,
				undefined,
				() => "the radius left at the top of each length of branch",
			),
			slider(
				"first",
				"First branch",
				0,
				0.95,
				0.05,
				2,
				"of the height",
				() => "bare trunk under this",
			),
			slider(
				"bend",
				"Bend",
				0,
				1,
				0.05,
				2,
				undefined,
				() =>
					"how far the noise pushes each step of a branch off its heading",
			),
			slider(
				"bendFeature",
				"Bend feature",
				1,
				40,
				0.5,
				1,
				"m",
				() =>
					"how far you walk before the bend changes its mind, so a whole " +
					"stand leans together",
			),
		],
	},
	{
		name: "Branches",
		flag: "branches",
		rows: [
			{
				key: "branches",
				kind: "switch",
				flag: "branches",
				title: "grow branches",
			},
			slider("levels", "Splits", 0, 6, 1, 0),
			slider("children", "Branches per split", 1, 8, 1, 0),
			slider("spread", "Spread", 0.1, 1.6, 0.05, 2, "rad"),
			slider("lengthRatio", "Length kept", 0.2, 0.95, 0.02, 2),
			slider("radiusRatio", "Radius kept", 0.2, 0.95, 0.02, 2),
			slider("up", "Upward pull", -0.5, 1, 0.05, 2),
			slider("droop", "Droop", 0, 1, 0.05, 2),
		],
	},
	{
		name: "Leaves",
		flag: "leaves",
		rows: [
			{
				key: "leaves",
				kind: "switch",
				flag: "leaves",
				title: "grow leaves",
				// **Branches decide whether leaves can grow at all.** A cluster
				// sits at a branch tip or the top of a bare trunk; take the
				// branches away and there is nowhere left for one to sit.
				disabledWhen: (layer) => !layer.branches,
			},
			slider("leafRadius", "Cluster", 0.3, 6, 0.1, 1, "m"),
			slider("leafFill", "Fill", 0.1, 1, 0.05, 2),
			slider(
				"leafRough",
				"Roughness",
				0,
				1,
				0.05,
				2,
				undefined,
				() =>
					"noise cut into the cluster, which is what makes a canopy " +
					"rather than a ball",
			),
			slider("leafTip", "Only at the tips", 0, 1, 0.05, 2),
		],
	},
];
