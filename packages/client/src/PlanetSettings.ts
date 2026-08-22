import type {
	PatchAlong,
	PatchMap,
	PatchPicture,
	PatchSurface,
} from "./PatchLook.js";
import {
	PATCH_ALONGS,
	PATCH_MAPS,
	PATCH_PICTURES,
	PATCH_SURFACES,
} from "./PatchLook.js";
import type {
	CoarseMapOptions,
	ErosionWalk,
	MountainMerge,
	TerrainLayer,
	TerrainOptions,
} from "chamfer/generation";
import {
	CoarseMap,
	DROPLET,
	EROSION_WALKS,
	GROUND_LINES,
	LAYER_LACUNARITY,
	MOUNTAIN_MERGES,
	MOUNTAIN_LAYER_DEFAULT,
	TERRAIN_LAYER_DEFAULT,
	seedFromString,
} from "chamfer/generation";
import { CELL_CONSTANT, WorldShape, maxCrustDepth } from "chamfer/world";
import { LAYER_COUNT, wordBits } from "chamfer/addressing";
import { PLAYER_DEFAULTS } from "chamfer/player";

/**
 * The level a flat coarse map is built at when the coarse map is off.
 *
 * Every field of a flat map is zero everywhere, so no level reads any
 * differently from any other -- this is the cheapest one, not a rounded
 * request in metres the way {@link PlanetSettings.coarseLevel} is.
 */
export const FLAT_COARSE_LEVEL = 2;

/**
 * The deepest world the address word can name.
 *
 * The word is `[planet 12][face 5][path 2 x depth][corner 2][layer 10]`, so it
 * is `29 + 2 x depth` bits wide and 64 of them run out at depth 17.
 */
const MAX_DEPTH = 17;

/**
 * Metres across the smallest landform the coarse map carries.
 *
 * The relief tier is summed octaves, each half the width of the one above it,
 * and this is where that stops. It is a fixed number of metres rather than a
 * multiple of the coarse cell: tying it to the cell would give a 16 m map one
 * more octave than a 32 m map, so the same seed would grow different hills at
 * different resolutions, and the resolution is supposed to decide only how
 * finely a river is drawn.
 *
 * A map has to be fine enough to carry it, which is two samples across a
 * feature. That is what refuses a coarse cell wider than half of this.
 */
const SMALLEST_LANDFORM = 64;

/**
 * The finest level the coarse map may be built at.
 *
 * Radius and Coarse cell are asked for independently, and neither refusal in
 * {@link PlanetSettings.problems} catches the two of them combined: a 25,000 m
 * radius with a 4 m coarse cell asks for level 13, 671,088,642 cells, with
 * nothing on the panel to say those two numbers do not go together (F-020).
 * Level 9 -- 2,621,442 cells, 10 MB a field -- is the largest coarse map this
 * project has actually built and timed, at 13.8 s, when I-5 measured it
 * against the 32 m default. This is that number, not a guess: raising it
 * needs a new measurement.
 */
const MAX_COARSE_LEVEL = 9;

/**
 * What a person sets, before anything is derived from it.
 *
 * Every one of these is in metres or in cells — something a person can picture.
 * Subdivision depth, chunk level and coarse level are not here: those follow
 * from a size and a radius, and putting them in would have the dependency
 * backwards.
 */
/**
 * A curve a layer's value is read through, as `[in, out]` points.
 *
 * Across is that layer's own noise, `-1` to `1`; up is what it controls, `0`
 * to `1`. The engine holds the same shape; this is the panel's mutable copy.
 */
export type Curve = readonly (readonly [number, number])[];

/**
 * A knobs object that shares nothing with the one it came from.
 *
 * **Every knob but two is a number, a string or a boolean, and those copy
 * themselves.** The two curves are arrays, so a spread hands the same array to
 * whoever takes the copy -- and the panel drags that array in place. Left
 * shared, a dragged curve reaches `PLANET_DEFAULTS` itself: the default moves
 * with the draft, so "does this differ from the default" answers no, and the
 * curve is left out of every link the world travels in. The work is on screen
 * and in no query string.
 */
export function copyKnobs(knobs: PlanetKnobs): PlanetKnobs {
	return {
		...knobs,
		terrainCurve: knobs.terrainCurve.map(([x, y]) => [x, y]),
		mountainCurve: knobs.mountainCurve.map(([x, y]) => [x, y]),
	};
}

/** A curve as one query-string value, and back. */
export function curveToText(curve: Curve): string {
	return curve.map(([x, y]) => `${+x.toFixed(3)}:${+y.toFixed(3)}`).join(",");
}

export function curveFromText(text: string): Curve | null {
	const out: [number, number][] = [];
	for (const pair of text.split(",")) {
		const [x, y] = pair.split(":").map(Number);
		if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
		out.push([Math.max(-1, Math.min(1, x!)), Math.max(0, Math.min(1, y!))]);
	}
	out.sort((a, b) => a[0] - b[0]);
	return out.length >= 2 ? out : null;
}

export interface PlanetKnobs {
	seed: string;

	/**
	 * Whether the world is held down to its lattice and nothing else.
	 *
	 * On, nine things are paused at once: the coarse map, the detail noise,
	 * water, the atmosphere, the day, the clouds, the moon, the stars, and the
	 * light moving at all. What is left is a smooth green sphere of cells, lit
	 * as at noon, which is the only state in which the level of detail can be
	 * looked at on its own -- every paused feature changes the color on both
	 * sides of a chunk boundary for a reason of its own.
	 *
	 * Nothing is removed by it. Every paused subsystem keeps its code, its
	 * tests and its knobs, and unchecking this gives all of them back.
	 */
	plain: boolean;

	/**
	 * How many times a face is split, which is what decides how big the planet
	 * is once a block size is chosen.
	 *
	 * Depth, block size and radius are one quantity written three ways --
	 * `radius = blockSize x 2^depth / K` -- so any two of them fix the third.
	 * This is the pair a person can actually set: a block size is a size you
	 * can picture, and a depth is a whole number with a distinct world behind
	 * every value. Asking for a radius instead gave a slider of 484 positions
	 * reaching **6** distinct worlds, because a radius is quantised to powers
	 * of two and every position between two of them built the same planet.
	 */
	subdivisionDepth: number;

	/** Metres across one cell. */
	blockSize: number;

	/** Cells along one edge of a chunk. */
	chunkCells: number;

	/** Metres across one cell of the height map, which is one step of ground. */
	coarseSpacing: number;

	/**
	 * The layer that draws the land: continents at its widest octaves, ground
	 * underfoot at its narrowest.
	 */
	terrainFeature: number;
	terrainFeatureScale: number;
	terrainOctaves: number;

	/** The curve that layer's value is read through, as `[in, out]` points. */
	terrainCurve: Curve;

	/** Whether the mountain layer runs at all. */
	mountainLayer: boolean;

	/** How the mountain layer reaches the ground. */
	merge: MountainMerge;

	/** Where the gate opens, as a fraction of the terrain curve's own reach. */
	mountainLine: number;

	/** The balance between the two layers. */
	mountainDetail: number;

	/** The layer that draws the ranges. */
	mountainFeature: number;
	mountainFeatureScale: number;
	mountainOctaves: number;
	mountainCurve: Curve;

	/** Metres from sea level to the tallest ground. */
	relief: number;

	/** Metres from sea level down to the deepest sea floor. */
	seaDepth: number;

	/** Metres the water is dropped below the level Land chose. Never above zero. */
	seaLevel: number;

	/**
	 * Whether water cuts into the ground at all.
	 *
	 * Off by default: neither walk passes the test a carving pass has to pass,
	 * which is that the median hillslope holds while the tail grows. It is the
	 * slowest step of a map build by a wide margin, so turning it on costs a
	 * rebuild that turning any other knob does not.
	 */
	erosionOn: boolean;

	/** How hard the water cuts, once it is cutting at all. */
	erosion: number;

	/** How a droplet moves over the map. */
	erosionWalk: ErosionWalk;

	/** The most of one step's fall a single droplet may cut, as a fraction. */
	erosionMaxCut: number;

	/** What a cell keeps of the material cut from it. `cell` walk only. */
	erosionCutShare: number;

	/** How much of the previous direction a droplet keeps. `free` walk only. */
	erosionInertia: number;

	/** How much of the surface stands above the sea. */
	landFraction: number;

	/**
	 * Where the terrain bench is standing and what it draws.
	 *
	 * **None of these is a world parameter.** Every other knob here is one the
	 * engine reads; these move the preview and leave the ground where it was,
	 * which is why they are kept apart from the rest and why a link carrying
	 * them builds the same planet.
	 */
	patchLatitude: number;
	patchLongitude: number;

	/** How many map cells across the bench's patch is. */
	patchCells: number;

	/** Which step of the build the preview stops at. */
	patchPicture: PatchPicture;

	/** Whether the preview draws the surface, the cell rims, or both. */
	patchSurface: PatchSurface;

	/** Whether the small map shows the patch or the whole planet. */
	patchMap: PatchMap;

	/** Which way the contour graph's sections run. */
	patchAlong: PatchAlong;

	/** Metres from the top of the tallest ground to the floor of the world. */
	crustMetres: number;

	/** Metres to the top of the air. */
	atmosphereTop: number;

	/** How thick the air reads straight up. */
	zenithDepth: number;

	/** Whether the cloud decks are drawn at all. */
	cloudsDrawn: boolean;

	/** Metres to each cloud deck. */
	lowDeck: number;
	highDeck: number;

	/** Metres across one cloud puff. */
	cloudPuff: number;

	/** Whether the sea is drawn at all. */
	seaDrawn: boolean;

	/** Whether the sea is drawn as its own mesh rather than as a surface. */
	seaWireframe: boolean;

	/** Metres from the trough of a wave to its crest. */
	waveHeight: number;

	/** Metres between one crest and the next. */
	waveScale: number;

	/** How fast the waves travel. */
	waveSpeed: number;

	/** How narrow a wave crest is against its trough. `1` is a plain sine. */
	seaChop: number;

	/** How much white sits on a crest. */
	seaFoam: number;

	/** How solid the water reads where a look has barely entered it. */
	seaOpacity: number;

	/** How many metres of water a look reaches through before it stops. */
	seaClarity: number;

	/** How hard the sun's own highlight is on the water. */
	seaGlint: number;

	/**
	 * How much of the texture below a wave the shading puts back.
	 *
	 * A sea patch carries a vertex every few metres, so the geometry stops at
	 * a wave a few times that and the water between two crests is a sheet of
	 * glass. This tilts the surface a fragment is shaded by, without moving a
	 * vertex.
	 */
	seaRipple: number;

	/**
	 * How far the swell's own height rises and falls across the ocean.
	 *
	 * `0` runs one height everywhere. `0.5` leaves the calmest water half as
	 * tall as the roughest, and the roughest keeps the height that was asked
	 * for.
	 */
	seaGrouping: number;

	/** How many cloud formations stand over the whole planet. */
	cloudClusters: number;

	/** How many puffs one formation is built out of at its thickest. */
	cloudDensity: number;

	/** Metres across one formation. */
	cloudSpread: number;

	/** How many times its own width a chunk is away before it drops a level. */
	detail: number;

	/**
	 * Whether a chunk outside the view is selected and built at all.
	 *
	 * Off, the whole ring around the player is built and about a third of it
	 * is drawn. On, the selection prunes to the view before it asks for
	 * anything, and {@link PlanetKnobs.cullMargin} is how much beyond the edge
	 * of the screen it keeps so turning has something to turn onto.
	 *
	 * **The picture does not change.** Measured at eye level on a settled
	 * world, the same **104** chunks are drawn whether it is off, on at 25
	 * degrees, or on at 0 -- what moves is how much is held to draw them:
	 * 346 chunks resident off, 170 at 25 degrees, 107 at 0, and 232 selected
	 * down to 115 and 77. That is the whole point of it: a third of what was
	 * resident was on screen, and at no margin at all 97% of it is.
	 */
	buildCull: boolean;

	/**
	 * Degrees past the edge of the view a chunk is still built for.
	 *
	 * What a turn turns onto. At 0 the world holds almost exactly what is on
	 * screen and a turn arrives on ground that has to be built; the wider it
	 * goes the more is waiting, and past about 45 degrees on a 65-degree view
	 * nothing is refused at all and it costs what leaving it off costs.
	 */
	cullMargin: number;

	/**
	 * Whether a freed worker takes the nearest waiting chunk or the oldest.
	 *
	 * The queue outlives a selection, so the oldest is not the nearest: a
	 * chunk asked for on the horizon is still waiting when the player has
	 * walked up to it.
	 */
	nearestFirst: boolean;

	/** Whether a chunk draws the ring of cells just beyond its rim. */
	apron: boolean;

	/** Whether the terrain paints its seams: face edges, chunk rims, aprons. */
	seamOverlay: boolean;

	/**
	 * Whether the world is drawn as its own grid.
	 *
	 * On, every chunk is selected and levelled exactly as the terrain would
	 * be, then built as a flat shell of hexagons at the world's highest point
	 * instead of ground. The four switches below choose which structures the
	 * shell shows.
	 */
	gridMode: boolean;

	/** Whether each chunk of the grid is tinted by its level of detail. */
	gridLevels: boolean;

	/** Whether each grid cell keeps its own speckle, so the tiling reads. */
	gridCells: boolean;

	/** Whether grid cells on a chunk boundary are marked. */
	gridChunks: boolean;

	/** Whether grid cells on a face edge are marked. */
	gridFaces: boolean;

	/**
	 * Whether the camera that decides what to draw is held where it is.
	 *
	 * On, the level of detail and the frustum cull go on reading the place and
	 * the direction the camera had at the moment it was turned on, while the
	 * camera itself keeps moving. Flying out of that frozen view is then the
	 * only way to see where its edges fell.
	 */
	freezeView: boolean;

	/** Seconds in a day. */
	dayLength: number;

	/** Whether the day and night cycle advances. */
	paused: boolean;

	/** The fraction of a day to show while paused, 0 at midnight to 1 at the next. */
	timeOfDay: number;

	/**
	 * How much of the light on the ground comes from the sun rather than the
	 * sky.
	 *
	 * The two sum to 1, so flat ground under a noon sun reads the same at any
	 * setting. At `0` every face of a block takes the same light whichever way
	 * it points; at `1` a face turned away from the sun keeps only what the
	 * ground throws back at it.
	 */
	sunShare: number;

	/** How fast the player walks, in metres a second. */
	walkSpeed: number;
}

export const PLANET_DEFAULTS: PlanetKnobs = {
	seed: "chamfer",
	plain: false,
	subdivisionDepth: 13,
	blockSize: 1,
	chunkCells: 64,
	coarseSpacing: 32,
	// **A layer is stated in metres and the engine takes a frequency.** A
	// frequency counts features across the whole sphere, so it means a
	// different landform on every planet; a size in metres does not. The coarse
	// slider carries the decade and the fine one picks the value inside it,
	// because one slider cannot hold a hundred metres and a hundred kilometres
	// at a resolution anybody can drag.
	terrainFeature: 600,
	terrainFeatureScale: 4,
	terrainOctaves: 6,
	terrainCurve: TERRAIN_LAYER_DEFAULT.curve,
	mountainLayer: true,
	merge: "gated",
	mountainLine: 0.5,
	mountainDetail: 7,
	mountainFeature: 480,
	mountainFeatureScale: 2,
	mountainOctaves: 4,
	mountainCurve: MOUNTAIN_LAYER_DEFAULT.curve,
	relief: 1100,
	seaDepth: 130,
	seaLevel: 0,
	erosionOn: false,
	// **A strength the switch can actually reach.** Zero is what turns erosion
	// off, and with a switch above it that is a slider position meaning the
	// same as the switch: ticking the box would build the same world.
	erosion: 0.5,
	erosionWalk: "cell",
	erosionMaxCut: DROPLET.maxCut,
	erosionCutShare: DROPLET.cutShare,
	erosionInertia: DROPLET.inertia,
	landFraction: 0.65,
	// A place with a coast, a plain and a range on it, so the bench opens on
	// all three rather than on whichever the middle of the map happened to be.
	patchLatitude: 45,
	patchLongitude: 20,
	patchCells: 176,
	patchPicture: "ground",
	patchSurface: "solid",
	patchMap: "patch",
	patchAlong: "x",
	crustMetres: 1232,
	atmosphereTop: 2050,
	zenithDepth: 0.272,
	cloudsDrawn: true,
	lowDeck: 3000,
	highDeck: 6000,
	cloudPuff: 64,
	seaDrawn: true,
	seaWireframe: false,
	waveHeight: 4,
	waveScale: 45,
	waveSpeed: 0.8,
	seaChop: 2.5,
	seaFoam: 0.35,
	seaOpacity: 0.45,
	seaClarity: 30,
	seaGlint: 0.8,
	seaRipple: 0.7,
	seaGrouping: 0.5,
	cloudClusters: 1200,
	cloudDensity: 100,
	cloudSpread: 180,
	detail: 5,
	buildCull: true,
	cullMargin: 25,
	nearestFirst: true,
	apron: true,
	seamOverlay: false,
	gridMode: false,
	gridLevels: true,
	gridCells: true,
	gridChunks: true,
	gridFaces: false,
	freezeView: false,
	dayLength: 3600,
	paused: true,
	timeOfDay: 0.18,
	sunShare: 0.58,
	walkSpeed: PLAYER_DEFAULTS.walkSpeed,
};

/**
 * A knob that is a number, and what it may be set to.
 *
 * A boolean knob reuses this with `low: 0, high: 1, step: 1` -- the panel
 * tells the two kinds apart by the draft value's own `typeof`, not by a field
 * here, so a boolean knob's range is unused and kept only so every knob has
 * one entry in one table.
 */
export interface KnobRange {
	readonly low: number;
	readonly high: number;
	readonly step: number;

	/** Whether changing it means building the world again. */
	readonly rebuilds: boolean;

	readonly unit: string;
}

const TOGGLE: Pick<KnobRange, "low" | "high" | "step" | "unit"> = {
	low: 0,
	high: 1,
	step: 1,
	unit: "",
};

/**
 * The knobs Live rebuild is allowed to touch.
 *
 * Every one of these decides only the coarse map: the terrain, and the chunks
 * read off it. Nothing here is read by the device, the chunk address width,
 * the crust, the sea surface radius, the sky or the clouds -- those still need
 * a real reload, because a live rebuild only replaces the map and the chunks
 * built from it. `subdivisionDepth`, `blockSize`, `chunkCells` and every knob
 * below "How high and how wet" in {@link KNOB_RANGES} are deliberately absent:
 * swapping the address width or the worker count under a running world is not
 * a smaller version of a reload, it is the reload with extra steps skipped.
 */
export const LIVE_TERRAIN_KNOBS: ReadonlySet<keyof PlanetKnobs> = new Set([
	"seed",
	"coarseSpacing",
	"terrainFeature",
	"terrainFeatureScale",
	"terrainOctaves",
	"terrainCurve",
	"mountainLayer",
	"merge",
	"mountainLine",
	"mountainDetail",
	"mountainFeature",
	"mountainFeatureScale",
	"mountainOctaves",
	"mountainCurve",
	"landFraction",
	"seaLevel",
	"relief",
	"seaDepth",
	"erosionOn",
	"erosion",
	"erosionWalk",
	"erosionMaxCut",
	"erosionCutShare",
	"erosionInertia",
] satisfies (keyof PlanetKnobs)[]);

export const KNOB_RANGES: Record<string, KnobRange> = {
	plain: { ...TOGGLE, rebuilds: true },
	subdivisionDepth: { low: 4, high: 17, step: 1, rebuilds: true, unit: "" },
	blockSize: { low: 0.5, high: 4, step: 0.25, rebuilds: true, unit: "m" },
	chunkCells: { low: 8, high: 64, step: 8, rebuilds: true, unit: "cells" },
	coarseSpacing: { low: 4, high: 128, step: 4, rebuilds: true, unit: "m" },
	terrainFeature: {
		low: 100,
		high: 1000,
		step: 10,
		rebuilds: true,
		unit: "m",
	},
	terrainFeatureScale: {
		low: 1,
		high: 100,
		step: 1,
		rebuilds: true,
		unit: "x",
	},
	terrainOctaves: { low: 1, high: 12, step: 1, rebuilds: true, unit: "" },
	terrainCurve: { ...TOGGLE, rebuilds: true },
	mountainLayer: { ...TOGGLE, rebuilds: true },
	merge: { low: 0, high: 0, step: 1, rebuilds: true, unit: "" },
	mountainLine: { low: 0, high: 0.95, step: 0.01, rebuilds: true, unit: "" },
	mountainDetail: { low: 0, high: 10, step: 0.05, rebuilds: true, unit: "" },
	mountainFeature: {
		low: 100,
		high: 1000,
		step: 10,
		rebuilds: true,
		unit: "m",
	},
	mountainFeatureScale: {
		low: 1,
		high: 100,
		step: 1,
		rebuilds: true,
		unit: "x",
	},
	mountainOctaves: { low: 1, high: 12, step: 1, rebuilds: true, unit: "" },
	mountainCurve: { ...TOGGLE, rebuilds: true },
	relief: { low: 20, high: 2400, step: 20, rebuilds: true, unit: "m" },
	seaDepth: { low: 10, high: 1200, step: 10, rebuilds: true, unit: "m" },
	// The water can be drained and no further: under the fit the deepest point
	// is exactly Sea depth down, so a lower level is a planet with no ocean and
	// a slider position meaning the same as the one beside it.
	seaLevel: { low: -1200, high: 0, step: 5, rebuilds: true, unit: "m" },
	erosionOn: { ...TOGGLE, rebuilds: true },
	erosion: { low: 0.05, high: 1, step: 0.05, rebuilds: true, unit: "" },
	erosionWalk: { low: 0, high: 0, step: 1, rebuilds: true, unit: "" },
	erosionMaxCut: {
		low: 0.01,
		high: 0.5,
		step: 0.01,
		rebuilds: true,
		unit: "",
	},
	erosionCutShare: { low: 0, high: 1, step: 0.05, rebuilds: true, unit: "" },
	erosionInertia: { low: 0, high: 0.9, step: 0.05, rebuilds: true, unit: "" },
	patchLatitude: {
		low: -85,
		high: 85,
		step: 1,
		rebuilds: false,
		unit: "\u00b0",
	},
	patchLongitude: {
		low: -180,
		high: 180,
		step: 1,
		rebuilds: false,
		unit: "\u00b0",
	},
	patchCells: { low: 48, high: 256, step: 8, rebuilds: false, unit: "cells" },
	patchPicture: { low: 0, high: 0, step: 1, rebuilds: false, unit: "" },
	patchSurface: { low: 0, high: 0, step: 1, rebuilds: false, unit: "" },
	patchMap: { low: 0, high: 0, step: 1, rebuilds: false, unit: "" },
	patchAlong: { low: 0, high: 0, step: 1, rebuilds: false, unit: "" },
	landFraction: {
		low: 0.05,
		high: 0.8,
		step: 0.05,
		rebuilds: true,
		unit: "",
	},
	// A crust is a count of layers and a layer is a block tall, so the metres
	// it reaches are the layer field's 2,048 times whatever a block is: 2,048 m
	// at a 1 m block and 8,192 m at a 4 m one, which is the largest any world
	// here reaches. Stating this in metres and holding it at the layer count
	// held every world with a block over a metre to a fraction of the depth it
	// could carry, because `rangeFor` only ever narrows.
	crustMetres: { low: 32, high: 8192, step: 16, rebuilds: true, unit: "m" },
	atmosphereTop: {
		low: 50,
		high: 4000,
		step: 25,
		rebuilds: false,
		unit: "m",
	},
	zenithDepth: {
		low: 0.02,
		high: 0.8,
		step: 0.002,
		rebuilds: false,
		unit: "",
	},
	cloudsDrawn: { ...TOGGLE, rebuilds: false },
	lowDeck: { low: 100, high: 20000, step: 20, rebuilds: false, unit: "m" },
	highDeck: { low: 200, high: 40000, step: 50, rebuilds: false, unit: "m" },
	cloudPuff: { low: 8, high: 600, step: 4, rebuilds: false, unit: "m" },
	seaDrawn: { ...TOGGLE, rebuilds: false },
	seaWireframe: { ...TOGGLE, rebuilds: false },
	waveHeight: { low: 0, high: 12, step: 0.1, rebuilds: false, unit: "m" },
	waveScale: { low: 5, high: 600, step: 5, rebuilds: false, unit: "m" },
	waveSpeed: { low: 0, high: 4, step: 0.05, rebuilds: false, unit: "" },
	seaChop: { low: 1, high: 6, step: 0.1, rebuilds: false, unit: "" },
	seaFoam: { low: 0, high: 1, step: 0.05, rebuilds: false, unit: "" },
	seaOpacity: { low: 0, high: 1, step: 0.02, rebuilds: false, unit: "" },
	seaClarity: { low: 1, high: 300, step: 1, rebuilds: false, unit: "m" },
	seaGlint: { low: 0, high: 2, step: 0.05, rebuilds: false, unit: "" },
	seaRipple: { low: 0, high: 2, step: 0.05, rebuilds: false, unit: "" },
	seaGrouping: { low: 0, high: 1, step: 0.05, rebuilds: false, unit: "" },
	cloudClusters: {
		low: 100,
		high: 4000,
		step: 100,
		rebuilds: false,
		unit: "",
	},
	cloudDensity: {
		low: 4,
		high: 400,
		step: 2,
		rebuilds: false,
		unit: "puffs",
	},
	cloudSpread: { low: 40, high: 4000, step: 20, rebuilds: false, unit: "m" },
	detail: { low: 1, high: 5, step: 0.5, rebuilds: false, unit: "widths" },
	buildCull: { ...TOGGLE, rebuilds: false },
	cullMargin: { low: 0, high: 90, step: 5, rebuilds: false, unit: "deg" },
	nearestFirst: { ...TOGGLE, rebuilds: false },
	apron: { ...TOGGLE, rebuilds: true },
	seamOverlay: { ...TOGGLE, rebuilds: true },
	gridMode: { ...TOGGLE, rebuilds: true },
	gridLevels: { ...TOGGLE, rebuilds: true },
	gridCells: { ...TOGGLE, rebuilds: true },
	gridChunks: { ...TOGGLE, rebuilds: true },
	gridFaces: { ...TOGGLE, rebuilds: true },
	freezeView: { ...TOGGLE, rebuilds: false },
	dayLength: { low: 30, high: 3600, step: 10, rebuilds: false, unit: "s" },
	paused: { ...TOGGLE, rebuilds: false },
	timeOfDay: { low: 0, high: 1, step: 0.01, rebuilds: false, unit: "" },
	sunShare: { low: 0, high: 1, step: 0.02, rebuilds: false, unit: "" },
	walkSpeed: { low: 0.5, high: 20, step: 0.5, rebuilds: false, unit: "m/s" },
};

/**
 * Knobs that never travel in a query string, in either direction.
 *
 * Freeze view holds the camera the frame was drawn with, and that camera
 * cannot be written into a link -- what a fresh page would freeze is its own
 * spawn camera, 1.6 km over the shipped planet, which nobody chose. Every
 * rebuild knob reloads the page through these params, so before this set
 * existed, changing Chunk while frozen relatched the freeze at the spawn
 * camera and the world came back stuck at face-level cells.
 */
export const TRANSIENT: ReadonlySet<keyof PlanetKnobs> = new Set([
	"freezeView",
] as (keyof PlanetKnobs)[]);

/** What each of the bench's named knobs may be, so a link cannot say otherwise. */
const PATCH_CHOICES: Record<string, readonly string[]> = {
	patchPicture: PATCH_PICTURES,
	patchSurface: PATCH_SURFACES,
	patchMap: PATCH_MAPS,
	patchAlong: PATCH_ALONGS,
};

/** The nearest power of two, for turning a size in metres into a level. */
function levelFor(span: number, size: number): number {
	return Math.max(0, Math.round(Math.log2(span / size)));
}

/**
 * One world, as the numbers a person sets and the numbers that follow.
 *
 * A subdivision depth is a property of the grid, not of a world. Someone
 * choosing a planet picks a size for a block and a size for the planet; the
 * depth follows, and **the radius moves to whatever makes the block exact**,
 * which is doc 06's rule and this project's seventh invariant. The same holds
 * for the chunk level and for the level the coarse map is built at: both are
 * asked for in metres and answered in levels.
 *
 * Nothing here builds anything. It is the arithmetic between what is typed and
 * what the engine takes, and the list of reasons a world cannot be built.
 */
export class PlanetSettings {
	readonly knobs: PlanetKnobs;

	constructor(knobs: Partial<PlanetKnobs> = {}) {
		this.knobs = copyKnobs({ ...PLANET_DEFAULTS, ...knobs });
	}

	/** The seed as the generator takes it, hashed from what was typed. */
	get seedNumber(): number {
		return seedFromString(this.knobs.seed);
	}

	/**
	 * Whether continents and the sea run, or the world is a smooth sphere.
	 *
	 * **The map is the terrain and there is no second source of ground**, so
	 * there is nothing to switch it off in favour of: the one state that is not
	 * a map is the sphere the level of detail is judged against, and **Plain
	 * planet** is what asks for it. Every reader inside this class goes through
	 * here rather than through the knob, which keeps the pause in one place.
	 */
	get coarseMapRuns(): boolean {
		return !this.knobs.plain;
	}

	/**
	 * Metres from sea level to the tallest ground, once the pause is applied.
	 *
	 * Zero under the pause, and zero is exact rather than small: the whole
	 * field is multiplied by it, so the ground is a sphere to the last bit.
	 */
	get relief(): number {
		return this.coarseMapRuns ? this.knobs.relief : 0;
	}

	/** Metres to the deepest sea floor, once the pause is applied. */
	get seaDepth(): number {
		return this.coarseMapRuns ? this.knobs.seaDepth : 0;
	}

	/** The depth the radius and the block size ask for, before any cap. */
	/** How many times a face is split. Asked for directly. */
	get depth(): number {
		return Math.min(MAX_DEPTH, Math.max(1, this.knobs.subdivisionDepth));
	}

	/**
	 * The radius the world has, which follows exactly from the other two.
	 *
	 * Block size is fixed at world creation, and a depth is a whole number, so
	 * there is no rounding left for the radius to absorb: this is the size the
	 * planet is rather than the size it was moved to.
	 */
	get radius(): number {
		return (this.knobs.blockSize * 2 ** this.depth) / CELL_CONSTANT;
	}

	get chunkLevel(): number {
		const cells = Math.max(1, Math.round(Math.log2(this.knobs.chunkCells)));
		return Math.max(0, this.depth - cells);
	}

	get coarseLevel(): number {
		return Math.max(
			2,
			Math.min(
				this.depth,
				MAX_COARSE_LEVEL,
				levelFor(CELL_CONSTANT * this.radius, this.knobs.coarseSpacing),
			),
		);
	}

	/**
	 * Whether the coarse map is coarser than asked because it had to be.
	 *
	 * A wide radius and a fine cell together ask for a level nobody has built:
	 * 19,800 m and 12 m ask for level 11, which is 41,943,042 cells and four
	 * fields of them. The panel shows what was given instead of leaving the
	 * slider looking like it did nothing.
	 */
	get coarseLevelCapped(): boolean {
		return (
			Math.min(this.depth, MAX_COARSE_LEVEL) <
			levelFor(CELL_CONSTANT * this.radius, this.knobs.coarseSpacing)
		);
	}

	/**
	 * How many layers deep the world runs, under all three caps.
	 *
	 * The taper says where a column would pinch shut, the layer field says how
	 * many layers can be named, and the knob says how many are wanted. This is
	 * the only place the layer field is filled from, so no setting here can put
	 * a layer outside it.
	 */
	get crustDepth(): number {
		const wanted = Math.ceil(this.knobs.crustMetres / this.knobs.blockSize);
		return Math.max(
			8,
			Math.min(wanted, maxCrustDepth(this.depth), LAYER_COUNT),
		);
	}

	/**
	 * Which of the three caps on {@link PlanetSettings.crustDepth} bound it.
	 *
	 * `"asked"` means the knob got what it wanted. `"taper"` means the column
	 * would pinch shut before reaching that far down, and `"field"` means the
	 * ten-bit layer field ran out of names at 1,024 layers.
	 */
	get crustCap(): "asked" | "taper" | "field" {
		const wanted = Math.ceil(this.knobs.crustMetres / this.knobs.blockSize);
		if (wanted <= this.crustDepth) return "asked";
		return maxCrustDepth(this.depth) <= LAYER_COUNT ? "taper" : "field";
	}

	/**
	 * A pre-build guess at how far the ground reaches above sea level.
	 *
	 * **It is the Relief knob, exactly.** The map is scaled so its tallest
	 * point stands that many metres up, so there is nothing to estimate: the
	 * guess and the answer are the same number, and the long paragraph that
	 * used to be here explaining how far off the guess could be is gone with
	 * the multiplier it described.
	 *
	 * Erosion only lowers ground, so this stays an upper bound after it runs.
	 */
	get maxElevation(): number {
		return Math.max(1, Math.ceil(this.relief));
	}

	/** The metres of ground above sea level the built map actually reaches. */
	tallestGroundOf(map: CoarseMap): number {
		let highest = 0;
		for (let cell = 0; cell < map.count; cell++)
			if (map.height[cell]! > highest) highest = map.height[cell]!;
		return Math.max(1, Math.ceil(highest));
	}

	/**
	 * How far the ground spreads, floor to peak, before anyone digs.
	 *
	 * The peak is exactly Relief and the floor is exactly Sea depth, because
	 * the two are scaled apart. It used to be Relief times a curve through
	 * Land — sea level is a percentile above the noise's own middle, so asking
	 * for less land left the floor further under it and the ocean took `1.92x`
	 * what the mountains got. That was what capped Relief at `320 m`.
	 *
	 * **A sea floor through the bottom of the world is a flat abyss**, not a
	 * crash: the crust clamps it. It is still worth refusing, because a world
	 * whose ocean floor is one plateau is not the world the map drew.
	 */
	get groundSpan(): number {
		return Math.max(2, this.relief + this.seaDepth);
	}

	/** Metres across one cell of the coarse map, once its level is rounded. */
	get coarseCell(): number {
		return (CELL_CONSTANT * this.radius) / 2 ** this.coarseLevel;
	}

	/**
	 * Metres across the narrowest feature the octave stack makes.
	 *
	 * Each octave is half as wide as the one above it, so the last one is the
	 * widest feature divided by two to the power of one less than the octave
	 * count. **This is the number the map has to be
	 * fine enough to draw**, and the panel refuses a map that is not: ground
	 * the map cannot carry is ground the world does not have, because the world
	 * is the map.
	 */
	get smallestLandform(): number {
		return Math.min(
			this.narrowestOf("terrain"),
			this.knobs.mountainLayer ? this.narrowestOf("mountain") : Infinity,
		);
	}

	/**
	 * Metres across the narrowest octave one layer makes.
	 *
	 * Each layer carries its own width and its own octave count, so the two are
	 * asked separately: a map fine enough for the terrain layer's last octave
	 * may be far too coarse for the mountain layer's, which is narrower by
	 * design.
	 */
	narrowestOf(layer: "terrain" | "mountain"): number {
		const k = this.knobs as unknown as Record<string, number>;
		return (
			this.widestOf(layer) /
			LAYER_LACUNARITY ** (k[`${layer}Octaves`]! - 1)
		);
	}

	/**
	 * One layer, as the engine takes it.
	 *
	 * Public because the curve rows read it too, to sample the layer's own
	 * field for the histogram behind the curve -- the same frequency the
	 * generator will actually use, not a hand-converted approximation of it.
	 */
	layerFor(layer: "terrain" | "mountain"): TerrainLayer {
		const k = this.knobs as unknown as Record<string, number>;
		const curve =
			layer === "terrain"
				? this.knobs.terrainCurve
				: this.knobs.mountainCurve;
		return {
			metres: this.widestOf(layer),
			octaves: k[`${layer}Octaves`]!,
			curve,
		};
	}

	/**
	 * Metres across a layer's widest octave, which is what its two rows set.
	 *
	 * The coarse slider carries the decade and the fine one picks the value
	 * inside it: one slider cannot hold a hundred metres and a hundred
	 * kilometres at a resolution anybody can drag.
	 */
	widestOf(layer: "terrain" | "mountain"): number {
		const k = this.knobs as unknown as Record<string, number>;
		return Math.max(1, k[`${layer}Feature`]! * k[`${layer}FeatureScale`]!);
	}

	/** Metres across one chunk. */
	get chunkSpan(): number {
		return this.knobs.blockSize * 2 ** (this.depth - this.chunkLevel);
	}

	/**
	 * How wide one cell address is, in bits.
	 *
	 * Two knobs reach it and no others. The radius and the block size set the
	 * subdivision depth, which is two bits of path per level, and the crust sets
	 * how many of the ten layer bits are used. Everything else here decides what
	 * block sits at an address rather than what the address is.
	 */
	get addressBits(): number {
		return wordBits(this.depth);
	}

	/**
	 * The world shape, using the pre-build guess at how tall the ground is.
	 *
	 * Only for asking questions before a coarse map exists to answer them
	 * exactly: the panel's derived readout, and the pre-build refusals in
	 * {@link problems}. **Never build a world from this** — call
	 * {@link shapeFor} once the coarse map is built, or a Land setting far from
	 * 0.3 builds a crust top too low for its own ground and the peaks come out
	 * flat.
	 */
	shape(): WorldShape {
		return new WorldShape(
			this.radius,
			this.depth,
			this.maxElevation,
			this.crustDepth,
		);
	}

	/**
	 * The world shape once its coarse map exists, with the crust top placed at
	 * the map's own true peak rather than a guess.
	 *
	 * A knob that reaches no further than this class is a slider that moves and
	 * changes nothing, which is worse than no slider, so every knob a subsystem
	 * has an option for is passed here rather than left at its default.
	 */
	shapeFor(map: CoarseMap): WorldShape {
		return new WorldShape(
			this.radius,
			this.depth,
			this.tallestGroundOf(map),
			this.crustDepth,
		);
	}

	coarseOptions(): CoarseMapOptions {
		return {
			level: this.coarseLevel,
			cellMetres: this.coarseCell,
			terrain: this.layerFor("terrain"),
			mountain: this.layerFor("mountain"),
			mountainLayer: this.knobs.mountainLayer,
			merge: this.knobs.merge,
			mountainLine: this.knobs.mountainLine,
			detail: this.knobs.mountainDetail,
			relief: this.relief,
			seaDepth: this.seaDepth,
			landFraction: this.knobs.landFraction,
			seaLevel: this.coarseMapRuns ? this.knobs.seaLevel : 0,
			// The switch is what turns the pass off, and off is a strength of
			// zero: the pass returns on its first line and the ground is the
			// noise exactly as it fell.
			erosion: this.knobs.erosionOn ? this.knobs.erosion : 0,
			erosionWalk: this.knobs.erosionWalk,
			erosionMaxCut: this.knobs.erosionMaxCut,
			erosionCutShare: this.knobs.erosionCutShare,
			erosionInertia: this.knobs.erosionInertia,
		};
	}

	terrainOptions(): TerrainOptions {
		// The two are absolute metres, the same metres the Ground map's bands
		// are drawn on, so a colour on the map is the block the world builds.
		return { rockLine: GROUND_LINES.rock, snowLine: GROUND_LINES.snow };
	}

	/**
	 * One knob's range, narrowed by the rest of the draft.
	 *
	 * **A slider that cannot be moved into a refusal is worth more than a
	 * refusal that explains itself.** Several of these knobs bound each other —
	 * the crust has to reach past the ground, the map has to be fine enough to
	 * draw the narrowest octave, a chunk has to be smaller than a face — and
	 * every one of those pairs used to be discovered by hitting it. The panel
	 * moves the slider's own end instead, so the wall is visible before it is
	 * reached and {@link problems} is left as a backstop for a hand-edited
	 * query string.
	 *
	 * The narrowing only ever moves an end **inward**. Nothing here widens a
	 * range past what {@link KNOB_RANGES} states.
	 */
	/**
	 * The most octaves one layer may run before its narrowest is under two map
	 * cells.
	 *
	 * Each layer is asked against its own falloff. They do not share one, so a
	 * map fine enough for the terrain layer's last octave may be far too coarse
	 * for the mountain layer's, which is narrower by design.
	 */
	private octaveWall(
		layer: "terrain" | "mountain",
		range: KnobRange,
	): number {
		return Math.max(
			range.low,
			Math.min(
				range.high,
				1 +
					Math.floor(
						Math.log2(this.widestOf(layer) / (2 * this.coarseCell)),
					),
			),
		);
	}

	rangeFor(key: keyof PlanetKnobs): KnobRange {
		const range = KNOB_RANGES[key as string]!;
		const k = this.knobs;
		// Both round to the slider's own step and stay inside its stated ends,
		// so a narrowing can never widen one.
		const inside = (v: number): number =>
			Math.min(range.high, Math.max(range.low, v));
		const up = (v: number): number =>
			inside(Math.ceil(v / range.step) * range.step);
		const down = (v: number): number =>
			inside(Math.floor(v / range.step) * range.step);
		const narrowed = (ends: Partial<KnobRange>): KnobRange => {
			const out = { ...range, ...ends };
			// A pair of constraints can cross. The lower end wins, because it
			// is the one describing a world that can be built.
			return { ...out, high: Math.max(out.low, out.high) };
		};

		switch (key) {
			// The address is 2 bits of path per level and the word is 64, which
			// is what stops the subdivision at MAX_DEPTH. A chunk has to fit
			// inside a face with a level left over for the detail to walk down.
			// Two things stop a world being too small. A chunk has to fit
			// inside a face with a level left over for the detail to walk
			// down. And the crust tapers with the world, so a small enough
			// planet cannot hold even the shallowest ground the panel offers
			// -- 53 m across, the crust reaches 13 m, and the least relief and
			// sea depth here come to 30.
			case "subdivisionDepth": {
				const leastGround =
					KNOB_RANGES.relief!.low + KNOB_RANGES.seaDepth!.low;
				let least = range.low;
				while (
					least < range.high &&
					Math.min(maxCrustDepth(least), LAYER_COUNT) * k.blockSize <
						leastGround
				)
					least++;
				return narrowed({
					low: Math.max(
						least,
						1 + Math.round(Math.log2(k.chunkCells)),
					),
					high: MAX_DEPTH,
				});
			}

			// A map cell has to be coarser than a block or the map is being
			// asked to describe the ground one block at a time. Three blocks
			// rather than two, because the level is rounded and a request can
			// land a factor of root two under what it asked for.
			case "coarseSpacing":
				return narrowed({ low: up(3 * k.blockSize) });

			// The world is the map, so an octave narrower than two map cells is
			// ground that would not exist. Each layer is asked against its own
			// width and its own count: they do not share either.
			case "terrainOctaves":
				return narrowed({ high: this.octaveWall("terrain", range) });
			case "mountainOctaves":
				return narrowed({ high: this.octaveWall("mountain", range) });
			// Even one octave has to be two map cells wide, and the fine slider
			// reaches its own bottom, so the coarse one starts where their
			// product does. What is cut off is a landform the map could not
			// draw at any octave count.
			case "terrainFeatureScale":
			case "mountainFeatureScale":
				return narrowed({
					low: up(
						(2 * this.coarseCell) /
							Math.max(
								1,
								(
									this.knobs as unknown as Record<
										string,
										number
									>
								)[
									key === "terrainFeatureScale"
										? "terrainFeature"
										: "mountainFeature"
								]!,
							),
					),
				});

			// The crust runs from above the tallest ground to under the deepest
			// sea, and it can hold at most the layer field's 1,024 layers.
			case "relief":
				return narrowed({ high: down(this.reliefCeiling) });
			case "seaDepth":
				return narrowed({
					high: down(this.crustCeiling - this.relief),
				});
			case "crustMetres":
				return narrowed({
					low: up(this.groundSpan),
					high: down(this.crustCeiling),
				});

			// A chunk the size of a whole face leaves nothing for the level of
			// detail to walk down.
			case "chunkCells":
				return narrowed({ high: down(2 ** (this.depth - 1)) });

			case "lowDeck":
				return narrowed({ high: down(k.highDeck - range.step) });
			case "highDeck":
				return narrowed({ low: up(k.lowDeck + range.step) });
		}
		return range;
	}

	/** The deepest crust this block size and the layer field allow, in metres. */
	get crustCeiling(): number {
		return (
			Math.min(maxCrustDepth(this.depth), LAYER_COUNT) *
			this.knobs.blockSize
		);
	}

	/**
	 * The tallest ground a crust of {@link crustCeiling} can hold.
	 *
	 * The span is Relief plus Sea depth, so this is the deepest crust the layer
	 * field allows with the ocean's share taken out of it.
	 */
	get reliefCeiling(): number {
		return this.crustCeiling - this.seaDepth;
	}

	/**
	 * Every knob pulled inside the range the rest of the draft leaves it.
	 *
	 * Applied in dependency order, because these bound each other: the block
	 * size and the radius decide the depth, the depth and the map cell decide
	 * how many octaves fit, and Relief decides how deep the crust has to run.
	 * Working down that order settles in one pass.
	 *
	 * **It only ever pushes a value into range, never back out.** Lowering
	 * Relief widens what the crust may be and leaves the crust where it was, so
	 * nothing a person set is undone by a knob they went on to turn back.
	 */
	static settle(knobs: PlanetKnobs): PlanetKnobs {
		const order: (keyof PlanetKnobs)[] = [
			"blockSize",
			"subdivisionDepth",
			"chunkCells",
			"coarseSpacing",
			"terrainFeatureScale",
			"terrainOctaves",
			"mountainFeatureScale",
			"mountainOctaves",
			"relief",
			"seaDepth",
			"seaLevel",
			"crustMetres",
			"lowDeck",
			"highDeck",
		];
		const out = { ...knobs };
		const values = out as unknown as Record<string, number>;
		for (const key of order) {
			const range = new PlanetSettings(out).rangeFor(key);
			const was = values[key as string]!;
			values[key as string] = Math.min(
				range.high,
				Math.max(range.low, was),
			);
		}
		return out;
	}

	/**
	 * Why this world cannot be built, or nothing if it can.
	 *
	 * A person setting numbers by hand will reach one of these, and a message
	 * is better than a planet that draws wrongly and leaves them guessing which
	 * knob did it.
	 */
	problems(): string[] {
		const out: string[] = [];
		const k = this.knobs;

		// The crust has to reach from the top of the tallest ground to under
		// the deepest sea, or the sea floor falls out of the bottom of the
		// world and every ocean column is empty.
		const reach = this.crustDepth * k.blockSize;
		if (reach < this.groundSpan) {
			const neededCrust = Math.ceil(this.groundSpan);
			out.push(
				`The crust reaches ${Math.round(reach)} m and the ground spans about ${Math.round(this.groundSpan)} m, so the deepest ocean has no floor: those columns are water down to the last layer and nothing under it. Raise Crust reaches to at least ${neededCrust} m, or lower Relief to ${Math.max(0, Math.floor(reach - this.seaDepth))} m or under.`,
			);
		}

		// The coarse map's own resolution only matters while it runs. Off, its
		// level is a fixed cheap constant nothing reads, so these two checks
		// would be warning about a knob with nothing left to affect.
		if (this.coarseMapRuns) {
			if (this.coarseCell < k.blockSize * 2) {
				const neededSpacing = Math.ceil(k.blockSize * 2);
				out.push(
					`A ${Math.round(this.coarseCell)} m map cell is no coarser than a ${k.blockSize} m block, so the map is asking to describe the ground one block at a time. Raise Map cell to at least ${neededSpacing} m.`,
				);
			}

			// Two samples across a feature is the least that describes it. Below
			// that the map records something narrower than it can see, and what
			// it records changes with the resolution rather than with the seed.
			// The world is the map, so a feature the map cannot draw is a
			// feature the ground does not have. Two samples across it is the
			// least that describes it.
			for (const layer of ["terrain", "mountain"] as const) {
				if (layer === "mountain" && !k.mountainLayer) continue;
				const narrowest = this.narrowestOf(layer);
				if (this.coarseCell * 2 <= narrowest) continue;
				const most = this.octaveWall(
					layer,
					KNOB_RANGES[`${layer}Octaves`]!,
				);
				const name = layer === "terrain" ? "Terrain" : "Mountain";
				out.push(
					`The ${layer} layer's narrowest octave is ${Math.round(narrowest)} m across and a map cell is ${Math.round(this.coarseCell)} m, so the map cannot draw the finest ground it is being asked for — and the world is the map, so that ground would not exist. Lower ${name} octaves to ${Math.max(1, most)}, raise ${name} scale, or lower Map cell.`,
				);
			}
		}

		if (this.chunkLevel <= 0) {
			const largestChunkCells = 2 ** Math.max(0, this.depth - 1);
			out.push(
				`A ${k.chunkCells}-cell chunk at depth ${this.depth} is the whole face, which leaves nothing for the level of detail to walk down. Lower Chunk to ${largestChunkCells} cells or under.`,
			);
		}

		if (k.highDeck <= k.lowDeck)
			out.push(
				`The high cloud deck sits at ${k.highDeck} m and the low one at ${k.lowDeck} m, so they are inside out. Raise High deck above ${k.lowDeck} m, or lower Low deck under ${k.highDeck} m.`,
			);

		return out;
	}

	/**
	 * Read a world out of a query string, falling back on the defaults.
	 *
	 * **What comes back is settled.** The panel moves each slider's own ends
	 * with the rest of the draft, so a combination that cannot be built cannot
	 * be dragged to — and a link went straight past that, because **Copy link**
	 * is how a world travels and a hand-edited one is how it gets changed. A
	 * query string naming a crust too shallow for its own sea built a planet
	 * whose ocean columns were entirely under the bottom of the world: no
	 * blocks, nothing drawn, space where the water should be. Settling moves
	 * each value to the nearest one that can be built rather than building the
	 * one that cannot, and {@link problems} stays for whatever settling cannot
	 * reach.
	 */
	static fromParams(params: URLSearchParams): PlanetSettings {
		const knobs: Partial<PlanetKnobs> = {};
		for (const key of Object.keys(
			PLANET_DEFAULTS,
		) as (keyof PlanetKnobs)[]) {
			if (TRANSIENT.has(key)) continue;
			const raw = params.get(key);
			if (raw === null) continue;
			if (key === "seed") knobs.seed = raw;
			// The two knobs that name one of a fixed set. A link can say
			// anything, so what it says has to be on the list or the world
			// keeps the value it had.
			else if (key === "merge") {
				if (MOUNTAIN_MERGES.includes(raw as MountainMerge))
					knobs.merge = raw as MountainMerge;
			} else if (key === "erosionWalk") {
				if (EROSION_WALKS.includes(raw as ErosionWalk))
					knobs.erosionWalk = raw as ErosionWalk;
			} else if (PATCH_CHOICES[key as string]) {
				if (PATCH_CHOICES[key as string]!.includes(raw))
					(knobs as unknown as Record<string, string>)[key] = raw;
			} else if (key === "terrainCurve" || key === "mountainCurve") {
				const curve = curveFromText(raw);
				if (curve) knobs[key] = curve;
			} else if (typeof PLANET_DEFAULTS[key] === "boolean")
				(knobs as unknown as Record<string, boolean>)[key] =
					raw === "true";
			else {
				const value = Number.parseFloat(raw);
				if (Number.isFinite(value))
					(knobs as unknown as Record<string, number>)[key] = value;
			}
		}
		// A link written before depth was asked for directly names a radius.
		// Depth, block size and radius are one quantity, so the depth that
		// radius meant is recoverable exactly.
		const radius = params.get("radius");
		if (radius !== null && params.get("subdivisionDepth") === null) {
			const metres = Number.parseFloat(radius);
			if (Number.isFinite(metres))
				knobs.subdivisionDepth = Math.max(
					1,
					levelFor(
						CELL_CONSTANT * metres,
						knobs.blockSize ?? PLANET_DEFAULTS.blockSize,
					),
				);
		}
		return new PlanetSettings(
			PlanetSettings.settle({ ...PLANET_DEFAULTS, ...knobs }),
		);
	}

	/**
	 * The query string this world travels as.
	 *
	 * Only what differs from the defaults, so a link stays short and says what
	 * was actually chosen.
	 */
	toParams(): URLSearchParams {
		const params = new URLSearchParams();
		for (const key of Object.keys(
			PLANET_DEFAULTS,
		) as (keyof PlanetKnobs)[]) {
			if (TRANSIENT.has(key)) continue;
			const value = this.knobs[key];
			if (key === "terrainCurve" || key === "mountainCurve") {
				const now = curveToText(value as Curve);
				if (now !== curveToText(PLANET_DEFAULTS[key]))
					params.set(key, now);
				continue;
			}
			if (value !== PLANET_DEFAULTS[key]) params.set(key, String(value));
		}
		return params;
	}
}
