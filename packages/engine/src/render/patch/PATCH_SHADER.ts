import { BLOCK_COLORS } from "../../generation/terrain/blockColor.js";
import { BLOCK_NAMES, BlockType } from "../../generation/terrain/BlockType.js";
import { SEA_CLARITY, SEA_COLORS } from "../sea/SEA_COLORS.js";
import { SUN_SHARE } from "../../light/SUN_SHARE.js";
import { patchFill } from "./PATCH_LIGHTS.js";

/** One linear colour as the constant a shader takes. */
function wgsl(color: readonly [number, number, number]): string {
	return `vec3f(${color[0]}, ${color[1]}, ${color[2]})`;
}

/**
 * The whole block registry, in the order its numbers were assigned.
 *
 * **Written in from the registry rather than passed per draw.** A face carries
 * the block it is made of, and what that block looks like is a property of the
 * world -- so the table is the same for every patch, every picture and every
 * bench, and a stand of forty species costs no more than a stand of one.
 */
function blockTints(): string {
	const entries = BLOCK_NAMES.map((_, block) =>
		wgsl(BLOCK_COLORS[block] ?? [0, 0, 0]),
	);
	return `array<vec3f, ${entries.length}>(\n\t${entries.join(",\n\t")}\n)`;
}

/**
 * The patch shader: one preview of the ground, and the pictures it can be
 * drawn as.
 *
 * Every picture is a branch here rather than a rebuild, because a vertex
 * carries all three numbers a picture can ask for -- the ground in metres, the
 * field before sea level was taken off it, and whichever control layer is being
 * shown. Choosing one is a uniform, so it costs a frame.
 *
 * The light is a fixed direction rather than the world's sun. This is a bench
 * for choosing numbers, and a bench with a moving light is one where the same
 * setting looks different at different times of day.
 *
 * **Every colour in it is the engine's own**, written in from the block
 * registry and the sea rather than typed out here. A preview whose green is a
 * near-miss of the world's green is a preview that answers a slightly different
 * question than the one asked of it, and two lists of colours drift apart the
 * first time either is retuned.
 */
export const PATCH_SHADER = /* wgsl */ `
/** The world's own materials, and its water. */
const SAND = ${wgsl(BLOCK_COLORS[BlockType.SAND]!)};
const GRASS = ${wgsl(BLOCK_COLORS[BlockType.GRASS]!)};
const DIRT = ${wgsl(BLOCK_COLORS[BlockType.DIRT]!)};
const STONE = ${wgsl(BLOCK_COLORS[BlockType.STONE]!)};
const SNOW = ${wgsl(BLOCK_COLORS[BlockType.SNOW]!)};
const SEA_SHALLOW = ${wgsl(SEA_COLORS.shallow)};
const SEA_DEEP = ${wgsl(SEA_COLORS.deep)};

/**
 * Every block's own colour, indexed by the number the registry gave it.
 *
 * A private var rather than a const, because a face carries its block as a
 * number worked out while drawing and a const array can only be read at an
 * index the compiler already knows.
 */
var<private> BLOCK_TINTS : array<vec3f, ${BLOCK_NAMES.length}> = ${blockTints()};

/** How many entries that table holds, so a stray index cannot leave it. */
const BLOCK_KINDS : u32 = ${BLOCK_NAMES.length}u;

/** How many steps a picture of one layer's noise is cut into. */
const PICTURE_BANDS = 9.0;

/** Metres of water a look passes through before it is all water. */
const SEA_CLARITY = ${SEA_CLARITY}.0;

/**
 * How much of the light comes from the sun rather than from the sky.
 *
 * The world's own balance, so a patch of ground here is lit the way the same
 * ground is lit there. What is left of the difference between the two pictures
 * is the sun's height, which is the time of day and not a property of either.
 */
const SUN_SHARE = ${SUN_SHARE};

struct View {
	viewProj : mat4x4f,
	sun      : vec4f,
	/**
	 * x: which picture. y: lines rather than surface. z: which control layer.
	 * w: the sea rather than the ground.
	 */
	mode     : vec4f,
	/** The two material lines in metres, and the field's own range here. */
	lines    : vec4f,
	/**
	 * The ground's own range in metres here, and how bright the picture is.
	 *
	 * z is the exposure. **A preview cannot be brighter than what it is made
	 * of**: grass is 0.44 of green and a cap of it lit perfectly still comes
	 * out at 176 of 255, so no arrangement of lights makes this picture
	 * bright. One multiplier before the curve does, and it is a knob because
	 * how bright is right is a matter of the screen it is read on.
	 */
	ground   : vec4f,
	/**
	 * Where each light recorded the patch from: near cascade, then far, for the
	 * key and then the fill.
	 */
	maps     : array<mat4x4f, 4>,
	/**
	 * x: the key's shadow is on. y: the fill's is on. z: one texel of the map.
	 * w: how far a sample is pushed toward the light before it is compared.
	 */
	shadow   : vec4f,
	/**
	 * How much of the light each of the three carries: key, fill, overhead.
	 *
	 * **How dark a shadow can be is this and nothing else.** A shadow takes one
	 * light away, so the deepest it can ever go is that light's share of the
	 * total -- with the overhead light at 1.35 against the key's 1, the key is
	 * a fifth of a lit face and no shadow of it can take more than a fifth.
	 * So a shadow that reads too faint is as often a key carrying too
	 * little as a shadow strength set too low.
	 */
	shares   : vec4f,
	/**
	 * x: how much of its light a shadow takes, and never a darkness in metres.
	 *
	 * Past 1 it extrapolates, so a shadow eats into the other lights as well
	 * -- which is the only way a rig with a weak key draws one worth looking
	 * at. How far a sample is pushed and what a texel is worth are per map and
	 * live on fit, because the cascades do not agree about either.
	 */
	shadowing : vec4f,
	/** Per map: what a texel is worth on the ground, and its own depth bias. */
	fit      : array<vec4f, 4>,
	/**
	 * x: how deep the soil runs, in metres. y: one block, in metres.
	 * z: how far the depth fade runs, in metres. w: how dark it gets.
	 *
	 * **What ground is made of is a depth question as well as an elevation
	 * one**, and the first two are the lengths that question is asked
	 * against: how far down the soil reaches, and how thick the one layer of
	 * it that is grass or snow is. At zero every point is its own surface and
	 * the bands come out as they did before either existed, which is what a
	 * patch drawn from the map alone wants.
	 */
	crust    : vec4f,
};
@group(0) @binding(0) var<uniform> view : View;

/**
 * What each light recorded, and the sampler that compares against it.
 *
 * **Nine comparisons, not nine depths.** A comparison sampler filters the
 * answers -- is this point behind the surface the light saw -- and filtering
 * the depths instead averages two surfaces and puts a shadow halfway up a wall.
 */
@group(1) @binding(0) var keyNear  : texture_depth_2d;
@group(1) @binding(1) var keyFar   : texture_depth_2d;
@group(1) @binding(2) var fillNear : texture_depth_2d;
@group(1) @binding(3) var fillFar  : texture_depth_2d;
@group(1) @binding(4) var depthCompare : sampler_comparison;

/**
 * How much of one light reaches a point.
 *
 * The map is recorded along the light, so a point behind the nearest surface it
 * saw is in shadow. Nine taps a texel apart soften the edge, which is what
 * keeps a 2,048-texel map from drawing a staircase along every shadow it casts.
 *
 * **Outside the map is lit, not shadowed.** The box is fitted to the mesh, so
 * anything outside it is something the light never had a chance to record --
 * and a clamped read at the rim would smear the edge column across everything
 * beyond it.
 */
fn sampled(
	depth : texture_depth_2d,
	slot : i32,
	world : vec3f,
	normal : vec3f,
	facing : f32,
) -> f32 {
	// **Pushed out along its own normal, not along the light.** A depth bias
	// moves the sample toward the light, which takes the same distance off
	// every shadow -- and on terracing whose steps cast a metre or two that was
	// the whole shadow. Along the normal it leaves its own surface without
	// moving down the light at all, so a short shadow keeps its length. 1.7
	// texels of the map this slot holds, the same lift the world's own
	// cascades use: at half a texel the surface still read its own depth at
	// even odds, which rendered as a checkerboard over every wall.
	let out = world + normal * view.fit[slot].x * 1.7;
	let clip = view.maps[slot] * vec4f(out, 1.0);
	let ndc = clip.xyz / clip.w;
	if (ndc.z < 0.0 || ndc.z > 1.0) {
		return -1.0;
	}
	let uv = vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
	// **Inside by a texel, not merely inside.** The blur reads a ring around
	// the point, and at the very edge some of that ring is off the map -- which
	// draws the rim column across everything just beyond it.
	let edge = view.shadow.z;
	if (uv.x < edge || uv.x > 1.0 - edge || uv.y < edge || uv.y > 1.0 - edge) {
		return -1.0;
	}
	// What is left for the depth the offset cannot reach, eased off as a face
	// turns edge-on to the light where one texel covers the most depth.
	let at = ndc.z - view.fit[slot].y * (1.0 + 2.0 * (1.0 - facing));
	var sum = 0.0;
	for (var y = -1; y <= 1; y++) {
		for (var x = -1; x <= 1; x++) {
			let tap = uv + vec2f(f32(x), f32(y)) * view.shadow.z;
			sum = sum + textureSampleCompareLevel(depth, depthCompare, tap, at);
		}
	}
	return sum / 9.0;
}

/**
 * How much of one light reaches a point, from the tightest map that holds it.
 *
 * **The near cascade first.** It is sized from how far off the camera is, so it
 * tightens as the viewer zooms and its texels follow what is being looked at;
 * the far one covers the whole patch and catches whatever falls outside. A
 * point in neither is lit, because a light that never recorded it has said
 * nothing about it.
 *
 * **A face turned away from the light needs no map to be dark**, and asking
 * anyway is what makes the far side of every column stripe: it is exactly the
 * surface that recorded the depth it would be compared with.
 */
fn reaches(
	nearDepth : texture_depth_2d,
	farDepth : texture_depth_2d,
	slot : i32,
	world : vec3f,
	normal : vec3f,
	facing : f32,
) -> f32 {
	if (facing <= 0.0) {
		return 1.0;
	}
	var open = sampled(nearDepth, slot, world, normal, facing);
	if (open < 0.0) {
		open = sampled(farDepth, slot + 1, world, normal, facing);
	}
	if (open < 0.0) {
		return 1.0;
	}
	return open;
}

struct VertexOut {
	@builtin(position) clip   : vec4f,
	@location(0)       normal : vec3f,
	@location(1)       metres : f32,
	@location(2)       raw    : f32,
	@location(3)       layer  : f32,
	/**
	 * The height of the surface itself, which is not the metres above it.
	 *
	 * **A cell's numbers are flat across it and its surface is not.** Every
	 * vertex of a hexagon carries that cell's own height, because the material
	 * bands are per cell in the world too -- so metres does not change across a
	 * cell and nothing can be measured off how fast it changes. The y of the
	 * position is the surface: corners stand at the blend of the three cells
	 * meeting there, so it runs smoothly from one cell into the next.
	 */
	@location(4)       height : f32,


	/**
	 * The cell's own speckle.
	 *
	 * **The one thing that says where one hexagon ends.** A slope of one
	 * material at one height is a single sheet of colour however it is lit, and
	 * the lattice the world is built on is invisible in it -- which is the
	 * hardest thing to read on a preview whose whole subject is that lattice.
	 */
	@location(5)       shade  : f32,

	/** Where this fragment is, which is what a shadow map is read at. */
	@location(6)       world  : vec3f,

	/**
	 * Which palette entry the face is drawn from, zero for the ground itself.
	 *
	 * Flat, because it names a material rather than measuring one: interpolated
	 * across a triangle it would read as a fraction of a palette entry
	 * somewhere in the middle of every face.
	 */
	@location(7) @interpolate(flat) material : u32,

	/**
	 * How far under its own column's surface this point sits, in metres.
	 *
	 * **What ground is made of is a depth question and an elevation question,
	 * and this is the half a height field never had to ask.** A patch drawn
	 * from the map alone is all surface, so it leaves this at zero and every
	 * band comes out the way it always did; a patch drawn as columns of blocks
	 * has a whole crust under it, and painted by elevation alone the floor of
	 * a cave is the colour of the meadow forty blocks over it.
	 */
	@location(8)       depth  : f32,
};

@vertex
fn vertexMain(
	@location(0) position : vec3f,
	@location(1) normal   : vec3f,
	@location(2) metres   : f32,
	@location(3) raw      : f32,
	@location(4) continent : f32,
	@location(5) erosion   : f32,
	@location(6) peaks     : f32,
	@location(7) carve     : f32,
	@location(8) shade     : f32,
	@location(9) material  : f32,
	@location(10) depth    : f32,
) -> VertexOut {
	var out : VertexOut;
	out.clip = view.viewProj * vec4f(position, 1.0);
	out.normal = normal;
	out.shade = shade;
	out.material = u32(material + 0.5);
	out.world = position;
	out.height = position.y;
	out.metres = metres;
	out.depth = depth;
	out.raw = raw;
	// **Every layer is on the vertex and the uniform picks one**, so choosing a
	// picture of one of them costs a frame rather than a rebuilt mesh. Three
	// now, because the surface is three layers and a layer with no channel is
	// a layer whose curve cannot be looked at.
	out.layer = select(
		select(
			select(continent, erosion, view.mode.z > 0.5),
			peaks,
			view.mode.z > 1.5,
		),
		carve,
		view.mode.z > 2.5,
	);
	return out;
}

/**
 * A ring every hundred metres, on the same grid the two material lines sit on.
 *
 * **Shading says which way a hillside faces and never says how far it fell.**
 * A contour is the only thing on the picture a height can be read off, and it
 * is what turns an even green slope into a shape.
 *
 * **The line is a width on the screen, not a band of metres.** Three metres of
 * elevation is half a cell on a steep face and a whole hillside on a gentle
 * one, so a band stated in metres draws hairlines across the mountains and
 * blotches across the plain -- which is a picture of nothing. The change in
 * height across one pixel says how wide a pixel is in metres of climb, so
 * dividing by it gives a line one pixel wide wherever it lands, and no line at
 * all where the ground is too flat for one to mean anything.
 */
fn contoured(tint : vec3f, height : f32) -> vec3f {
	let rings = height / 100.0;
	let across = fwidth(rings);
	if (across <= 0.0) {
		return tint;
	}
	let to = abs(fract(rings - 0.5) - 0.5) / across;
	return tint * mix(0.5, 1.0, clamp(to - 1.2, 0.0, 1.0));
}

/**
 * How much light reaches a face: a sun with a direction, and a sky without one.
 *
 * **A flat term for the sky is why a preview reads flat.** The old rule was one
 * ambient number plus a dot product against the sun, so every face that turned
 * away from the sun bottomed out at the same brightness whichever way it
 * turned, and a landscape whose slopes are mostly gentle came out as one shade
 * of green. This is the world's own two-term model (doc 16): the **sun** is one
 * dot product against the face, and the **sky** is how much of it the face can
 * see -- all of it looking up, and only what the ground throws back looking
 * down. Both terms move with the normal, so a slope is lit differently from the
 * ground beside it in shade as well as in sun.
 *
 * Up is +y: a patch is laid out in its own flat frame, east and north across
 * and metres of ground up.
 *
 * The sun's share is what is passed in and the sky takes the rest, so the two
 * sum to 1 and flat ground reads the same whatever the balance -- only what
 * stands at an angle moves. A picture of a number rather than of a place takes
 * less of it: the light is there to show the shape, not to be read off.
 */
fn lightOn(normal : vec3f, world : vec3f, direct : f32) -> f32 {
	let n = normalize(normal);
	let key = normalize(view.sun.xyz);
	// **A key light alone leaves half the shape unreadable.** Every face turned
	// away from it falls back on the sky term, which depends only on how far up
	// the face points -- so two walls facing opposite ways would read the same.
	// The fill separates those; the one overhead separates a cap from a wall.
	//
	// The fill, mirrored across the patch and levelled off; see
	// PATCH_LIGHTS.ts for why it stays above the horizon.
	let fill = normalize(vec3f(${patchFill().join(", ")}));
	let top = vec3f(0.0, 1.0, 0.0);
	// **Each light is shadowed by its own map and by nothing else.** The one
	// overhead has none: it is what keeps every cap readable, and a cap it
	// could not reach is a cap nothing says anything about.
	let toKey = max(0.0, dot(n, key));
	let toFill = max(0.0, dot(n, fill));
	let keyOpen = select(
		1.0,
		reaches(keyNear, keyFar, 0, world, n, toKey),
		view.shadow.x > 0.5,
	);
	let fillOpen = select(
		1.0,
		reaches(fillNear, fillFar, 2, world, n, toFill),
		view.shadow.y > 0.5,
	);
	// **Strength up to 1 is physical: it says how much of its own light a
	// shadow takes.** The shares are normalized below, so even a full shadow
	// of the key only removes the key's fraction of the total -- on a rig
	// balanced for a readable preview that is about a third, which is why a
	// physical shadow here is faint however the maps are tuned.
	let hold = min(view.shadowing.x, 1.0);
	let keyShade = 1.0 - hold * (1.0 - keyOpen);
	let fillShade = 1.0 - hold * (1.0 - fillOpen);
	var lit =
		view.shares.x * toKey * keyShade +
		view.shares.y * toFill * fillShade +
		view.shares.z * max(0.0, dot(n, top));
	// **Past 1 the shadow stops being a light being blocked and becomes a
	// picture of the shape**: the same shadow scales the whole direct sum,
	// overhead light included, so at the top of the knob a shadowed face
	// keeps only the sky's share. Driven by the darker of the two maps,
	// because two lights agreeing something is behind cover is not twice the
	// cover.
	let spill = max(0.0, view.shadowing.x - 1.0);
	let cover = min(keyOpen, fillOpen);
	lit = lit * max(0.0, 1.0 - spill * (1.0 - cover));
	let openness = mix(0.42, 1.0, 0.5 + 0.5 * n.y);
	// Every light turned off leaves the sky term, which is the one thing here
	// with no direction -- flat, and never a divide by nothing.
	let total = max(1e-4, view.shares.x + view.shares.y + view.shares.z);
	return direct * (lit / total) + (1.0 - direct) * openness;
}

/** A tint, lit by the fixed light and given the curve a screen expects. */
fn shade(tint : vec3f, normal : vec3f, world : vec3f, direct : f32) -> vec4f {
	let lit = min(tint * lightOn(normal, world, direct) * view.ground.z, vec3f(1.0));
	return vec4f(pow(lit, vec3f(1.0 / 2.2)), 1.0);
}

@fragment
fn fragmentMain(in : VertexOut) -> @location(0) vec4f {
	if (view.shadow.w > 0.5) {
		let dn = normalize(in.normal);
		let dk = normalize(view.sun.xyz);
		let df = max(0.0, dot(dn, dk));
		return vec4f(vec3f(reaches(keyNear, keyFar, 0, in.world, dn, df)), 1.0);
	}
	// **The lights themselves, drawn where they shine from.** Each marker
	// carries its own colour on the layer channel and takes no light at all --
	// a lamp lit by the rig it is a picture of would be a picture of something
	// else. A little shading across it so it reads as a ball rather than a
	// disc, and that is the whole of it.
	if (view.mode.y > 1.5) {
		let round = 0.55 + 0.45 * clamp(normalize(in.normal).y, -1.0, 1.0);
		return vec4f(
			pow(vec3f(in.raw, in.layer, in.metres) * round, vec3f(1.0 / 2.2)),
			1.0,
		);
	}
	if (view.mode.y > 0.5) {
		return vec4f(0.42, 0.82, 1.0, 1.0);
	}
	let picture = i32(view.mode.x);

	// **What stands on the ground keeps its own color in every picture.** The
	// pictures are of the ground -- how high it is, what one layer's field
	// reads there -- and a plant is not that ground; drawn in a picture's own
	// ramp a canopy reads as a hillside at whatever height its leaves happened
	// to reach. The shade it carries is its layer's own grain and a leaf's
	// darkening, both baked by the mesher.
	//
	// **Chosen rather than branched on**, and that is a requirement rather
	// than a preference: which material a face is differs between two
	// fragments of one quad, so returning early on it leaves the rest of this
	// function in non-uniform control flow -- and the contour below reads how
	// fast the height changes across a pixel, which is only defined where the
	// whole quad is running. A shader that will not compile draws a black
	// window rather than an error.
	// **A material rather than a height.** A hillside's colour follows from how
	// high it stands, which is worked out below; a plant's does not follow from
	// anything on the face, so the face carries the block and this reads what
	// that block looks like.
	let plantTint = BLOCK_TINTS[min(in.material, BLOCK_KINDS - 1u)] * in.shade;
	let isPlant = in.material > 0u;

	// **The sea is a sheet over the ground and carries the ground's own
	// height**, so how much water a look passes through is on the vertex: it
	// decides which of the two colours the water is, and how much of the floor
	// gets back out through it. In a picture of a number the water is left out
	// entirely -- the question there is what the field says, and a blue sheet
	// over the answer hides it.
	if (view.mode.w > 0.5) {
		if (picture != 0) {
			discard;
		}
		let through = 1.0 - exp(in.metres / SEA_CLARITY);
		let water = mix(SEA_SHALLOW, SEA_DEEP, through);
		let lit = pow(
			min(
				water * lightOn(in.normal, in.world, SUN_SHARE) * view.ground.z,
				vec3f(1.0),
			),
			vec3f(1.0 / 2.2),
		);
		return vec4f(lit, mix(0.42, 0.94, through));
	}

	// The grey pictures answer a different question from the bands: they read
	// elevation everywhere rather than saying which of the four blocks stands
	// there, and Raw stops before sea level has been taken off the field.
	if (picture == 1) {
		let t = clamp(
			(in.metres - view.ground.x) /
				max(1.0, view.ground.y - view.ground.x),
			0.0,
			1.0,
		);
		return shade(
			select(mix(vec3f(0.03, 0.03, 0.04), vec3f(1.0), t), plantTint, isPlant),
			in.normal,
			in.world,
			0.4,
		);
	}
	if (picture == 2) {
		let t = clamp(
			(in.raw - view.lines.z) / max(1e-6, view.lines.w - view.lines.z),
			0.0,
			1.0,
		);
		return shade(
			select(
				mix(vec3f(0.02, 0.04, 0.10), vec3f(1.0, 0.98, 0.90), t),
				plantTint,
				isPlant,
			),
			in.normal,
			in.world,
			0.35,
		);
	}
	if (picture == 3) {
		// **One layer's own noise, cut into steps.** A smooth ramp says where a
		// field is high and never says how fast; the steps are contours, and
		// how wide they are is how steeply one shape runs into the next. The
		// same nine steps and the same dark edge the flat pictures use.
		let t = clamp((in.layer + 1.0) * 0.5, 0.0, 0.9999);
		let step = floor(t * PICTURE_BANDS);
		let grey = 0.06 + (step / (PICTURE_BANDS - 1.0)) * 0.92;
		let into = t * PICTURE_BANDS - step;
		let edge = select(1.0, 0.45, into < 0.06);
		return shade(
			select(vec3f(grey * edge), plantTint, isPlant),
			in.normal,
			in.world,
			0.3,
		);
	}

	// **The world's own rule, which reads two numbers and not one.** Soil
	// covers rock to a fixed depth and stone is what is under it; the top layer
	// of that soil is grass, or snow above the snow line, and above the rock
	// line the soil is gone through its whole depth so the stone shows where
	// the ground is cut into as well as where it is walked on.
	//
	let soil = view.crust.x;
	let surface = in.depth <= max(1e-6, view.crust.y);
	var tint : vec3f;
	if (in.depth > soil) {
		tint = STONE;
	} else if (in.metres <= 0.0) {
		// **Bare sand under the water, and the water itself is geometry.** The
		// ocean is a surface at one radius and holds no blocks, so the floor is
		// bare; the sheet drawn over it is what tints it, and tinting the floor
		// here as well would put two depths of water on one pixel. Sand runs
		// through the whole soil band, the way the world writes it.
		tint = SAND;
	} else if (surface && in.metres > view.lines.y) {
		tint = SNOW;
	} else if (in.metres > view.lines.x) {
		tint = STONE;
	} else if (!surface) {
		tint = DIRT;
	} else {
		tint = GRASS;
	}
	// **The sky this mesh cannot see, drawn in as a fade.** The corner shading
	// on the vertex says what stands beside a face; nothing on it says what is
	// over one, so a chamber deep in the crust would be lit exactly like the
	// meadow on top of it. Legibility furniture of the same kind as the cell
	// rims, and off at zero to the bit.
	let under = clamp(in.depth / max(1e-6, view.crust.z), 0.0, 1.0);
	let deep = 1.0 - under * view.crust.w;
	// **Only the picture of the ground takes either.** The rest are pictures
	// of a number, and a speckle or a fade there is noise drawn over the
	// answer.
	return shade(
		select(
			contoured(tint * in.shade * deep, in.height),
			plantTint,
			isPlant,
		),
		in.normal,
		in.world,
		SUN_SHARE,
	);
}
`;
