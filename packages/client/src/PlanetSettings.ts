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
	TerrainLayer,
	TerrainOptions,
} from "chamfer/generation";
import {
	CARVE_LAYER_DEFAULT,
	CONTINENT_LAYER_DEFAULT,
	CoarseMap,
	EROSION_LAYER_DEFAULT,
	GROUND_LINES,
	PEAKS_LAYER_DEFAULT,
	maxElevationFor,
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
 * The four layers, by the prefix every one of their knobs carries.
 *
 * Written once, because every list of them -- the panel's sections, the URL,
 * the stage keys, the map's narrowest octave -- has to be the same four in the
 * same order or one of them quietly goes missing.
 */
export type LayerName = "continent" | "erosion" | "peaks" | "carve";

export const LAYER_NAMES: readonly LayerName[] = [
	"continent",
	"erosion",
	"peaks",
	"carve",
] as const;

/**
 * The three that reach the coarse map.
 *
 * **The carve is read per block and never touches the map**, so a map fine
 * enough to carry its narrowest octave is a map sized for a field it will never
 * hold -- and the carve is measured against the crust, which is metres where
 * the others are kilometres.
 */
export const MAP_LAYERS: readonly LayerName[] = [
	"continent",
	"erosion",
	"peaks",
] as const;

/** Every knob that is a curve, so a link and a copy know one when they see it. */
export const CURVE_KEYS: ReadonlySet<keyof PlanetKnobs> = new Set(
	LAYER_NAMES.map((layer) => `${layer}Curve` as keyof PlanetKnobs),
);

/** What each layer is called on the panel and in a refusal. */
export const LAYER_TITLES: Record<LayerName, string> = {
	continent: "Continentalness",
	erosion: "Erosion",
	peaks: "Peaks & valleys",
	carve: "Cliffs & overhangs",
};

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
		continentCurve: knobs.continentCurve.map(([x, y]) => [x, y]),
		erosionCurve: knobs.erosionCurve.map(([x, y]) => [x, y]),
		peaksCurve: knobs.peaksCurve.map(([x, y]) => [x, y]),
		carveCurve: knobs.carveCurve.map(([x, y]) => [x, y]),
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
	 * The four layers, each a whole octave stack read through its own curve.
	 *
	 * **The order is the whole construction.** Continentalness sets the level,
	 * erosion decides how much relief survives there, and peaks and valleys is
	 * the relief itself; the carve then cuts into the ground those three
	 * placed. Reading them the other way round -- relief first, then a
	 * continent under it -- gives a mountain range that starts in the sea,
	 * because nothing in the range's own field knows where it is.
	 *
	 * **Every layer carries the same rows**, because the claim is that they
	 * differ in what they *say* rather than in what they *are*. A layer given a
	 * row its neighbours do not have would be a fifth idea smuggled into a
	 * comparison of four. The one exception is the fold, which the carve has
	 * not got: a fold creases a whole world at once, and a crease in a carve
	 * field is invisible from inside the cave it cuts.
	 */
	continentLayer: boolean;
	continentFeature: number;
	continentFeatureScale: number;
	continentOctaves: number;
	continentPersistence: number;
	continentLacunarity: number;
	continentFold: number;
	continentCurve: Curve;

	erosionLayer: boolean;
	erosionFeature: number;
	erosionFeatureScale: number;
	erosionOctaves: number;
	erosionPersistence: number;
	erosionLacunarity: number;
	erosionFold: number;
	erosionCurve: Curve;

	peaksLayer: boolean;
	peaksFeature: number;
	peaksFeatureScale: number;
	peaksOctaves: number;
	peaksPersistence: number;
	peaksLacunarity: number;
	peaksFold: number;
	peaksCurve: Curve;

	carveLayer: boolean;

	/**
	 * How far above sea level the carve stays held off, in metres.
	 *
	 * At and below the waterline nothing is carved, because what the layer
	 * opens down there fills. This is how far up that reaches: a shoreline rule
	 * at a few metres, and turned up it keeps the layer off the low ground
	 * entirely so cliffs and arches appear only well above the sea.
	 */
	carveHold: number;
	carveFeature: number;
	carveFeatureScale: number;
	carveOctaves: number;
	carvePersistence: number;
	carveLacunarity: number;
	carveCurve: Curve;

	/**
	 * How much of the level erosion takes with the relief, `0` to `1`.
	 *
	 * Water wears a range down as well as smoothing it, and where the height is
	 * one function of all three fields, erosion changes the level by
	 * construction. Flattened into one line it has to be a term of its own.
	 */
	erosionBite: number;

	/**
	 * Metres from the continentalness curve's middle to the tallest ground the
	 * level alone can reach.
	 *
	 * **A bound rather than an answer.** The height comes out of the curve in
	 * metres, so nothing divides by the field's own peak -- which is what buys
	 * a coast no metre knob moves, and costs this being the exact height of the
	 * tallest mountain. A full peak stands `peakRelief` above it.
	 */
	relief: number;

	/** Metres from that middle down to the deepest sea floor. */
	seaDepth: number;

	/** Metres a full peak stands over the level the continent set. */
	peakRelief: number;

	/** Metres the water is moved from the curve's own middle. Below zero drains. */
	seaLevel: number;

	/**
	 * Where the landscape bench is standing and what it draws.
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

	/**
	 * How many levels finer than the map the bench's patch is drawn at.
	 *
	 * **The map is not the grid the world is built on.** A map cell is a
	 * reading and a block is a hexagon one layer tall; between two readings the
	 * engine lays blocks up a ramp, and everything about cliffs and overhangs
	 * happens on that grid. Drawn a hexagon per map reading there is nowhere for
	 * an overhang to stand, so the patch is drawn on the block grid and this is
	 * how far under the map that is. At `0` it is the map's own level again.
	 */
	patchDetail: number;

	/**
	 * Whether to draw a ball where each of the bench's lights shines from.
	 *
	 * **They are directions, not places**, so the balls stand on a dome around
	 * the patch: what they say is which way each light comes from and how much
	 * of the total it carries, which is its size. Nothing about the picture
	 * changes when they are on -- they are drawn over it and take no light
	 * themselves, because a lamp lit by the rig it is a picture of would be a
	 * picture of something else.
	 */
	/**
	 * Whether the key and the fill cast a shadow on the bench.
	 *
	 * **Only those two, and not cascades.** Cascades exist because a view of a
	 * world is unbounded -- the near ground wants centimetres a texel and the
	 * far ground cannot have them -- and a bench patch is a box whose corners
	 * are all known before anything is drawn, so one map fitted to that box
	 * beats any number of pieces over it. The light overhead and the one at the
	 * camera cast nothing: between them they are what keeps every face
	 * readable, and a face they could not reach is a face nothing says anything
	 * about.
	 */
	keyShadow: boolean;
	fillShadow: boolean;

	/**
	 * How much of the bench's light each of the three carries.
	 *
	 * **How dark a shadow can be is this and nothing else.** A shadow takes one
	 * light away, so the deepest it can go is that light's share of the total --
	 * with the overhead light at `1.35` against the key's `1`, the key is about
	 * a fifth of a lit face and no shadow of it can take more than a fifth.
	 * That is why there is no darkness knob: the balance already is one, and a
	 * second one over the top of it would be two answers to one question.
	 *
	 * Only the key and the fill cast, so turning the overhead down is what
	 * makes a shadow read -- at the cost of the thing it was raised for, which
	 * is telling a cap from a wall.
	 */
	keyLight: number;
	fillLight: number;
	topLight: number;

	showLights: boolean;

	/**
	 * How bright the bench's preview is, as one multiplier before the curve.
	 *
	 * **A preview cannot be brighter than what it is made of.** Grass is `0.44`
	 * of green, so a cap of it lit perfectly still comes out at `176` of 255 --
	 * no arrangement of lights makes this picture bright, because the lights are
	 * already giving it everything they have. This is the one thing that does,
	 * and it is a knob because how bright is right is a matter of the screen it
	 * is read on.
	 */
	patchLight: number;

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

	/**
	 * Whether the air is drawn at all.
	 *
	 * Off, the renderer marches nothing: no scattering, no haze, no sun disc
	 * dimmed by the air in front of it -- the sun, the moon and the stars still
	 * draw, exactly as bright as the frame gave them.
	 */
	atmosphereOn: boolean;

	/** Steps the view ray takes through the air, once for each screen pixel. */
	inScatteringPoints: number;

	/** Steps the sun ray takes at each of those, baked into a table once. */
	opticalDepthPoints: number;

	/**
	 * How far each pixel's march is offset from its neighbours', as a
	 * fraction of one step.
	 *
	 * **Banding and grain are the same quantity, spent one way or the other.**
	 * A ten-step integral cannot draw a smooth sky and the error has to land
	 * somewhere: at `0` every pixel samples the same heights and it lands as
	 * bands, and the higher this goes the more of it is spread over
	 * neighbouring pixels as noise instead. More **In scattering points** is
	 * what buys a smooth sky without either.
	 */
	skyDither: number;

	/**
	 * How sharply the air thins with height, as one dimensionless number.
	 *
	 * Sebastian Lague's own knob, ported unchanged: an exponential-times-linear
	 * falloff rather than Earth's separate Rayleigh and Mie scale heights.
	 */
	densityFalloff: number;

	/** Nanometres. What the inverse-fourth-power scattering law reads. */
	wavelengthRed: number;
	wavelengthGreen: number;
	wavelengthBlue: number;

	/**
	 * Multiplies every wavelength's own scattering coefficient by the same
	 * amount, which decides the sky's **colour** rather than its brightness.
	 *
	 * Blue scatters `6.4x` harder than red and so is extinguished `6.4x`
	 * faster, so this is really "how much air a ray crosses" and a thicker
	 * sky is a less blue one. Measured over its whole range
	 * (`tools/trial-sky.ts`), the zenith runs from blue at `5.3` blue-over-red
	 * at strength 5, through cyan, to orange at `0.3` at strength 80 --
	 * brightness climbs the whole way. Set this for the colour and set
	 * {@link PlanetKnobs.skyIntensity} for how bright it is.
	 */
	scatteringStrength: number;

	/**
	 * What the light falling on the air is worth. Brightness, and nothing else.
	 *
	 * The one knob here that does not change the sky's colour: it scales the
	 * light scattered toward the eye without touching how much is taken out
	 * along the way. Without it there is no setting that is bright and blue at
	 * once, and turning up the only other brightness control washes the sky to
	 * cyan and then to orange.
	 */
	skyIntensity: number;

	/**
	 * Grey haze: scattering off drops and dust rather than off air.
	 *
	 * Thrown forward rather than evenly, so it is what draws the halo around
	 * a low sun and the pale band along the horizon -- and what makes a sunset
	 * read warm, since it carries no colour of its own where Rayleigh
	 * scattering is always bluest.
	 */
	mieStrength: number;

	/** How tightly the haze throws light forward. `0` even, `0.9` a tight halo. */
	mieDirection: number;

	/**
	 * How much of the air distant **ground** is seen through.
	 *
	 * The sky and the haze over a far hillside are the same coefficients, so
	 * every knob that clears the distance also drains the sky. This one scales
	 * the surface term alone. `1` is honest single scattering, which on a
	 * planet this size draws a ridge two kilometres off nearly the colour of
	 * the sky -- a horizontal look here crosses a large share of the whole
	 * atmosphere's depth, where the same distance on Earth crosses very
	 * little. Under `1` the distance clears and the zenith keeps its blue.
	 */
	aerialPerspective: number;

	/** Fraction of the planet's own radius the air reaches past it. */
	atmosphereScale: number;

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

	/** Draw the ball the selection tests before asking for a chunk. */
	selectBounds: boolean;

	/** Draw the ball the renderer tests before drawing a resident chunk. */
	patchBounds: boolean;

	/**
	 * Whether a cell's colour drifts a little from its block's own.
	 *
	 * On, every cell is moved up to 6% either way by a hash of its own address.
	 * **On by default**, because a hillside of one material at one height is a
	 * single sheet of colour however it is lit, and the drift is the only thing
	 * in the picture that says where one hexagon ends and the next begins. That
	 * is what the landscape bench is for looking at, and it is what the ground
	 * underfoot is made of.
	 *
	 * What it costs is that a cell is no longer exactly the colour the block
	 * registry names, so a frame of the world cannot be held against a frame of
	 * the map colour for colour. Turn it off for that -- the row is on the
	 * bench's viewport and in the world's drawing settings, and it is the same
	 * knob in both.
	 */
	speckle: boolean;

	/**
	 * Whether a corner darkens by how many of the cells touching it are solid.
	 *
	 * Baked into the mesh, so it costs nothing to draw and needs a rebuild to
	 * change. **On by default** -- it is what gives a hollow more shade than a
	 * ridge and a crevice a bottom, which the light alone cannot: the shader
	 * has no way to see what stands around a corner. Off gives every corner
	 * the light its own face would give it anyway, flat.
	 */
	ambientOcclusion: boolean;

	/**
	 * Whether a face darkens by how much sky the ground around it leaves it.
	 *
	 * Read at each face's own layer, so a shaft's wall, a cave's ceiling and
	 * a tunnel all go dark rather than carrying the daylight of the surface
	 * standing over them. Baked into the mesh, so it costs nothing to draw
	 * and needs a rebuild to change.
	 *
	 * **There is no torch in this world yet**, so off is the only way to see
	 * underground: every face then takes the open-sky reading, which is what
	 * the whole world looked like before this was read per layer.
	 */
	skyExposure: boolean;

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
	 * Whether the sun renders its own depth buffers of what stands near.
	 *
	 * Sharp enough to shadow one block by the next. Off, the world is not
	 * drawn the three extra times the cascades cost.
	 */
	cascadeShadows: boolean;

	/**
	 * How many texels a side each of the sun's three shadow maps holds.
	 *
	 * The maps are what shadow a block by its neighbour, or anything that
	 * moves. More texels is a sharper edge and a larger picture to draw the
	 * world into three times over. The sun's cloud cover takes the same
	 * count, so one row says how finely the sun sees anything at all.
	 */
	shadowTexels: number;

	/**
	 * How far from the eye the sun's shadow maps carry, in metres.
	 *
	 * The three of them split that distance, each covering a quarter of the
	 * one beyond it, so the nearest is the sharpest. Past it, nothing casts a
	 * shadow at all.
	 */
	cascadeReach: number;

	/**
	 * Whether the clouds throw shadows on the ground.
	 *
	 * The third of the three, and the only one about something that is not
	 * terrain: the coarse map is a picture of the generated ground, and the
	 * cascades reach a few hundred metres, so a deck three kilometres up is
	 * invisible to both. Off, the sun's cloud cover is not drawn.
	 */
	cloudShadows: boolean;

	/**
	 * How much of the sun a cloud directly overhead takes away.
	 *
	 * Its own knob rather than a share of How dark, because a cloud is
	 * translucent and a hill is not: one number that read right on a mountain
	 * would black the ground out under a cumulus.
	 */
	cloudShadow: number;

	/**
	 * How many metres across the ground the sun's cloud cover reaches.
	 *
	 * Wide rather than deep, because of where the decks are: the low one
	 * stands 3,000 m over a planet 1,700 m in radius, so the cloud whose
	 * shadow falls on a player is a kilometre to the side of overhead even
	 * with the sun high, and further as it drops. The default spans the
	 * planet's own diameter. Under that the shadows stop at a circle around
	 * the player; over it the same texels are spread thinner and every cloud
	 * edge softens.
	 */
	cloudShadowReach: number;

	/**
	 * What the direct sun is worth on a surface.
	 *
	 * The sky has its own brightness under **The air**; this is the other
	 * half. `1` is the balance against the sky the ground shader describes;
	 * under it the world reads as an overcast day, over it as a harder light
	 * with more between a lit face and a turned one.
	 */
	sunStrength: number;

	/**
	 * How much a face's own angle to the sky changes its ambient light.
	 *
	 * A face looking straight up sees the whole sky and one looking sideways
	 * sees half, and that alone is enough to shade one hexagon's faces
	 * differently -- the one thing that can still look directional with
	 * **Sunlight** at 0, because it reads a face's own normal rather than
	 * the sun. `0` gives every face the open-sky reading regardless of which
	 * way it points, which is flat rather than dim: the ambient term stops
	 * depending on shape, and only **Exposure** and the block's own colour
	 * are left.
	 *
	 * **At its natural strength this is subtle almost everywhere.** The term
	 * bottoms out at 0.42 only for a face pointing straight down, and the
	 * shipped ground runs 11.1° of slope at the median -- doc 08 -- where it
	 * has barely moved off 1. A sheer vertical wall, the steepest a cell
	 * ever stands, only reaches 0.71. So `1` reads as flat unless the view
	 * is mostly cliff. Above `1` the term is pushed past that natural floor
	 * for a stronger effect on steep ground; `2` reaches 0 on a sheer wall
	 * rather than 0.71. Flat ground is untouched at any strength, because a
	 * face looking straight up always reads 1 regardless.
	 */
	skyShading: number;

	/**
	 * What the sky's own ambient light is worth on a surface.
	 *
	 * A different knob from **Sky brightness** under **The air**, which is
	 * how bright the marched atmosphere itself reads. This is the ground's
	 * own ambient term -- what is left lighting the world once the sun goes
	 * to `0` -- and nothing before it could turn that down at all. `1` is
	 * the ambient share the ground shader's own `SUN_SHARE` describes; the
	 * floor a face keeps after dark and the sea are both untouched by it.
	 */
	skyStrength: number;

	/**
	 * Whether the sun reaches every face as though no block stood in the way.
	 *
	 * **A way to see underground until there is something to carry down
	 * there.** It takes away the blocking and nothing else -- the shadow the
	 * cascades would cast, and the sky exposure the mesher would bake. Every
	 * other term still does its own work, so a face's angle to the sun decides
	 * what it takes and a cave keeps its shape instead of going flat.
	 *
	 * The sky exposure has to stop being *baked*, because no light a shader
	 * computes can undo a number already multiplied into the colour it was
	 * handed -- without that a cave stays at the 12% a shut-in cell is baked
	 * to, however far the sun is said to reach. That is why it needs a rebuild
	 * rather than taking effect on the next frame.
	 */
	fullbright: boolean;

	/**
	 * How much light the moon throws on the ground.
	 *
	 * It is the only thing with a direction after dark, so at `0` every face
	 * of a block takes the same light all night and a block is a silhouette
	 * rather than a shape.
	 */
	moonLight: number;

	/**
	 * What the whole picture is multiplied by on its way to the screen.
	 *
	 * The world is drawn in light rather than in color, so a surface in full
	 * sun and one at dawn differ by however much less light there is, and
	 * everything past white is bent toward it by the ACES curve rather than
	 * clipped. This is the one knob over that: a plain multiplier, with no
	 * reading of the scene behind it deciding what "dark" ought to mean.
	 */
	exposure: number;

	/**
	 * Whether anything brighter than the screen spills into what is beside it.
	 *
	 * A screen has one white, so a sun and a cloud reach it as the same pixel
	 * and the sun reads as a flat coin. What separates them is the glare, and
	 * this is what draws it. Off, the sun is a disc again.
	 */
	bloomOn: boolean;

	/** How bright a thing has to be before it spills. */
	bloomThreshold: number;

	/** How much of the blurred glare is added back over the picture. */
	bloomStrength: number;

	/**
	 * Whether how much sky a pixel can see is worked out from the picture.
	 *
	 * Screen-space ambient occlusion. The mesher already bakes two occlusion
	 * terms -- how much sky a column stands under, and how boxed in a corner
	 * is -- and both are facts about the block grid, settled before there is
	 * a view. This one can see that one hill stands in front of another, or
	 * that a wall built this morning shades the ground beside it.
	 *
	 * **It costs a whole extra pass over the geometry.** The sky's share is
	 * decided while the world is being drawn, so the occlusion has to exist
	 * before that -- which means finding out where the geometry is twice.
	 */
	ssao: boolean;

	/** How far over a surface the occlusion looks, in metres. */
	ssaoReach: number;

	/** How much of the sky a fully blocked pixel loses. */
	ssaoStrength: number;

	/**
	 * Whether light bounces once from surface to surface.
	 *
	 * Screen-space global illumination. Every light in this world arrives
	 * straight from its source, so a sunlit cliff throws nothing onto the
	 * shaded ground beside it. This gathers what the frame already drew and
	 * adds a share of it back.
	 *
	 * **It only knows what is on screen**, which is the standing limit of the
	 * technique: a wall out of frame bounces nothing, so turning the camera
	 * changes the light.
	 */
	ssgi: boolean;

	/** How far across the picture a bounce carries, in pixels. */
	ssgiReach: number;

	/** How much of the gathered bounce is added. */
	ssgiStrength: number;

	/**
	 * How much of the light a blocked direction intercepts comes back.
	 *
	 * A direction blocked by rock points at a lit surface, and some of what
	 * lands there returns. Baked into the mesh by the same walk that decides
	 * how much sky a face sees, so it costs no pass of its own and needs the
	 * chunks built again to move.
	 *
	 * **It is the sky's bounce, never the sun's.** A baked term cannot follow
	 * a sun that moves, so a sunlit rim throws no warm patch on the wall
	 * opposite -- what it does is stop everything enclosed sharing one flat
	 * floor. Zero is that floor, and is what this was before.
	 */
	skyBounce: number;

	/**
	 * How many times the canvas the world is drawn at before it is put back.
	 *
	 * **The one antialiasing a world of hard edges answers to.** A voxel
	 * hillside aliases in its *shading* as much as at its edges -- the flat
	 * top of a step and the riser beside it take very different amounts of a
	 * low sun -- and multisampling only ever helps an edge. Drawing the whole
	 * picture larger and averaging it back helps both.
	 *
	 * It costs the square of itself: `2` is four times the pixels through
	 * every pass inside the frame. `1` is off, and off is exact -- the tone
	 * curve reads one texel per pixel with no filtering at all.
	 */
	superSample: number;

	/** How fast the player walks, in metres a second. */
	walkSpeed: number;

	/** How fast the player flies, in metres a second, before altitude speeds it up further. */
	flySpeed: number;

	/**
	 * How far a player can reach to break or place a block, in blocks.
	 *
	 * **In blocks, not metres**, so it means the same thing on a world built
	 * of 1 m blocks and one built of 4 m blocks: how many blocks along the
	 * line of sight the arm gets to. It is what the aiming walk is given as
	 * its length, so the outline, the crosshair and the click all take it
	 * together and none of them can disagree about where the arm stops.
	 */
	reach: number;
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
	continentLayer: true,
	continentFeature: 600,
	continentFeatureScale: 10,
	continentOctaves: 3,
	continentPersistence: 0.5,
	continentLacunarity: 2,
	continentFold: 0,
	continentCurve: CONTINENT_LAYER_DEFAULT.curve,
	erosionLayer: true,
	erosionFeature: 750,
	erosionFeatureScale: 10,
	erosionOctaves: 4,
	erosionPersistence: 0.5,
	erosionLacunarity: 2,
	erosionFold: 0,
	erosionCurve: EROSION_LAYER_DEFAULT.curve,
	// **Folded, and the only layer that is.** A ridge is a crease and the only
	// place a crease comes from is an absolute value; folding either of the
	// other two creases the coast of every continent instead.
	peaksLayer: true,
	peaksFeature: 600,
	peaksFeatureScale: 1,
	peaksOctaves: 4,
	peaksPersistence: 0.5,
	peaksLacunarity: 2,
	peaksFold: 0.85,
	peaksCurve: PEAKS_LAYER_DEFAULT.curve,
	// **Measured against the crust, not against a landform.** The other three
	// draw continents and ranges and a hundred metres is the smallest thing
	// worth calling one; this has to swing several times inside a crust a
	// couple of hundred metres deep or what comes out is a lowered surface
	// rather than an overhang.
	carveLayer: true,
	carveHold: 30,
	carveFeature: 120,
	carveFeatureScale: 1,
	carveOctaves: 3,
	carvePersistence: 0.5,
	carveLacunarity: 2,
	carveCurve: CARVE_LAYER_DEFAULT.curve,
	erosionBite: 0.55,
	relief: 800,
	seaDepth: 360,
	peakRelief: 220,
	seaLevel: 0,
	// A place with a coast, a plain and a range on it, so the bench opens on
	// all three rather than on whichever the middle of the map happened to be.
	// **A coast with mountains behind it**, because the bench has to open on
	// something the knobs can be judged against: open ocean says nothing about
	// relief and an inland plain says nothing about the waterline.
	patchLatitude: 65,
	patchLongitude: -20,
	patchCells: 32,
	patchDetail: 2,
	keyShadow: false,
	fillShadow: false,
	keyLight: 1,
	fillLight: 0.15,
	topLight: 1.35,
	showLights: false,
	patchLight: 1.5,
	patchPicture: "ground",
	patchSurface: "solid",
	patchMap: "patch",
	patchAlong: "x",
	crustMetres: 1232,
	atmosphereOn: true,
	inScatteringPoints: 10,
	opticalDepthPoints: 10,
	skyDither: 0.55,
	// Steeper than the 4.3 a screenshot of one of Lague's own planets showed:
	// it packs the air nearer the ground, which lengthens a horizontal path
	// against a vertical one and is what a small planet is short of.
	densityFalloff: 8,
	wavelengthRed: 700,
	wavelengthGreen: 530,
	wavelengthBlue: 440,
	// **Chosen by measurement, not by eye** (`tools/trial-sky.ts`). Swept over
	// strength, falloff and scale, this is the corner that holds a blue zenith
	// and a red sunset at once: blue-over-red `3.3` at the zenith under a
	// 60-degree sun, red-over-blue `2.9` looking at a 2-degree one, and a sun
	// disc reddened `5.4` to one by the air it is seen through. A small planet
	// cannot reach Earth's numbers here -- the ratio between a vertical path
	// and a horizontal one is what makes a sunset, and that ratio is set by
	// how large the planet is against how deep its air is.
	scatteringStrength: 16,
	skyIntensity: 2,
	mieStrength: 0.4,
	mieDirection: 0.76,
	// Under the honest 1: a full-strength haze reads as fog on this planet,
	// because a horizontal look crosses a large share of the air's whole
	// depth at a distance where an eye still expects to see ground.
	aerialPerspective: 0.45,
	// **The air has to contain the altitudes people are actually at.** The
	// sweep's best colour came at `0.15`, which is `1,020 m` of air on this
	// planet -- and the world opens with the camera `1,100 m` up, looking at
	// the sky from outside it. This is `1,700 m`, which holds the opening
	// view and every altitude a player flies to, and costs `0.35` of
	// blue-over-red at the zenith against that thinner best.
	atmosphereScale: 0.25,
	cloudsDrawn: true,
	lowDeck: 6100,
	highDeck: 22600,
	cloudPuff: 248,
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
	cloudClusters: 2300,
	cloudDensity: 78,
	cloudSpread: 1600,
	detail: 1.5,
	buildCull: true,
	cullMargin: 25,
	nearestFirst: true,
	apron: true,
	seamOverlay: false,
	selectBounds: false,
	patchBounds: false,
	speckle: true,
	ambientOcclusion: true,
	skyExposure: true,
	gridMode: false,
	gridLevels: true,
	gridCells: true,
	gridChunks: true,
	gridFaces: false,
	freezeView: false,
	dayLength: 3600,
	paused: true,
	// **A world opens in daylight.** The clock is paused by default, so
	// whatever time it is frozen at is the light every look at this world is
	// taken in -- and this was `0.18`, which puts the sun **24.6 degrees under
	// the horizon** at the place the shipped seed spawns on. The ground was
	// being judged, and its colours compared against the landscape bench's, in
	// the dark. This is the sun 44.6 degrees up over that spawn: bright, and
	// still low enough to model a hillside rather than flatten it the way noon
	// does. A different seed spawns at a different longitude, where the same
	// number is a different hour; the row above the slider is one drag.
	timeOfDay: 0.75,
	cascadeShadows: true,
	shadowTexels: 1024,
	cascadeReach: 260,
	cloudShadows: true,
	cloudShadow: 0.55,
	cloudShadowReach: 4000,
	sunStrength: 1,
	skyShading: 1,
	skyStrength: 1,
	fullbright: false,
	moonLight: 0.16,
	exposure: 1,
	bloomOn: true,
	// Just over white, so only what the tone curve was about to fold away
	// spills -- lit ground sits near 1 and the sun sits at 120.
	bloomThreshold: 1.1,
	bloomStrength: 0.55,
	ssao: false,
	ssaoReach: 1.6,
	ssaoStrength: 0.9,
	ssgi: false,
	ssgiReach: 48,
	ssgiStrength: 1.5,
	skyBounce: 0.35,
	superSample: 1,
	walkSpeed: PLAYER_DEFAULTS.walkSpeed,
	flySpeed: PLAYER_DEFAULTS.flySpeed,
	reach: 64,
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
	"continentLayer",
	"continentFeature",
	"continentFeatureScale",
	"continentOctaves",
	"continentPersistence",
	"continentLacunarity",
	"continentFold",
	"continentCurve",
	"erosionLayer",
	"erosionFeature",
	"erosionFeatureScale",
	"erosionOctaves",
	"erosionPersistence",
	"erosionLacunarity",
	"erosionFold",
	"erosionCurve",
	"peaksLayer",
	"peaksFeature",
	"peaksFeatureScale",
	"peaksOctaves",
	"peaksPersistence",
	"peaksLacunarity",
	"peaksFold",
	"peaksCurve",
	// **The carve is read per block, not per map cell**, so it never touches
	// the map -- and it still belongs here, because every chunk has to be
	// generated again for a cliff to appear or go.
	"carveLayer",
	"carveFeature",
	"carveFeatureScale",
	"carveOctaves",
	"carvePersistence",
	"carveLacunarity",
	"carveCurve",
	"carveHold",
	"erosionBite",
	"seaLevel",
	"relief",
	"seaDepth",
	"peakRelief",
] satisfies (keyof PlanetKnobs)[]);

/**
 * The knobs that need the chunks built again and move no block doing it.
 *
 * What they change is **baked into the vertex colours** rather than read by a
 * shader, so nothing on screen moves until each chunk is meshed again -- and
 * the map, the shape, the peaks and the generators are all exactly what they
 * were, because the terrain reads a face and a lattice offset and never sees
 * one of these. That is what lets them take a cheaper path than a terrain
 * knob: the pool is retuned in place rather than replaced, which skips the
 * coarse map.
 *
 * **They are deliberately not in {@link LIVE_TERRAIN_KNOBS}**, which
 * {@link WORLD_SHAPE_KNOBS} spreads: a world's stored edits are named by that
 * set, so a knob joining it files a player's buildings under a different world
 * every time it is turned. Needing the same work as a terrain knob is not the
 * same thing as being one, and this is the set that says so.
 *
 * **`fullbright` is here and reaches the mesher through `skyExposure`.** The
 * sky term is a number multiplied into a vertex colour, and no shader can
 * divide one back out of what it was handed, so full light has to stop it
 * being baked rather than override it afterwards.
 */
export const BAKED_KNOBS: ReadonlySet<keyof PlanetKnobs> = new Set([
	"speckle",
	"ambientOcclusion",
	"skyExposure",
	"skyBounce",
	"fullbright",
] satisfies (keyof PlanetKnobs)[]);

/**
 * The knobs a live rebuild can show, which is every one needing the chunks
 * meshed again.
 *
 * {@link LIVE_TERRAIN_KNOBS} is the ground itself moving and needs the map
 * built again with it; {@link BAKED_KNOBS} needs only the meshes. Which of the
 * two a key falls in decides which path it takes, and this set is what says a
 * key takes either.
 */
export const REMESH_KNOBS: ReadonlySet<keyof PlanetKnobs> = new Set([
	...LIVE_TERRAIN_KNOBS,
	...BAKED_KNOBS,
] satisfies (keyof PlanetKnobs)[]);

/**
 * The knobs that decide where a cell is or what block sits there.
 *
 * A world's stored edits are named by these, so a change to any of them is a
 * different world with its own empty set of them, and setting them back reaches
 * the earlier one again.
 *
 * **`chunkCells` is deliberately absent.** It decides how the address is cut
 * for loading and drawing and moves no block: the terrain reads a face and a
 * lattice offset and never sees the cut, so a world at eight cells a chunk and
 * the same world at sixty-four hold the same ground in the same places. So are
 * the knobs that decide only how the world is drawn -- the light, the sky, the
 * clouds, the sea's surface and every level-of-detail setting.
 *
 * **So are the three that are baked into the mesh** -- the speckle, the corner
 * shading and the sky exposure. Each of them needs every chunk built again to
 * be seen, which is what {@link REMESH_KNOBS} is for, and none of them moves a
 * block: a cell's colour drifting 6% off its own block's is not a different
 * world to put a player's buildings in.
 */
export const WORLD_SHAPE_KNOBS: ReadonlySet<keyof PlanetKnobs> = new Set([
	...LIVE_TERRAIN_KNOBS,
	"plain",
	"subdivisionDepth",
	"blockSize",
	"crustMetres",
] satisfies (keyof PlanetKnobs)[]);

export const KNOB_RANGES: Record<string, KnobRange> = {
	plain: { ...TOGGLE, rebuilds: true },
	subdivisionDepth: { low: 4, high: 17, step: 1, rebuilds: true, unit: "" },
	blockSize: { low: 0.5, high: 4, step: 0.25, rebuilds: true, unit: "m" },
	chunkCells: { low: 8, high: 64, step: 8, rebuilds: true, unit: "cells" },
	coarseSpacing: { low: 4, high: 128, step: 4, rebuilds: true, unit: "m" },
	continentLayer: { ...TOGGLE, rebuilds: true },
	continentFeature: {
		low: 100,
		high: 1000,
		step: 10,
		rebuilds: true,
		unit: "m",
	},
	continentFeatureScale: {
		low: 1,
		high: 100,
		step: 1,
		rebuilds: true,
		unit: "x",
	},
	continentOctaves: { low: 1, high: 8, step: 1, rebuilds: true, unit: "" },
	continentPersistence: {
		low: 0.1,
		high: 0.9,
		step: 0.05,
		rebuilds: true,
		unit: "",
	},
	continentLacunarity: {
		low: 1.5,
		high: 3,
		step: 0.1,
		rebuilds: true,
		unit: "x",
	},
	continentFold: { low: 0, high: 1, step: 0.05, rebuilds: true, unit: "" },
	continentCurve: { ...TOGGLE, rebuilds: true },
	erosionLayer: { ...TOGGLE, rebuilds: true },
	erosionFeature: {
		low: 100,
		high: 1000,
		step: 10,
		rebuilds: true,
		unit: "m",
	},
	erosionFeatureScale: {
		low: 1,
		high: 100,
		step: 1,
		rebuilds: true,
		unit: "x",
	},
	erosionOctaves: { low: 1, high: 8, step: 1, rebuilds: true, unit: "" },
	erosionPersistence: {
		low: 0.1,
		high: 0.9,
		step: 0.05,
		rebuilds: true,
		unit: "",
	},
	erosionLacunarity: {
		low: 1.5,
		high: 3,
		step: 0.1,
		rebuilds: true,
		unit: "x",
	},
	erosionFold: { low: 0, high: 1, step: 0.05, rebuilds: true, unit: "" },
	erosionCurve: { ...TOGGLE, rebuilds: true },
	peaksLayer: { ...TOGGLE, rebuilds: true },
	peaksFeature: {
		low: 100,
		high: 1000,
		step: 10,
		rebuilds: true,
		unit: "m",
	},
	peaksFeatureScale: {
		low: 1,
		high: 100,
		step: 1,
		rebuilds: true,
		unit: "x",
	},
	peaksOctaves: { low: 1, high: 8, step: 1, rebuilds: true, unit: "" },
	peaksPersistence: {
		low: 0.1,
		high: 0.9,
		step: 0.05,
		rebuilds: true,
		unit: "",
	},
	peaksLacunarity: {
		low: 1.5,
		high: 3,
		step: 0.1,
		rebuilds: true,
		unit: "x",
	},
	peaksFold: { low: 0, high: 1, step: 0.05, rebuilds: true, unit: "" },
	peaksCurve: { ...TOGGLE, rebuilds: true },
	carveLayer: { ...TOGGLE, rebuilds: true },
	carveHold: { low: 0, high: 600, step: 5, rebuilds: true, unit: "m" },
	carveFeature: {
		low: 10,
		high: 1000,
		step: 10,
		rebuilds: true,
		unit: "m",
	},
	carveFeatureScale: {
		low: 1,
		high: 100,
		step: 1,
		rebuilds: true,
		unit: "x",
	},
	carveOctaves: { low: 1, high: 8, step: 1, rebuilds: true, unit: "" },
	carvePersistence: {
		low: 0.1,
		high: 0.9,
		step: 0.05,
		rebuilds: true,
		unit: "",
	},
	carveLacunarity: {
		low: 1.5,
		high: 3,
		step: 0.1,
		rebuilds: true,
		unit: "x",
	},
	carveCurve: { ...TOGGLE, rebuilds: true },
	erosionBite: { low: 0, high: 1, step: 0.05, rebuilds: true, unit: "" },
	relief: { low: 100, high: 3000, step: 20, rebuilds: true, unit: "m" },
	seaDepth: { low: 0, high: 2000, step: 20, rebuilds: true, unit: "m" },
	peakRelief: { low: 0, high: 1500, step: 10, rebuilds: true, unit: "m" },
	// **The water moves off the curve's own middle, either way.** Below zero
	// drains and above it floods, and neither moves the ground -- at no erosion
	// bite the whole field lifts by exactly these metres.
	seaLevel: { low: -1200, high: 400, step: 5, rebuilds: true, unit: "m" },
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
	patchCells: { low: 16, high: 256, step: 8, rebuilds: false, unit: "cells" },
	keyLight: { low: 0, high: 3, step: 0.05, rebuilds: false, unit: "x" },
	fillLight: { low: 0, high: 3, step: 0.05, rebuilds: false, unit: "x" },
	topLight: { low: 0, high: 3, step: 0.05, rebuilds: false, unit: "x" },
	keyShadow: { ...TOGGLE, rebuilds: false },
	fillShadow: { ...TOGGLE, rebuilds: false },
	showLights: { ...TOGGLE, rebuilds: false },
	patchLight: { low: 0.4, high: 3, step: 0.1, rebuilds: false, unit: "x" },
	patchDetail: {
		low: 0,
		high: 3,
		step: 1,
		rebuilds: false,
		unit: "levels under the map",
	},
	patchPicture: { low: 0, high: 0, step: 1, rebuilds: false, unit: "" },
	patchSurface: { low: 0, high: 0, step: 1, rebuilds: false, unit: "" },
	patchMap: { low: 0, high: 0, step: 1, rebuilds: false, unit: "" },
	patchAlong: { low: 0, high: 0, step: 1, rebuilds: false, unit: "" },
	// A crust is a count of layers and a layer is a block tall, so the metres
	// it reaches are the layer field's 2,048 times whatever a block is: 2,048 m
	// at a 1 m block and 8,192 m at a 4 m one, which is the largest any world
	// here reaches. Stating this in metres and holding it at the layer count
	// held every world with a block over a metre to a fraction of the depth it
	// could carry, because `rangeFor` only ever narrows.
	crustMetres: { low: 32, high: 8192, step: 16, rebuilds: true, unit: "m" },
	atmosphereOn: { ...TOGGLE, rebuilds: false },
	inScatteringPoints: {
		low: 1,
		high: 30,
		step: 1,
		rebuilds: false,
		unit: "",
	},
	opticalDepthPoints: {
		low: 1,
		high: 30,
		step: 1,
		rebuilds: false,
		unit: "",
	},
	skyDither: { low: 0, high: 1, step: 0.05, rebuilds: false, unit: "" },
	densityFalloff: {
		low: 0.1,
		high: 12,
		step: 0.1,
		rebuilds: false,
		unit: "",
	},
	wavelengthRed: {
		low: 380,
		high: 780,
		step: 5,
		rebuilds: false,
		unit: "nm",
	},
	wavelengthGreen: {
		low: 380,
		high: 780,
		step: 5,
		rebuilds: false,
		unit: "nm",
	},
	wavelengthBlue: {
		low: 380,
		high: 780,
		step: 5,
		rebuilds: false,
		unit: "nm",
	},
	scatteringStrength: {
		low: 0,
		high: 60,
		step: 0.5,
		rebuilds: false,
		unit: "",
	},
	skyIntensity: { low: 0, high: 12, step: 0.05, rebuilds: false, unit: "x" },
	mieStrength: { low: 0, high: 4, step: 0.02, rebuilds: false, unit: "" },
	mieDirection: {
		low: 0,
		high: 0.95,
		step: 0.01,
		rebuilds: false,
		unit: "",
	},
	aerialPerspective: {
		low: 0,
		high: 1.5,
		step: 0.05,
		rebuilds: false,
		unit: "x",
	},
	atmosphereScale: {
		low: 0.02,
		high: 1,
		step: 0.005,
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
	selectBounds: { ...TOGGLE, rebuilds: false },
	patchBounds: { ...TOGGLE, rebuilds: false },
	speckle: { ...TOGGLE, rebuilds: true },
	ambientOcclusion: { ...TOGGLE, rebuilds: true },
	skyExposure: { ...TOGGLE, rebuilds: true },
	gridMode: { ...TOGGLE, rebuilds: true },
	gridLevels: { ...TOGGLE, rebuilds: true },
	gridCells: { ...TOGGLE, rebuilds: true },
	gridChunks: { ...TOGGLE, rebuilds: true },
	gridFaces: { ...TOGGLE, rebuilds: true },
	freezeView: { ...TOGGLE, rebuilds: false },
	dayLength: { low: 30, high: 3600, step: 10, rebuilds: false, unit: "s" },
	paused: { ...TOGGLE, rebuilds: false },
	timeOfDay: { low: 0, high: 1, step: 0.01, rebuilds: false, unit: "" },
	cascadeShadows: { ...TOGGLE, rebuilds: false },
	shadowTexels: {
		low: 256,
		high: 4096,
		step: 256,
		rebuilds: false,
		unit: "",
	},
	cascadeReach: { low: 0, high: 1200, step: 20, rebuilds: false, unit: "m" },
	cloudShadows: { ...TOGGLE, rebuilds: false },
	cloudShadow: { low: 0, high: 1, step: 0.05, rebuilds: false, unit: "" },
	cloudShadowReach: {
		low: 500,
		high: 20000,
		step: 250,
		rebuilds: false,
		unit: "m",
	},
	sunStrength: { low: 0, high: 3, step: 0.05, rebuilds: false, unit: "x" },
	skyShading: { low: 0, high: 2, step: 0.05, rebuilds: false, unit: "" },
	skyStrength: { low: 0, high: 3, step: 0.05, rebuilds: false, unit: "x" },
	fullbright: { ...TOGGLE, rebuilds: true },
	moonLight: { low: 0, high: 0.5, step: 0.01, rebuilds: false, unit: "" },
	exposure: { low: 0.1, high: 8, step: 0.05, rebuilds: false, unit: "x" },
	bloomOn: { ...TOGGLE, rebuilds: false },
	bloomThreshold: {
		low: 0,
		high: 6,
		step: 0.05,
		rebuilds: false,
		unit: "",
	},
	bloomStrength: { low: 0, high: 2, step: 0.05, rebuilds: false, unit: "" },
	ssao: { ...TOGGLE, rebuilds: false },
	ssaoReach: { low: 0.2, high: 6, step: 0.1, rebuilds: false, unit: "m" },
	ssaoStrength: {
		low: 0,
		high: 2,
		step: 0.05,
		rebuilds: false,
		unit: "",
	},
	ssgi: { ...TOGGLE, rebuilds: false },
	ssgiReach: { low: 8, high: 160, step: 4, rebuilds: false, unit: "px" },
	ssgiStrength: { low: 0, high: 6, step: 0.05, rebuilds: false, unit: "" },
	skyBounce: { low: 0, high: 1, step: 0.05, rebuilds: true, unit: "" },
	superSample: { low: 1, high: 2, step: 0.25, rebuilds: false, unit: "x" },
	walkSpeed: { low: 0.5, high: 20, step: 0.5, rebuilds: false, unit: "m/s" },
	flySpeed: { low: 2, high: 120, step: 1, rebuilds: false, unit: "m/s" },
	reach: { low: 2, high: 64, step: 1, rebuilds: false, unit: "blocks" },
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

	/**
	 * The knobs this world's stored edits are named by, as a plain record.
	 *
	 * Values at full precision: two worlds a millimetre apart are two worlds.
	 */
	worldShape(): Record<string, number | string> {
		const knobs = this.knobs as unknown as Record<string, number | string>;
		const out: Record<string, number | string> = {};
		for (const name of [...WORLD_SHAPE_KNOBS].sort())
			out[name] = knobs[name]!;
		return out;
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
	 * The lattice the bench's patch is drawn at, which is the block grid.
	 *
	 * Capped at the world's own depth: past that there is no finer lattice for
	 * the address to name, and a patch cannot be drawn on a grid the planet
	 * does not have.
	 */
	get patchLevel(): number {
		return Math.min(
			this.depth,
			this.coarseLevel + Math.max(0, Math.round(this.knobs.patchDetail)),
		);
	}

	/** How wide one of the bench patch's columns is, in metres. */
	get patchCellMetres(): number {
		return (CELL_CONSTANT * this.radius) / 2 ** this.patchLevel;
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
		let narrowest = Infinity;
		for (const layer of MAP_LAYERS) {
			if (!this.layerOn(layer)) continue;
			narrowest = Math.min(narrowest, this.narrowestOf(layer));
		}
		return narrowest;
	}

	/** Whether one layer reaches the ground at all. */
	layerOn(layer: LayerName): boolean {
		const k = this.knobs as unknown as Record<string, boolean>;
		return k[`${layer}Layer`]!;
	}

	/**
	 * Metres across the narrowest octave one layer makes.
	 *
	 * Each layer carries its own width, octave count and step between octaves,
	 * so the three are asked together: a map fine enough for one layer's last
	 * octave may be far too coarse for another's.
	 */
	narrowestOf(layer: LayerName): number {
		const k = this.knobs as unknown as Record<string, number>;
		return (
			this.widestOf(layer) /
			k[`${layer}Lacunarity`]! ** (k[`${layer}Octaves`]! - 1)
		);
	}

	/**
	 * One layer, as the engine takes it.
	 *
	 * Public because the curve rows read it too, to sample the layer's own
	 * field for the histogram behind the curve -- the same frequency the
	 * generator will actually use, not a hand-converted approximation of it.
	 */
	layerFor(layer: LayerName): TerrainLayer {
		const k = this.knobs as unknown as Record<string, number>;
		const curves = this.knobs as unknown as Record<string, Curve>;
		return {
			metres: this.widestOf(layer),
			octaves: k[`${layer}Octaves`]!,
			persistence: k[`${layer}Persistence`]!,
			lacunarity: k[`${layer}Lacunarity`]!,
			// **The carve has no fold and the fold is what a fold is for**: a
			// crease belongs on peaks and valleys, and a crease in a carve field
			// is one nobody can see from inside the cave it cuts.
			fold: layer === "carve" ? 0 : k[`${layer}Fold`]!,
			curve: curves[`${layer}Curve`]!,
		};
	}

	/**
	 * Metres across a layer's widest octave, which is what its two rows set.
	 *
	 * The coarse slider carries the decade and the fine one picks the value
	 * inside it: one slider cannot hold a hundred metres and a hundred
	 * kilometres at a resolution anybody can drag.
	 */
	widestOf(layer: LayerName): number {
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
			continent: this.layerFor("continent"),
			erosion: this.layerFor("erosion"),
			peaks: this.layerFor("peaks"),
			continentLayer: this.knobs.continentLayer,
			erosionLayer: this.knobs.erosionLayer,
			peaksLayer: this.knobs.peaksLayer,
			erosionBite: this.knobs.erosionBite,
			relief: this.relief,
			seaDepth: this.seaDepth,
			peakRelief: this.knobs.peakRelief,
			seaLevel: this.coarseMapRuns ? this.knobs.seaLevel : 0,
		};
	}

	terrainOptions(): TerrainOptions {
		// The two lines are absolute metres, the same metres the Ground map's
		// bands are drawn on, so a colour on the map is the block the world
		// builds. **The carve is here and not in the map's options** because it
		// is read per block down a column and never touches the map.
		return {
			rockLine: GROUND_LINES.rock,
			snowLine: GROUND_LINES.snow,
			carveLayer: this.coarseMapRuns && this.knobs.carveLayer,
			carve: this.layerFor("carve"),
			carveHold: this.knobs.carveHold,
		};
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
	private octaveWall(layer: LayerName, range: KnobRange): number {
		const k = this.knobs as unknown as Record<string, number>;
		const step = Math.max(1.01, k[`${layer}Lacunarity`]!);
		return Math.max(
			range.low,
			Math.min(
				range.high,
				1 +
					Math.floor(
						Math.log(this.widestOf(layer) / (2 * this.coarseCell)) /
							Math.log(step),
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
			case "continentOctaves":
				return narrowed({ high: this.octaveWall("continent", range) });
			case "erosionOctaves":
				return narrowed({ high: this.octaveWall("erosion", range) });
			case "peaksOctaves":
				return narrowed({ high: this.octaveWall("peaks", range) });
			// Even one octave has to be two map cells wide, and the fine slider
			// reaches its own bottom, so the coarse one starts where their
			// product does. What is cut off is a landform the map could not
			// draw at any octave count.
			case "continentFeatureScale":
			case "erosionFeatureScale":
			case "peaksFeatureScale":
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
								)[key.replace("FeatureScale", "Feature")]!,
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
			"continentFeatureScale",
			"continentOctaves",
			"erosionFeatureScale",
			"erosionOctaves",
			"peaksFeatureScale",
			"peaksOctaves",
			"relief",
			"seaDepth",
			"peakRelief",
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
			// **The carve is not asked**, because it is read per block and
			// never goes near the map: a map cell coarser than its narrowest
			// octave costs it nothing.
			for (const layer of MAP_LAYERS) {
				if (!this.layerOn(layer)) continue;
				const narrowest = this.narrowestOf(layer);
				if (this.coarseCell * 2 <= narrowest) continue;
				const most = this.octaveWall(
					layer,
					KNOB_RANGES[`${layer}Octaves`]!,
				);
				const name = LAYER_TITLES[layer];
				out.push(
					`The ${name} layer's narrowest octave is ${Math.round(narrowest)} m across and a map cell is ${Math.round(this.coarseCell)} m, so the map cannot draw the finest ground it is being asked for — and the world is the map, so that ground would not exist. Lower ${name} octaves to ${Math.max(1, most)}, raise ${name} scale, or lower Map cell.`,
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
			// The knobs that name one of a fixed set. A link can say anything,
			// so what it says has to be on the list or the world keeps the
			// value it had.
			else if (PATCH_CHOICES[key as string]) {
				if (PATCH_CHOICES[key as string]!.includes(raw))
					(knobs as unknown as Record<string, string>)[key] = raw;
			} else if (CURVE_KEYS.has(key)) {
				const curve = curveFromText(raw);
				if (curve)
					(knobs as unknown as Record<string, Curve>)[key] = curve;
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
			if (CURVE_KEYS.has(key)) {
				const now = curveToText(value as Curve);
				if (now !== curveToText(PLANET_DEFAULTS[key] as Curve))
					params.set(key, now);
				continue;
			}
			if (value !== PLANET_DEFAULTS[key]) params.set(key, String(value));
		}
		return params;
	}
}
