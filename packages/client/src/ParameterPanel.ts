import type { KnobRange, LayerName, PlanetKnobs } from "./PlanetSettings.js";
import {
	KNOB_RANGES,
	LAYER_NAMES,
	LAYER_TITLES,
	LIVE_TERRAIN_KNOBS,
	REMESH_KNOBS,
	PlanetSettings,
	copyKnobs,
} from "./PlanetSettings.js";
import {
	CARVE_SEED_OFFSET,
	CONTINENT_SEED_OFFSET,
	EROSION_SEED_OFFSET,
	PEAKS_SEED_OFFSET,
	layerNoiseSettings,
	octaveNoise,
	seedFromString,
	splineAt,
} from "chamfer/generation";
import { PLAYER_DEFAULTS } from "chamfer/player";

/** Each layer's own seed offset, so the four are four fields. */
const LAYER_SEED_OFFSETS: Record<LayerName, number> = {
	continent: CONTINENT_SEED_OFFSET,
	erosion: EROSION_SEED_OFFSET,
	peaks: PEAKS_SEED_OFFSET,
	carve: CARVE_SEED_OFFSET,
};

/**
 * The colour each layer's curve is drawn in.
 *
 * The same four the group headings and the bench's pictures use: a reader
 * looking at four curves has nothing else to tell them apart by.
 */
const LAYER_INKS: Record<LayerName, string> = {
	continent: "#ffd166",
	erosion: "#8ce99a",
	peaks: "#ff9db1",
	carve: "#c9a7ff",
};

/**
 * Where the dashed line sits on each curve, in that curve's own units.
 *
 * Erosion has none: its axis is how much is taken away, from none to all of
 * it, and there is no level on that worth naming.
 */
const CURVE_MARKS: Record<LayerName, { at: number; name: string } | null> = {
	// The middle of the curve is the waterline, and where the curve crosses it
	// is the coast.
	continent: { at: 0.5, name: "sea" },
	erosion: null,
	// Half way up leaves the column where the continent put it: below cuts a
	// valley and above raises a peak.
	peaks: { at: 0.5, name: "level" },
	// The density runs -1 to +1 and a block is rock where it is over zero, so
	// half way up this axis is that rule drawn on the curve.
	carve: { at: 0.5, name: "rock" },
};

/** One row of the panel. */
interface Knob {
	readonly key: keyof PlanetKnobs;
	readonly label: string;

	readonly digits?: number;

	/**
	 * Whether this row does anything, given the rest of the draft.
	 *
	 * A row that fails this is disabled rather than hidden: the number is
	 * still there to look at, and turning the knob it depends on back on picks
	 * up wherever this one was left.
	 */
	readonly enabledWhen?: (knobs: PlanetKnobs) => boolean;

	/**
	 * Whether this row is drawn at all, given the rest of the draft.
	 *
	 * A row that fails this is taken off the panel rather than greyed out. It
	 * is for a knob that has no meaning under the current choice -- a jitter
	 * with no feature points to jitter -- where a disabled row would be a
	 * question the reader has to answer before dismissing.
	 */
	readonly shownWhen?: (knobs: PlanetKnobs) => boolean;

	/** Whether the map pane redraws when this moves. */
	readonly map?: boolean;

	/**
	 * What the world got, when that is not what was asked for, as numbers.
	 *
	 * Several of these are requests rather than settings: a puff size and a map
	 * cell are both answered as a lattice level, and a radius moves to whatever
	 * makes the block size exact.
	 */
	readonly given?: (settings: PlanetSettings) => string | null;

	/**
	 * Whether this row is a curve rather than a number.
	 *
	 * A curve is dragged, not slid: across is the layer's own noise value and
	 * up is what it controls, and the shape between two points is what puts an
	 * edge on a region. There is no slider that says that.
	 */
	readonly curve?: boolean;

	/** Named choices, for a knob that is one of a few things rather than a number. */
	readonly choices?: readonly {
		readonly value: string;
		readonly label: string;
	}[];
}

/** One titled run of rows. */
interface Group {
	readonly title: string;

	/** Whether the group starts folded away. */
	readonly folded?: boolean;

	/**
	 * Which panel the group is drawn on.
	 *
	 * The bench and the planet share every knob that decides the map, and
	 * neither has any use for the other's. There is no sky on the bench and no
	 * preview patch on the planet, so a row for either on the wrong page is a
	 * row that moves nothing. Groups say `world` unless told otherwise.
	 */
	readonly where?: "world" | "bench" | "both";

	/**
	 * Which of the bench's two panels the group stands in.
	 *
	 * **What is being looked at goes left; what is being changed goes right.**
	 * The left panel is the world as it came out -- what it is, how finely it
	 * is cut, and where the patch is standing in it -- and the right is the
	 * knobs that decide the ground. The planet has one panel and ignores this.
	 */
	readonly side?: "left" | "right";

	/**
	 * Which of the right pane's two tabs the group stands under.
	 *
	 * Ignored on the bench, which has no tabs, and ignored on a group marked
	 * {@link Group.aboveTabs}. `"settings"` unless stated, because that is
	 * what most of the panel is.
	 */
	readonly tab?: "terrain" | "settings";

	/**
	 * Whether the group sits above both tabs, in neither of them.
	 *
	 * For the one section that is not really a setting: the map is where a
	 * click stands the player somewhere, which is a thing to reach whichever
	 * tab is open, not a knob filed under one of two questions.
	 */
	readonly aboveTabs?: boolean;

	/**
	 * The colour this group's heading and its curve are drawn in.
	 *
	 * **A layer and its curve have to be the same colour**, or a reader looking
	 * at four curves has nothing to tell them apart by -- and the pictures the
	 * bench draws are named by the same four.
	 */
	readonly tint?: "cont" | "ero" | "pv" | "cliff";

	readonly knobs: Knob[];
}

/**
 * The rows every layer carries, stamped out once per layer.
 *
 * **Written once, because the whole claim is that the layers differ in what
 * they say rather than in what they are.** A layer given a row its neighbours
 * have not got would be a fifth idea smuggled into a comparison of four.
 *
 * **The curve goes first**, because it is what the layer is for: the stack's
 * own rows only say how coarse or fine the reading is, and the curve is the
 * decision. The carve has no fold -- a fold creases a whole world at once,
 * which is what makes it a landform knob, and a crease in a carve field is one
 * nobody can see from inside the cave it cuts.
 */
function layerKnobs(layer: LayerName, curveLabel: string): Knob[] {
	const on = (k: PlanetKnobs): boolean =>
		!k.plain && (k as unknown as Record<string, boolean>)[`${layer}Layer`]!;
	const rows: Knob[] = [
		{
			key: `${layer}Layer` as keyof PlanetKnobs,
			map: true,
			label: "On",
			enabledWhen: (k) => !k.plain,
		},
		{
			key: `${layer}Curve` as keyof PlanetKnobs,
			map: true,
			label: curveLabel,
			curve: true,
			enabledWhen: on,
		},
		{
			key: `${layer}Feature` as keyof PlanetKnobs,
			map: true,
			label: "Feature",
			digits: 0,
			enabledWhen: on,
		},
		{
			key: `${layer}FeatureScale` as keyof PlanetKnobs,
			map: true,
			label: "Feature scale",
			digits: 0,
			enabledWhen: on,
			given: (s) =>
				`widest ${Math.round(s.widestOf(layer)).toLocaleString()} m, narrowest ${Math.round(s.narrowestOf(layer)).toLocaleString()} m`,
		},
		{
			key: `${layer}Octaves` as keyof PlanetKnobs,
			map: true,
			label: "Octaves",
			digits: 0,
			enabledWhen: on,
		},
		{
			key: `${layer}Persistence` as keyof PlanetKnobs,
			map: true,
			label: "Falloff",
			digits: 2,
			enabledWhen: on,
		},
		{
			key: `${layer}Lacunarity` as keyof PlanetKnobs,
			map: true,
			label: "Step between octaves",
			digits: 1,
			enabledWhen: on,
		},
	];
	if (layer !== "carve")
		rows.push({
			key: `${layer}Fold` as keyof PlanetKnobs,
			map: true,
			label: "Fold",
			digits: 2,
			enabledWhen: on,
			given: (s) =>
				(s.knobs as unknown as Record<string, number>)[
					`${layer}Fold`
				] === 0
					? "the plain sum, bit for bit"
					: "creases every octave at its own zero crossing, which is the only place a ridge line can come from",
		});
	return rows;
}

/**
 * What the panel shows, grouped by what a knob decides and ordered by how much
 * of the world it moves.
 *
 * **No prose.** A row is a label, a number and its unit, and under it the
 * bounds the rest of the draft leaves it -- nothing that has to be read. Every
 * knob here moves a picture, so the picture is the explanation.
 */
const GROUPS: Group[] = [
	{
		// **What the world came out as, rather than what was asked for.**
		// Nothing here is a knob: a build fills it in, and the page that owns
		// the numbers writes them into it. It is the first thing on the left
		// because a reader turning a knob on the right is asking what it did.
		title: "General",
		where: "bench",
		side: "left",
		knobs: [],
	},
	{
		// How the planet is cut up. Every row moves the ground's resolution or
		// the world's size rather than its shape.
		title: "Planet",
		where: "bench",
		side: "left",
		folded: true,
		knobs: [
			{
				key: "subdivisionDepth",
				map: true,
				label: "Depth",
				digits: 0,
				given: (s) => `${s.radius.toFixed(0)} m radius`,
			},
			{
				key: "coarseSpacing",
				map: true,
				label: "Map cell",
				digits: 0,
				enabledWhen: (k) => !k.plain,
				given: (s) =>
					Math.abs(s.coarseCell - s.knobs.coarseSpacing) < 1
						? null
						: `${s.coarseCell.toFixed(0)} m, level ${s.coarseLevel}`,
			},
			{
				key: "blockSize",
				label: "Block size",
				digits: 2,
			},
			{
				key: "chunkCells",
				label: "Chunk",
				digits: 0,
			},
			{
				key: "crustMetres",
				label: "Crust reaches",
				digits: 0,
				given: (s) =>
					s.crustCap === "asked"
						? null
						: `${(s.crustDepth * s.knobs.blockSize).toFixed(0)} m, ${s.crustDepth} layers`,
			},
		],
	},
	{
		// **Where the bench is looking, and how.** Not one of these is read by
		// the engine: they move the picture and leave the ground exactly where
		// it was, so a link carrying them describes the same planet.
		title: "Viewport",
		where: "bench",
		side: "left",
		knobs: [
			{
				key: "patchLatitude",
				label: "Latitude",
				digits: 0,
			},
			{
				key: "patchLongitude",
				label: "Longitude",
				digits: 0,
			},
			{
				key: "patchCells",
				label: "Cells across",
				digits: 0,
			},
			{
				// **The map is not the grid the world is built on.** A map cell
				// is a reading and a block is a hexagon one layer tall; every
				// cliff, overhang and arch is a shape in that grid rather than
				// in the map's, so the patch is drawn on it and this says how
				// far under the map that is.
				key: "patchDetail",
				label: "Block detail",
				digits: 0,
			},
			{
				key: "patchMap",
				label: "Map shows",
				choices: [
					{ value: "patch", label: "The patch" },
					{ value: "planet", label: "The planet" },
				],
			},
			{
				key: "patchPicture",
				label: "Picture",
				choices: [
					{ value: "ground", label: "Ground" },
					{ value: "height", label: "Height" },
					{ value: "raw", label: "Raw" },
					{ value: "continent", label: "Continentalness" },
					{ value: "erosion", label: "Erosion" },
					{ value: "peaks", label: "Peaks & valleys" },
					{ value: "carve", label: "Cliffs & overhangs" },
				],
			},
			{
				// **The one thing that says where one hexagon ends.** A slope
				// of one material at one height is a single sheet of colour
				// however it is lit, and the lattice the world is built on --
				// which is this bench's whole subject -- is invisible in it.
				// The same knob and the same drift the world's own mesher
				// bakes, so a hexagon here is the shade that hexagon will be.
				key: "speckle",
				label: "Speckle",
			},
			{
				key: "patchSurface",
				label: "Surface",
				choices: [
					{ value: "solid", label: "Solid" },
					{ value: "wire", label: "Cell rims" },
					{ value: "both", label: "Both" },
				],
			},
			{
				key: "patchAlong",
				label: "Contour along",
				choices: [
					{ value: "x", label: "East" },
					{ value: "z", label: "North" },
				],
			},
		],
	},
	{
		// **What the world is doing, where the knobs that change it are.** It
		// sat over the top-left corner of the view, which is a box of numbers
		// standing on the ground it describes; in the panel it is one fold
		// among the rest and the window is the world again. The page that owns
		// the readout fills it in -- nothing here is a knob.
		title: "Readout",
		where: "world",
		folded: true,
		tab: "settings",
		knobs: [],
	},
	{
		// **The one picture the world cannot draw of itself.** Standing on the
		// ground says nothing about where the land is; this is the whole planet
		// as the map holds it, flat and on a ball, with the player marked on
		// both. Nothing in it is a knob -- the page that owns the map fills it
		// in.
		title: "Map",
		where: "world",
		aboveTabs: true,
		knobs: [],
	},
	{
		title: "Continentalness",
		where: "both",
		folded: true,
		tab: "terrain",
		tint: "cont",
		knobs: layerKnobs(
			"continent",
			"Continentalness → how high the land stands",
		),
	},
	{
		title: "Erosion",
		where: "both",
		folded: true,
		tab: "terrain",
		tint: "ero",
		knobs: [
			...layerKnobs("erosion", "Erosion → how much it cuts away"),
			{
				// **The half of erosion that is not about relief.** Water lowers
				// a range as well as smoothing it, and where the height is one
				// function of all three fields, erosion changes the level by
				// construction. Flattened into one line it has to be a term of
				// its own.
				key: "erosionBite",
				map: true,
				label: "Wears the level down",
				digits: 2,
				enabledWhen: (k) => !k.plain && k.erosionLayer,
			},
		],
	},
	{
		title: "Peaks & valleys",
		where: "both",
		folded: true,
		tab: "terrain",
		tint: "pv",
		knobs: layerKnobs("peaks", "Peaks & valleys → the relief itself"),
	},
	{
		title: "Cliffs & overhangs",
		where: "both",
		folded: true,
		tab: "terrain",
		tint: "cliff",
		knobs: layerKnobs("carve", "Noise → density"),
	},
	{
		title: "Ground",
		where: "both",
		side: "left",
		folded: true,
		tab: "terrain",
		knobs: [
			{
				key: "relief",
				map: true,
				label: "Relief",
				digits: 0,
				enabledWhen: (k) => !k.plain,
				given: (s) =>
					`the top half of the continentalness curve, so the highest a continent stands before peaks are added — a full peak reaches ${Math.round(s.knobs.relief + s.knobs.peakRelief)} m`,
			},
			{
				key: "seaDepth",
				map: true,
				label: "Sea depth",
				digits: 0,
				enabledWhen: (k) => !k.plain,
				given: () =>
					"the bottom half of the same curve · it deepens the ocean and leaves the land where it is, because the coast is where the curve crosses the middle",
			},
			{
				key: "peakRelief",
				map: true,
				label: "Peak relief",
				digits: 0,
				enabledWhen: (k) => !k.plain && k.peaksLayer,
				given: (s) =>
					`a full peak over a full valley is ${Math.round(2 * s.knobs.peakRelief)} m`,
			},
			{
				key: "seaLevel",
				map: true,
				label: "Sea level",
				digits: 0,
				enabledWhen: (k) => !k.plain,
				given: () =>
					"the water moves off the curve's own middle · at no erosion bite the whole field lifts by exactly these metres and no ground moves",
			},
		],
	},
	{
		title: "Paused",
		folded: true,
		knobs: [
			{
				key: "plain",
				label: "Plain planet",
			},
		],
	},
	{
		title: "Air",
		folded: true,
		knobs: [
			{
				key: "atmosphereOn",
				label: "Enabled",
				enabledWhen: (k) => !k.plain,
			},
			{
				key: "inScatteringPoints",
				label: "In scattering points",
				digits: 0,
				enabledWhen: (k) => !k.plain && k.atmosphereOn,
			},
			{
				key: "opticalDepthPoints",
				label: "Optical depth points",
				digits: 0,
				enabledWhen: (k) => !k.plain && k.atmosphereOn,
			},
			{
				key: "skyDither",
				label: "Sky dither",
				digits: 2,
				enabledWhen: (k) => !k.plain && k.atmosphereOn,
			},
			{
				key: "densityFalloff",
				label: "Density falloff",
				digits: 1,
				enabledWhen: (k) => !k.plain && k.atmosphereOn,
			},
			{
				key: "wavelengthRed",
				label: "Wavelength red",
				digits: 0,
				enabledWhen: (k) => !k.plain && k.atmosphereOn,
			},
			{
				key: "wavelengthGreen",
				label: "Wavelength green",
				digits: 0,
				enabledWhen: (k) => !k.plain && k.atmosphereOn,
			},
			{
				key: "wavelengthBlue",
				label: "Wavelength blue",
				digits: 0,
				enabledWhen: (k) => !k.plain && k.atmosphereOn,
			},
			{
				key: "scatteringStrength",
				label: "Scattering strength",
				digits: 2,
				enabledWhen: (k) => !k.plain && k.atmosphereOn,
			},
			{
				key: "skyIntensity",
				label: "Sky brightness",
				digits: 2,
				enabledWhen: (k) => !k.plain && k.atmosphereOn,
			},
			{
				key: "mieStrength",
				label: "Haze",
				digits: 2,
				enabledWhen: (k) => !k.plain && k.atmosphereOn,
			},
			{
				key: "mieDirection",
				label: "Haze forward",
				digits: 2,
				enabledWhen: (k) =>
					!k.plain && k.atmosphereOn && k.mieStrength > 0,
			},
			{
				key: "aerialPerspective",
				label: "Haze on distance",
				digits: 2,
				enabledWhen: (k) => !k.plain && k.atmosphereOn,
			},
			{
				key: "atmosphereScale",
				label: "Atmosphere scale",
				digits: 3,
				enabledWhen: (k) => !k.plain && k.atmosphereOn,
			},
		],
	},
	{
		title: "Time",
		folded: true,
		knobs: [
			{
				key: "dayLength",
				label: "Day",
				digits: 0,
				enabledWhen: (k) => !k.plain,
			},
			{
				key: "paused",
				label: "Pause",
				enabledWhen: (k) => !k.plain,
			},
			{
				key: "timeOfDay",
				label: "Time of day",
				digits: 2,
				enabledWhen: (k) => !k.plain,
			},
		],
	},
	{
		title: "Light",
		folded: true,
		knobs: [
			{
				key: "cascadeShadows",
				label: "Shadow maps",
				enabledWhen: (k) => !k.plain,
			},
			{
				key: "cascadeReach",
				label: "Shadow map reach",
				digits: 0,
				enabledWhen: (k) => !k.plain && k.cascadeShadows,
			},
			{
				key: "cloudShadows",
				label: "Cloud shadows",
				enabledWhen: (k) => !k.plain && k.cloudsDrawn,
			},
			{
				key: "cloudShadow",
				label: "How dark a cloud",
				digits: 2,
				enabledWhen: (k) => !k.plain && k.cloudsDrawn && k.cloudShadows,
			},
			{
				key: "cloudShadowReach",
				label: "Cloud shadow reach",
				digits: 0,
				enabledWhen: (k) => !k.plain && k.cloudsDrawn && k.cloudShadows,
			},
			{
				key: "shadowTexels",
				label: "Shadow map texels",
				digits: 0,
				enabledWhen: (k) =>
					!k.plain && (k.cascadeShadows || k.cloudShadows),
			},
			{
				// **The sun as though no block stood in its way**, so a cave
				// can be looked into before there is anything to carry down
				// it. Not a flat light: the face's own angle to the sun still
				// decides what it takes, so the shape stays. It reaches the
				// mesher too -- the sky exposure is baked, and no light
				// computed afterwards can divide it back out -- which is why
				// it wants a rebuild.
				key: "fullbright",
				label: "Full light",
				enabledWhen: (k) => !k.plain,
			},
			{
				key: "sunStrength",
				label: "Sunlight",
				digits: 2,
				enabledWhen: (k) => !k.plain,
			},
			{
				// The ground's own ambient term -- what is still lighting a
				// face once the sun is at 0 -- and a different knob from
				// both **Exposure**, which scales the whole finished frame
				// after this and the sun are already added together, and
				// **Sky brightness** under **The air**, which is the marched
				// atmosphere's own brightness rather than this.
				key: "skyStrength",
				label: "Ambient brightness",
				digits: 2,
				enabledWhen: (k) => !k.plain,
			},
			{
				// The one term that can still look directional with the sun
				// off: a face's own angle to the sky, not to the sun. Zero
				// gives every face the open-sky reading and stops it varying
				// by shape at all.
				key: "skyShading",
				label: "Sky shading",
				digits: 2,
				enabledWhen: (k) => !k.plain,
			},
			{
				key: "moonLight",
				label: "Moonlight",
				digits: 2,
				enabledWhen: (k) => !k.plain,
			},
			{
				key: "exposure",
				label: "Exposure",
				digits: 2,
			},
			{
				key: "bloomOn",
				label: "Bloom",
			},
			{
				key: "bloomThreshold",
				label: "Bloom above",
				digits: 2,
				enabledWhen: (k) => k.bloomOn,
			},
			{
				key: "bloomStrength",
				label: "Bloom strength",
				digits: 2,
				enabledWhen: (k) => k.bloomOn,
			},
			{
				key: "skyBounce",
				label: "Sky bounce",
				digits: 2,
				enabledWhen: (k) => !k.plain && k.skyExposure && !k.fullbright,
				given: () => "the sky's bounce, not the sun's",
			},
			{
				key: "ssao",
				label: "SSAO",
				enabledWhen: (k) => !k.plain,
				given: () => "a second pass over the geometry",
			},
			{
				key: "ssaoReach",
				label: "SSAO reach",
				digits: 1,
				enabledWhen: (k) => !k.plain && k.ssao,
			},
			{
				key: "ssaoStrength",
				label: "SSAO strength",
				digits: 2,
				enabledWhen: (k) => !k.plain && k.ssao,
			},
			{
				key: "ssgi",
				label: "SSGI",
				enabledWhen: (k) => !k.plain,
				given: () => "only from what is on screen",
			},
			{
				key: "ssgiReach",
				label: "SSGI reach",
				enabledWhen: (k) => !k.plain && k.ssgi,
			},
			{
				key: "ssgiStrength",
				label: "SSGI strength",
				digits: 2,
				enabledWhen: (k) => !k.plain && k.ssgi,
			},
			{
				key: "superSample",
				label: "Supersample",
				digits: 2,
				given: (s) =>
					s.knobs.superSample <= 1
						? null
						: `${(s.knobs.superSample ** 2).toFixed(1)}x the pixels`,
			},
		],
	},
	{
		title: "Waves",
		folded: true,
		knobs: [
			{
				key: "seaDrawn",
				label: "Draw the sea",
				enabledWhen: (k) => !k.plain,
			},
			{
				key: "waveHeight",
				label: "Wave height",
				digits: 1,
				enabledWhen: (k) => !k.plain,
			},
			{
				key: "waveScale",
				label: "Between crests",
				digits: 0,
				enabledWhen: (k) => !k.plain,
			},
			{
				key: "waveSpeed",
				label: "Wave speed",
				digits: 2,
				enabledWhen: (k) => !k.plain,
			},
			{
				key: "seaWireframe",
				label: "Show the mesh",
				enabledWhen: (k) => !k.plain && k.seaDrawn,
			},
			{
				key: "seaChop",
				label: "Chop",
				digits: 1,
				enabledWhen: (k) => !k.plain,
			},
			{
				key: "seaFoam",
				label: "Foam",
				digits: 2,
				enabledWhen: (k) => !k.plain,
			},
			{
				key: "seaOpacity",
				label: "How solid",
				digits: 2,
				enabledWhen: (k) => !k.plain,
			},
			{
				key: "seaClarity",
				label: "See into it",
				digits: 0,
				enabledWhen: (k) => !k.plain,
			},
			{
				key: "seaGlint",
				label: "Sun on the water",
				digits: 2,
				enabledWhen: (k) => !k.plain,
			},
			{
				key: "seaRipple",
				label: "Ripple",
				digits: 2,
				enabledWhen: (k) => !k.plain,
			},
			{
				key: "seaGrouping",
				label: "Calm and rough",
				digits: 2,
				enabledWhen: (k) => !k.plain,
			},
		],
	},
	{
		title: "Clouds",
		folded: true,
		knobs: [
			{
				key: "cloudsDrawn",
				label: "Draw the clouds",
				enabledWhen: (k) => !k.plain,
			},
			{
				key: "lowDeck",
				label: "Low deck",
				digits: 0,
				enabledWhen: (k) => !k.plain,
			},
			{
				key: "highDeck",
				label: "High deck",
				digits: 0,
				enabledWhen: (k) => !k.plain,
			},
			{
				key: "cloudPuff",
				label: "Puff",
				digits: 0,
				enabledWhen: (k) => !k.plain,
			},
			{
				key: "cloudClusters",
				label: "Formations",
				digits: 0,
				enabledWhen: (k) => !k.plain,
			},
			{
				key: "cloudDensity",
				label: "Puffs each",
				digits: 0,
				enabledWhen: (k) => !k.plain,
			},
			{
				key: "cloudSpread",
				label: "Formation across",
				digits: 0,
				enabledWhen: (k) => !k.plain,
			},
		],
	},
	{
		title: "Grid",
		folded: true,
		knobs: [
			{
				key: "gridMode",
				label: "Grid",
			},
			{
				key: "gridLevels",
				label: "Levels",
				shownWhen: (k) => k.gridMode,
			},
			{
				key: "gridCells",
				label: "Cells",
				shownWhen: (k) => k.gridMode,
			},
			{
				key: "gridChunks",
				label: "Chunks",
				shownWhen: (k) => k.gridMode,
			},
			{
				key: "gridFaces",
				label: "Faces",
				shownWhen: (k) => k.gridMode,
			},
		],
	},
	{
		title: "Drawing",
		folded: true,
		knobs: [
			{
				key: "detail",
				label: "Full detail to",
				digits: 1,
			},
			{
				key: "buildCull",
				label: "Build only what is in view",
			},
			{
				key: "cullMargin",
				label: "Keep beyond the view",
				digits: 0,
				shownWhen: (k) => k.buildCull,
			},
			{
				key: "nearestFirst",
				label: "Build nearest first",
			},
			{
				key: "apron",
				label: "Apron",
			},
			{
				// **A cell is the colour its block registry names, or it is
				// not.** The speckle moves every cell up to 6% either way from
				// a hash of its own address, which is what keeps a hillside of
				// one block type from reading as a sheet -- and it is the one
				// thing between the ground and the list of colours the map
				// pictures are painted from.
				key: "speckle",
				label: "Speckle",
			},
			{
				// **Baked into the mesh, not a shader term.** A vertex's own
				// corner has no way to see which cells stand around it, so
				// this is carried as a light multiplier at build time --
				// which is why turning it off costs a rebuild rather than a
				// frame.
				key: "ambientOcclusion",
				label: "Corner shading",
			},
			{
				// **The only light this world has.** Read per layer, so a
				// hole goes dark as it deepens -- and with no torch to carry
				// down there, off is the only way to see what you dug.
				key: "skyExposure",
				label: "Sky exposure",
			},
			{
				key: "seamOverlay",
				label: "Seam overlay",
			},
			{
				key: "selectBounds",
				label: "Selection bounds",
			},
			{
				key: "patchBounds",
				label: "Patch bounds",
			},
			{
				key: "freezeView",
				label: "Freeze view",
			},
		],
	},
	{
		title: "Player",
		folded: true,
		knobs: [
			{
				key: "walkSpeed",
				label: "Walk speed",
				digits: 1,
			},
			{
				key: "flySpeed",
				label: "Fly speed",
				digits: 0,
			},
			{
				key: "reach",
				label: "Reach",
				digits: 0,
			},
		],
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
/** One built row, held onto so {@link ParameterPanel.refresh} can update it. */
interface Row {
	readonly knob: Knob;
	readonly wrap: HTMLElement;
	readonly input: HTMLInputElement;
	readonly write: () => void;
}

export class ParameterPanel {
	private readonly root: HTMLElement;
	private readonly draft: PlanetKnobs;
	private readonly onLive: (settings: PlanetSettings) => void;

	/** Told whenever the draft moves, so a pane drawing from it can keep up. */
	private readonly onDraft: (settings: PlanetSettings) => void;

	/**
	 * Told when a knob in {@link REMESH_KNOBS} moves and **Live
	 * rebuild** is on, instead of the knob only marking the Rebuild button
	 * dirty. Never called for a knob outside that set: those still need the
	 * device and the address width a full reload gives them.
	 *
	 * `terrain` says whether **this** key moves the ground. False means it is
	 * one of {@link BAKED_KNOBS}, so the map, the shape, the peaks and the
	 * generators all still describe this world and only the meshes are wrong.
	 * A caller that debounces has to remember a true across the window: the
	 * panel reports each key as it moves and never how the window ends.
	 */
	private readonly onLiveRebuild: (
		settings: PlanetSettings,
		terrain: boolean,
	) => void;
	private readonly rows: Row[] = [];

	/** Each named part's own element, so another pane can host one. */
	private readonly sections = new Map<string, HTMLElement>();

	/**
	 * What a build measured about a knob, shown under it.
	 *
	 * **A knob whose number does not say what it does needs one.** Mountain
	 * line is a fraction of the terrain curve's own reach, so the same `0.5`
	 * opens the gate over a third of one planet and a fiftieth of another; the
	 * share it actually reaches is a count over the map, which only a finished
	 * build holds. `given` cannot say it, because a row is written from the
	 * draft alone.
	 */
	private readonly measured = new Map<string, string>();
	private problems!: HTMLElement;
	private derived!: HTMLElement;
	private applyButton!: HTMLButtonElement;
	private dirty = false;

	/**
	 * Whether a knob in {@link REMESH_KNOBS} rebuilds the terrain on the
	 * spot rather than waiting for **Rebuild**.
	 *
	 * Off by default. A live rebuild runs on the thread that draws -- there is
	 * no worker for it, the way the map preview has one -- so a big map and a
	 * fast drag can still be felt as a stutter. The checkbox is how someone
	 * opts into that trade rather than finding it turned on for them.
	 */
	private liveRebuild = false;

	/** Whether the bench's own rows are on this panel. */
	private readonly bench: boolean;

	/**
	 * The bench's second panel, down the left of the window.
	 *
	 * **Two panels because there are two questions.** The left says what the
	 * world came out as, how finely it is cut and where the patch is standing;
	 * the right holds the knobs that decide the ground. One panel put the
	 * answer twelve rows under the question. The planet page has no second
	 * panel and every group lands on its one.
	 */
	private leftBody: HTMLElement | null = null;

	constructor(
		settings: PlanetSettings,
		onLive: (settings: PlanetSettings) => void,
		onDraft: (settings: PlanetSettings) => void = () => {},
		onLiveRebuild: (
			settings: PlanetSettings,
			terrain: boolean,
		) => void = () => {},
		options: { readonly bench?: boolean } = {},
	) {
		this.bench = options.bench ?? false;
		// The draft is dragged, and a curve is an array: taken by reference it
		// would be written back into whoever handed these over.
		this.draft = copyKnobs(settings.knobs);
		this.onLive = onLive;
		this.onDraft = onDraft;
		this.onLiveRebuild = onLiveRebuild;
		this.root = document.createElement("aside");
		this.root.className = "knobs";
		this.build();
		document.body.appendChild(this.root);
	}

	/**
	 * Put an element at the top of the panel, above every row and fixed there.
	 *
	 * **The picture is the reference; the knobs are the work.** Scrolling to
	 * reach a knob must never carry the picture off the top of the panel, which
	 * is the one thing a panel must not do to the thing it is a panel of. What
	 * is mounted here stays while the rows below it move.
	 */
	mount(element: HTMLElement): void {
		// **On the bench the picture goes with the world, not with the
		// layers.** The right pane is the four layers and nothing else, so a
		// reader dragging a curve never has to scroll past the map to reach
		// the next one -- and what a layer did is on the other side of the
		// window rather than above the knob that did it.
		if (this.leftBody) {
			this.leftBody.insertBefore(element, this.leftBody.firstChild);
			return;
		}
		this.root.insertBefore(element, this.root.children[1] ?? null);
	}

	/** Put an element at the bottom of the scrolling rows. */
	footer(element: HTMLElement): void {
		if (this.leftBody) {
			this.leftBody.appendChild(element);
			return;
		}
		this.root.querySelector(".knobs-body")?.appendChild(element);
	}

	/**
	 * Say what a build measured about one knob, under that knob's row.
	 *
	 * Text rather than a number, because what is worth saying differs per row
	 * and the panel is not the thing that measured it. An empty string clears.
	 */
	note(key: keyof PlanetKnobs, text: string): void {
		this.measured.set(key as string, text);
		this.refresh();
	}

	/**
	 * Move some knobs from outside the panel, as if their rows had been dragged.
	 *
	 * A place clicked on a map is a latitude and a longitude, and the two rows
	 * that hold them have to agree with it or the panel is describing a patch
	 * that is not the one on screen.
	 */
	set(values: Partial<PlanetKnobs>): void {
		Object.assign(this.draft, values);
		this.touch(false, "patchLatitude");
	}

	/**
	 * One named part's element, for a pane that wants to hold it instead.
	 *
	 * The node is handed over rather than rebuilt, so moving it changes where
	 * it is drawn and nothing else: this panel still owns the draft, the rows
	 * and the settling, and every slider keeps working from wherever it lands.
	 */
	section(title: string): HTMLElement | null {
		return this.sections.get(title) ?? null;
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

		if (this.bench) {
			const aside = document.createElement("aside");
			aside.className = "knobs knobs-left";
			const left = document.createElement("div");
			left.className = "knobs-body";
			aside.appendChild(left);
			document.body.appendChild(aside);
			this.leftBody = left;
		}

		const seed = document.createElement("div");
		seed.className = "knob";
		seed.innerHTML =
			'<label>Seed</label><input type="text" spellcheck="false">';
		const seedInput = seed.querySelector("input")!;
		seedInput.value = this.draft.seed;
		seedInput.oninput = () => {
			this.draft.seed = seedInput.value;
			this.touch(true, "seed");
		};
		this.sections.set("Seed", seed);
		body.appendChild(seed);

		/** One group, built as a folding section with every one of its rows. */
		const buildSection = (group: Group): HTMLElement => {
			const section = document.createElement("section");
			if (group.folded) section.classList.add("shut");

			const head = document.createElement("h2");
			// **A layer's heading is its curve's colour.** Four curves with one
			// colour between them are four curves a reader has to keep track of
			// by position; the pictures the bench draws are named by the same
			// four, so the tint is what ties a section to what it drew.
			if (group.tint) head.classList.add(`tint-${group.tint}`);
			const toggle = document.createElement("button");
			toggle.className = "knobs-fold";
			toggle.textContent = group.title;
			toggle.onclick = () => section.classList.toggle("shut");
			head.appendChild(toggle);
			section.appendChild(head);

			for (const knob of group.knobs) {
				const row = this.row(knob);
				this.rows.push(row);
				section.appendChild(row.wrap);
			}
			this.sections.set(group.title, section);
			return section;
		};

		const handled = new Set<Group>();

		// **The map stands above both tabs.** It is where a click stands the
		// player somewhere, which wants to be reachable whichever tab is
		// open, not filed under one of two questions the way a knob is.
		if (!this.bench)
			for (const group of GROUPS) {
				const where = group.where ?? "world";
				if (where !== "both" && (where === "bench") !== this.bench)
					continue;
				if (!group.aboveTabs) continue;
				body.appendChild(buildSection(group));
				handled.add(group);
			}

		// **Two tabs on the right pane, nowhere else.** The bench already has
		// two panels for two different questions (what the world came out as,
		// and the knobs that decide the ground) and has no use for a third
		// split. Here there is one panel and twenty-some groups in it, and
		// the split that matters is the same one the bench's two panels
		// draw: the ground itself against everything about how it is shown.
		let terrainTab: HTMLElement | null = null;
		let settingsTab: HTMLElement | null = null;
		if (!this.bench) {
			const tabs = document.createElement("div");
			tabs.className = "knobs-tabs";
			const terrainButton = document.createElement("button");
			terrainButton.textContent = "Terrain";
			const settingsButton = document.createElement("button");
			settingsButton.textContent = "Settings";
			tabs.append(terrainButton, settingsButton);
			body.appendChild(tabs);

			terrainTab = document.createElement("div");
			settingsTab = document.createElement("div");
			body.append(terrainTab, settingsTab);

			const select = (tab: "terrain" | "settings"): void => {
				terrainButton.classList.toggle("active", tab === "terrain");
				settingsButton.classList.toggle("active", tab === "settings");
				terrainTab!.hidden = tab !== "terrain";
				settingsTab!.hidden = tab !== "settings";
			};
			terrainButton.onclick = () => select("terrain");
			settingsButton.onclick = () => select("settings");
			// **Settings, not Terrain.** Most of what a returning visitor
			// reaches for -- the light, the player, the sea -- lives there,
			// and Terrain is one click away when it is the ground being
			// tuned.
			select("settings");
		}

		// A group is a fold, and only the first is open. Twenty-six rows at one
		// prominence is the thing this release set out to fix, and the order
		// they are in is what each one decides rather than which subsystem
		// happens to read it.
		for (const group of GROUPS) {
			if (handled.has(group)) continue;
			const where = group.where ?? "world";
			if (where !== "both" && (where === "bench") !== this.bench)
				continue;
			const into =
				group.side === "left" && this.leftBody
					? this.leftBody
					: (((group.tab ?? "settings") === "terrain"
							? terrainTab
							: settingsTab) ?? body);
			into.appendChild(buildSection(group));
		}

		this.problems = document.createElement("div");
		this.problems.className = "knobs-problems";
		body.appendChild(this.problems);

		this.derived = document.createElement("div");
		this.derived.className = "knobs-derived";
		// **The bench says this itself, and says less of it.** Its General
		// section reads what the world came out as rather than what the draft
		// implies, so two blocks of numbers would be two answers to one
		// question.
		if (!this.bench) body.appendChild(this.derived);

		// **Try it, do not default to it.** A live rebuild runs on the thread
		// that draws, with no worker to keep the frame free the way the map
		// preview's does, so a big map and a fast drag can be felt as a
		// stutter. The checkbox is how that trade is opted into rather than
		// discovered.
		const live = document.createElement("div");
		live.className = "knobs-live";
		live.innerHTML =
			'<label><input type="checkbox"> Live rebuild — flush the terrain ' +
			"and rebuild it on every change, no reload</label>";
		const liveInput = live.querySelector("input")!;
		liveInput.checked = this.liveRebuild;
		liveInput.onchange = () => {
			this.liveRebuild = liveInput.checked;
		};
		// **The bench is live and has nothing to opt into.** Its build runs in
		// a worker and its picture is a repaint, so there is no trade to
		// present: a checkbox for a thing that is always on is a question with
		// one answer.
		if (!this.bench) body.appendChild(live);

		const bar = document.createElement("div");
		bar.className = "knobs-bar";
		this.applyButton = document.createElement("button");
		this.applyButton.textContent = "Rebuild";
		this.applyButton.onclick = () => this.rebuild();
		// Kept off the bench for the same reason: nothing there waits for it.
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
		bar.append(...(this.bench ? [] : [this.applyButton]), reset, copy);
		// **The way to the bench, carrying this world with it.** Choosing
		// terrain numbers is looking at ground, and the bench is a page where
		// the ground is the whole window rather than a picture over one.
		if (!this.bench) {
			const bench = document.createElement("a");
			bench.textContent = "Landscape bench";
			bench.href = "./landscape.html";
			bench.onclick = () => {
				bench.href = `./landscape.html?${this.settings.toParams().toString()}`;
			};
			bar.appendChild(bench);
		}
		// **On the bench the two buttons belong with the seed.** Nothing there
		// waits for a Rebuild, so the bar is not a footer to a page of pending
		// changes; it is a world's name and the two things done with a world,
		// which is where a reader looks first.
		if (this.bench) body.insertBefore(bar, seed.nextSibling);
		else body.appendChild(bar);

		this.refresh();
	}

	private row(knob: Knob): Row {
		if (knob.curve) return this.curveRow(knob);
		if (knob.choices) return this.choiceRow(knob);
		const range = KNOB_RANGES[knob.key as string]!;
		const toggle = typeof this.draft[knob.key] === "boolean";
		const wrap = document.createElement("div");
		wrap.className = "knob";
		const digits = knob.digits ?? 0;
		wrap.innerHTML =
			`<label>${knob.label}` +
			// **Neither marker means anything on the bench.** Every row there
			// is live and every row redraws the ground, so a dot saying this
			// one needs a rebuild and a tag saying this one reaches the map
			// are two labels that are true of all of them.
			(range.rebuilds && !this.bench
				? ' <i title="needs a rebuild">&#9679;</i>'
				: "") +
			// The map pane answers to five knobs and not the other nineteen, and
			// nothing on a slider used to say which. Turning Height scale and
			// watching the map sit still is the shape of complaint this marks.
			(knob.map && !this.bench
				? ' <em title="the map redraws for this">map</em>'
				: "") +
			(toggle ? "" : "<b></b>") +
			`</label><input type="${toggle ? "checkbox" : "range"}">` +
			"<u></u>";

		const input = wrap.querySelector("input")!;
		if (toggle) {
			input.checked = this.draft[knob.key] as unknown as boolean;
		} else {
			input.min = String(range.low);
			input.max = String(range.high);
			input.step = String(range.step);
			input.value = String(this.draft[knob.key]);
		}

		const shown = wrap.querySelector("b");
		const answer = wrap.querySelector("u")!;
		const write = () => {
			if (toggle)
				input.checked = this.draft[knob.key] as unknown as boolean;
			else {
				// The ends move with the rest of the draft, so a combination
				// that cannot be built cannot be dragged to either.
				const live = this.settings.rangeFor(knob.key);
				input.min = String(live.low);
				input.max = String(live.high);
				wrap.classList.toggle(
					"bound",
					live.low > range.low || live.high < range.high,
				);
				input.value = String(this.draft[knob.key]);
				shown!.textContent =
					`${Number(this.draft[knob.key]).toFixed(digits)}` +
					(range.unit ? ` ${range.unit}` : "");
			}
			const given = knob.given?.(this.settings) ?? null;
			const wall = toggle ? null : this.wallOf(knob, range);
			const measured = this.measured.get(knob.key as string) || null;
			const said = [wall, given, measured]
				.filter(Boolean)
				.join(" \u00b7 ");
			answer.textContent = said;
			answer.classList.toggle("some", said.length > 0);
		};
		write();

		input.oninput = () => {
			const values = this.draft as unknown as Record<
				string,
				number | boolean
			>;
			values[knob.key as string] = toggle
				? input.checked
				: Number.parseFloat(input.value);

			// Dragging a specific time pauses, so the clock does not carry on
			// past whatever was just asked for -- the same as a video scrubber.
			if (knob.key === "timeOfDay")
				(this.draft as unknown as Record<string, boolean>).paused =
					true;

			this.touch(range.rebuilds, knob.key);
		};
		return { knob, wrap, input, write };
	}

	/** The ends this slider has been pulled to, when they are not its own. */
	private wallOf(knob: Knob, range: KnobRange): string | null {
		const live = this.settings.rangeFor(knob.key);
		const unit = range.unit ? ` ${range.unit}` : "";
		const say = (v: number): string =>
			`${v.toFixed(knob.digits ?? 0)}${unit}`;
		const parts: string[] = [];
		if (live.low > range.low) parts.push(`min ${say(live.low)}`);
		if (live.high < range.high) parts.push(`max ${say(live.high)}`);
		return parts.length > 0 ? parts.join(" · ") : null;
	}

	/** A change was made: either hand it over now, or wait for the button. */
	/**
	 * A knob that is a curve, dragged rather than slid.
	 *
	 * Across is the layer's own noise value, `-1` to `1`; up is what it
	 * controls, `0` to `1`. Drag a point to move it, click the empty curve to
	 * add one, shift-click a point to take it away. **The two ends keep their
	 * x** so the curve always spans the whole range and nothing downstream has
	 * to guess what happens past it; their heights are free like every other
	 * point's.
	 *
	 * **The four points it opens with are a starting shape, not the shape.**
	 * Where a drag matters is where the world actually lands on the curve --
	 * noise clusters around its own middle, so equal widths cover wildly
	 * unequal amounts of planet.
	 */
	private curveRow(knob: Knob): Row {
		const wrap = document.createElement("div");
		wrap.className = "knob curved";
		wrap.innerHTML =
			`<label>${knob.label}` +
			(this.bench ? "" : ' <i title="needs a rebuild">&#9679;</i>') +
			(knob.map && !this.bench
				? ' <em title="the map redraws for this">map</em>'
				: "") +
			'</label><canvas width="280" height="84"></canvas>' +
			"<u>drag \u00b7 click to add \u00b7 shift-click to remove</u>";
		const canvas = wrap.querySelector("canvas")!;
		const g = canvas.getContext("2d")!;
		// **Resolution rather than a bigger box.** The canvas already fills
		// its row at `width: 100%`; what made the curve blurry was drawing it
		// at 260x78 intrinsic pixels and letting CSS stretch that, which on
		// any display denser than one device pixel per CSS pixel is a scaled
		// bitmap. Capped at 2x so a very dense display does not pay for detail
		// nobody's eye resolves.
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		canvas.width = 280 * dpr;
		canvas.height = 84 * dpr;
		const pad = 5 * dpr;
		const toX = (v: number): number =>
			pad + ((v + 1) / 2) * (canvas.width - pad * 2);
		const toY = (v: number): number =>
			canvas.height - pad - v * (canvas.height - pad * 2);
		const fromX = (px: number): number =>
			((px - pad) / (canvas.width - pad * 2)) * 2 - 1;
		const fromY = (py: number): number =>
			(canvas.height - pad - py) / (canvas.height - pad * 2);
		const points = (): [number, number][] =>
			this.draft[knob.key] as unknown as [number, number][];

		/** Which layer this curve reads, from the knob it belongs to. */
		const layer = (knob.key as string).replace("Curve", "") as LayerName;

		// **Where the world actually lands on this curve.** Behind the curve
		// is a histogram of the layer's own field over the sphere, sampled the
		// same way the lab's did: noise clusters around its own middle, so
		// equal widths of a curve cover wildly unequal amounts of planet, and
		// the histogram is the only way to see that rather than assume the
		// axis is evenly populated. Recomputed only when the layer's own
		// shape -- not the curve dragged over it -- changes, which is the
		// same reason `refresh()` can call `write()` on every knob move
		// without this row re-sampling the sphere every time.
		const HIST_BINS = 28;
		const HIST_SAMPLES = 1800;
		const GOLDEN = Math.PI * (3 - Math.sqrt(5));
		let histKey = "";
		let hist = new Float32Array(HIST_BINS);
		let histMax = 0;
		const refreshHistogram = (): void => {
			const k = this.draft as unknown as Record<string, number>;
			const key = [
				this.draft.seed,
				k[`${layer}Feature`],
				k[`${layer}FeatureScale`],
				k[`${layer}Octaves`],
				k[`${layer}Persistence`],
				k[`${layer}Lacunarity`],
				k[`${layer}Fold`],
			].join(":");
			if (key === histKey) return;
			histKey = key;
			const settings = layerNoiseSettings(
				this.settings.layerFor(layer),
				this.settings.radius,
			);
			const offset = LAYER_SEED_OFFSETS[layer];
			const seed = (seedFromString(this.draft.seed) + offset) | 0;
			hist = new Float32Array(HIST_BINS);
			histMax = 0;
			for (let n = 0; n < HIST_SAMPLES; n++) {
				const z = 1 - (2 * n + 1) / HIST_SAMPLES;
				const ring = Math.sqrt(Math.max(0, 1 - z * z));
				const a = n * GOLDEN;
				const v = octaveNoise(
					Math.cos(a) * ring,
					z,
					Math.sin(a) * ring,
					seed,
					settings,
				);
				const bin = Math.max(
					0,
					Math.min(
						HIST_BINS - 1,
						Math.floor(((v + 1) / 2) * HIST_BINS),
					),
				);
				hist[bin]! += 1;
				if (hist[bin]! > histMax) histMax = hist[bin]!;
			}
		};

		const draw = (): void => {
			refreshHistogram();
			const curve = points();
			g.clearRect(0, 0, canvas.width, canvas.height);
			g.fillStyle = "#0b0e13";
			g.fillRect(0, 0, canvas.width, canvas.height);
			if (histMax > 0) {
				g.fillStyle = "rgba(111, 208, 255, 0.16)";
				const wide = (canvas.width - pad * 2) / HIST_BINS;
				for (let n = 0; n < HIST_BINS; n++) {
					const tall =
						(hist[n]! / histMax) * (canvas.height - pad * 2);
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
			g.beginPath();
			g.moveTo(toX(0), pad);
			g.lineTo(toX(0), canvas.height - pad);
			g.stroke();
			// **The line every curve is read against, drawn on the curve
			// itself.** On continentalness it is sea level: the curve gives a
			// height and where it crosses this line is the coast. On peaks and
			// valleys it is the level the continent already set, so above the
			// line is a peak and below it a valley. On the carve it is the line
			// between air and rock. Saying any of them as a number somewhere
			// else would make the reader hold two pictures at once.
			const mark = CURVE_MARKS[layer];
			if (mark) {
				const at = toY(mark.at);
				g.strokeStyle = "rgba(111, 208, 255, 0.5)";
				g.setLineDash([3 * dpr, 3 * dpr]);
				g.beginPath();
				g.moveTo(pad, at);
				g.lineTo(canvas.width - pad, at);
				g.stroke();
				g.setLineDash([]);
				g.fillStyle = "rgba(111, 208, 255, 0.8)";
				g.font = `${9 * dpr}px system-ui, sans-serif`;
				g.fillText(mark.name, pad + 2 * dpr, at - 3 * dpr);
			}
			g.strokeStyle = LAYER_INKS[layer];
			g.lineWidth = 1.5 * dpr;
			g.beginPath();
			for (let px = pad; px <= canvas.width - pad; px++) {
				const y = toY(splineAt(curve, fromX(px)));
				if (px === pad) g.moveTo(px, y);
				else g.lineTo(px, y);
			}
			g.stroke();
			g.fillStyle = "#e8ecf2";
			for (const [x, y] of curve) {
				g.beginPath();
				g.arc(toX(x), toY(y), 3 * dpr, 0, Math.PI * 2);
				g.fill();
			}
		};

		let dragging = -1;
		const spot = (e: PointerEvent): [number, number] => {
			const box = canvas.getBoundingClientRect();
			return [
				((e.clientX - box.left) / box.width) * canvas.width,
				((e.clientY - box.top) / box.height) * canvas.height,
			];
		};
		const nearest = (px: number, py: number): number => {
			const curve = points();
			let best = -1;
			let far = 12 * dpr;
			for (let n = 0; n < curve.length; n++) {
				const d = Math.hypot(
					toX(curve[n]![0]) - px,
					toY(curve[n]![1]) - py,
				);
				if (d < far) {
					far = d;
					best = n;
				}
			}
			return best;
		};
		canvas.addEventListener("pointerdown", (e) => {
			if (wrap.classList.contains("off")) return;
			e.preventDefault();
			const [px, py] = spot(e);
			const at = nearest(px, py);
			const curve = points();
			if (at >= 0 && e.shiftKey) {
				// Never below two, or the curve stops being a curve.
				if (curve.length > 2 && at > 0 && at < curve.length - 1) {
					curve.splice(at, 1);
					draw();
					this.touch(true, knob.key);
				}
				return;
			}
			if (at >= 0) dragging = at;
			else {
				const x = Math.max(-1, Math.min(1, fromX(px)));
				const y = Math.max(0, Math.min(1, fromY(py)));
				curve.push([x, y]);
				curve.sort((a, b) => a[0] - b[0]);
				dragging = curve.findIndex((q) => q[0] === x && q[1] === y);
				draw();
				this.touch(true, knob.key);
			}
			canvas.setPointerCapture(e.pointerId);
		});
		canvas.addEventListener("pointermove", (e) => {
			if (dragging < 0) return;
			const curve = points();
			const [px, py] = spot(e);
			const first = dragging === 0;
			const last = dragging === curve.length - 1;
			if (!first && !last)
				curve[dragging]![0] = Math.max(
					curve[dragging - 1]![0] + 0.01,
					Math.min(curve[dragging + 1]![0] - 0.01, fromX(px)),
				);
			curve[dragging]![1] = Math.max(0, Math.min(1, fromY(py)));
			draw();
			this.touch(true, knob.key);
		});
		const drop = (): void => {
			dragging = -1;
		};
		canvas.addEventListener("pointerup", drop);
		canvas.addEventListener("pointercancel", drop);

		draw();
		return {
			knob,
			wrap,
			input: canvas as unknown as HTMLInputElement,
			write: draw,
		};
	}

	/** A knob that is one of a few named things rather than a number. */
	private choiceRow(knob: Knob): Row {
		const wrap = document.createElement("div");
		wrap.className = "knob";
		wrap.innerHTML =
			`<label>${knob.label}` +
			(this.bench ? "" : ' <i title="needs a rebuild">&#9679;</i>') +
			(knob.map && !this.bench
				? ' <em title="the map redraws for this">map</em>'
				: "") +
			`</label><select></select>`;
		const select = wrap.querySelector("select")!;
		for (const choice of knob.choices!) {
			const option = document.createElement("option");
			option.value = choice.value;
			option.textContent = choice.label;
			select.appendChild(option);
		}
		select.value = String(this.draft[knob.key]);
		select.onchange = () => {
			(this.draft as unknown as Record<string, string>)[knob.key] =
				select.value;
			this.touch(true, knob.key);
		};
		return {
			knob,
			wrap,
			input: select as unknown as HTMLInputElement,
			write: () => {
				select.value = String(this.draft[knob.key]);
				select.disabled = knob.enabledWhen
					? !knob.enabledWhen(this.draft)
					: false;
				wrap.classList.toggle("off", select.disabled);
			},
		};
	}

	private touch(rebuilds: boolean, key: keyof PlanetKnobs): void {
		// Pull every knob inside the range the rest of the draft leaves it,
		// before anything downstream reads one. A slider that cannot reach a
		// refusal is worth more than a refusal that explains itself.
		Object.assign(this.draft, PlanetSettings.settle(this.draft));
		this.onDraft(this.settings);
		if (rebuilds) {
			this.dirty = true;
			this.applyButton.classList.add("wants");
			// **Live rebuild only ever reaches the mesh.** The device, the
			// chunk address width and the crust are still a real reload's job
			// -- this panel has no way to know a knob outside
			// `REMESH_KNOBS` is safe to swap under a running world, so it does
			// not try. `dirty` stays set either way: a live rebuild shows the
			// new ground, not the new sea radius or the new sky, so Rebuild is
			// still the way to see everything the knob changed.
			if (this.liveRebuild && this.settings.problems().length === 0) {
				// The panel reports what this one key is. Whoever owns the
				// settle timer owns remembering the strongest key inside the
				// window, because it is the one that knows when the window
				// closed.
				if (REMESH_KNOBS.has(key))
					this.onLiveRebuild(
						this.settings,
						LIVE_TERRAIN_KNOBS.has(key),
					);
			}
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

		for (const row of this.rows) {
			// A row with no meaning under the current choices comes off the
			// panel, so nothing has to be read and dismissed.
			const shown = row.knob.shownWhen?.(this.draft) ?? true;
			row.wrap.hidden = !shown;
			if (!shown) continue;
			row.write();
			const on = row.knob.enabledWhen?.(this.draft) ?? true;
			row.input.disabled = !on;
			row.wrap.classList.toggle("off", !on);
		}

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
			`<span>map cell <b>${settings.coarseCell.toFixed(0)} m</b>, level <b>${settings.coarseLevel}</b></span>` +
			LAYER_NAMES.map((layer) =>
				settings.layerOn(layer)
					? `<span>${LAYER_TITLES[layer].toLowerCase()} <b>${settings.widestOf(layer).toFixed(0)} m</b> down to <b>${settings.narrowestOf(layer).toFixed(0)} m</b>, over <b>${(settings.knobs as unknown as Record<string, number>)[`${layer}Octaves`]}</b> octaves</span>`
					: `<span>${LAYER_TITLES[layer].toLowerCase()} <b>off</b></span>`,
			).join("") +
			// The camera's own height, not a figure typed in beside it: the two
			// drifted apart the moment one of them moved.
			`<span>horizon at eye height <b>${(settings.radius * Math.acos(settings.radius / (settings.radius + PLAYER_DEFAULTS.eyeHeight))).toFixed(0)} m</b></span>` +
			`<span>crust <b>${settings.crustDepth}</b> layers</span>` +
			`<span>tallest ground <b>${settings.maxElevation} m</b></span>` +
			`<span>cells a layer <b>${cells.toLocaleString("en-US")}</b></span>` +
			`<span>cell address <b>${settings.addressBits} bits</b></span>`;
	}
}
