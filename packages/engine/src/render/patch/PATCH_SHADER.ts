import { BLOCK_COLORS } from "../../generation/terrain/blockColor.js";
import { BlockType } from "../../generation/terrain/BlockType.js";
import { SEA_CLARITY, SEA_COLORS } from "../sea/SEA_COLORS.js";
import { SUN_SHARE } from "../../light/SUN_SHARE.js";

/** One linear colour as the constant a shader takes. */
function wgsl(color: readonly [number, number, number]): string {
	return `vec3f(${color[0]}, ${color[1]}, ${color[2]})`;
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
const STONE = ${wgsl(BLOCK_COLORS[BlockType.STONE]!)};
const SNOW = ${wgsl(BLOCK_COLORS[BlockType.SNOW]!)};
const SEA_SHALLOW = ${wgsl(SEA_COLORS.shallow)};
const SEA_DEEP = ${wgsl(SEA_COLORS.deep)};

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

/**
 * How strong the fill and the top light are against the key.
 *
 * Both well under it: a preview with three equal lights has no direction in it
 * at all, and a hillside reads by which way it faces rather than by how bright
 * it is.
 */
const KEY_FILL = 0.35;
const KEY_TOP = 0.30;

/**
 * How strong the light standing at the camera is.
 *
 * **The one light that cannot leave a face unreadable.** Whatever is turned
 * toward the viewer is turned toward it, so nothing being looked at is ever lit
 * only by the sky term -- which is what made a patch seen from the wrong side a
 * flat silhouette. It carries no distance falloff: over a patch a kilometre
 * across an inverse square puts the near rim at many times the far one, and the
 * far half goes black again.
 */
const KEY_HEAD = 0.55;

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
	/** The ground's own range in metres here, which Height is drawn against. */
	ground   : vec4f,
	/** Where the camera is, in the patch's own frame. */
	eye      : vec4f,
};
@group(0) @binding(0) var<uniform> view : View;

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

	/** Where this fragment is, so a light standing at the camera has a direction. */
	@location(5)       world  : vec3f,
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
) -> VertexOut {
	var out : VertexOut;
	out.clip = view.viewProj * vec4f(position, 1.0);
	out.normal = normal;
	out.world = position;
	out.height = position.y;
	out.metres = metres;
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
	// A light standing where the viewer is, so turning the patch lights what
	// turning it brought into view.
	let head = normalize(view.eye.xyz - world);
	// **A key light alone leaves half the shape unreadable.** Every face turned
	// away from it falls back on the sky term, which depends only on how far up
	// the face points -- so two walls facing opposite ways read the same, and a
	// patch lit from behind is a silhouette with a lit rim. Two more come in
	// with it, both weaker than the key so the sense of one direction survives:
	// a **fill** from straight opposite, which separates the faces the key
	// never reaches, and a **top** light, which is what tells a cap from a wall
	// where neither is facing either of the other two.
	let fill = normalize(vec3f(-key.x, key.y * 0.35, -key.z));
	let top = vec3f(0.0, 1.0, 0.0);
	let lit =
		max(0.0, dot(n, key)) +
		KEY_FILL * max(0.0, dot(n, fill)) +
		KEY_TOP * max(0.0, dot(n, top)) +
		KEY_HEAD * max(0.0, dot(n, head));
	let openness = mix(0.42, 1.0, 0.5 + 0.5 * n.y);
	let total = 1.0 + KEY_FILL + KEY_TOP + KEY_HEAD;
	return direct * (lit / total) + (1.0 - direct) * openness;
}

/** A tint, lit by the fixed light and given the curve a screen expects. */
fn shade(tint : vec3f, normal : vec3f, world : vec3f, direct : f32) -> vec4f {
	return vec4f(pow(tint * lightOn(normal, world, direct), vec3f(1.0 / 2.2)), 1.0);
}

@fragment
fn fragmentMain(in : VertexOut) -> @location(0) vec4f {
	if (view.mode.y > 0.5) {
		return vec4f(0.42, 0.82, 1.0, 1.0);
	}
	let picture = i32(view.mode.x);

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
			water * lightOn(in.normal, in.world, SUN_SHARE),
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
		return shade(mix(vec3f(0.03, 0.03, 0.04), vec3f(1.0), t), in.normal, in.world, 0.4);
	}
	if (picture == 2) {
		let t = clamp(
			(in.raw - view.lines.z) / max(1e-6, view.lines.w - view.lines.z),
			0.0,
			1.0,
		);
		return shade(
			mix(vec3f(0.02, 0.04, 0.10), vec3f(1.0, 0.98, 0.90), t),
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
		return shade(vec3f(grey * edge), in.normal, in.world, 0.3);
	}

	var tint : vec3f;
	if (in.metres <= 0.0) {
		// **Bare sand under the water, and the water itself is geometry.** The
		// ocean is a surface at one radius and holds no blocks, so the floor is
		// bare; the sheet drawn over it is what tints it, and tinting the floor
		// here as well would put two depths of water on one pixel.
		tint = SAND;
	} else if (in.metres < view.lines.x) {
		tint = GRASS;
	} else if (in.metres < view.lines.y) {
		tint = STONE;
	} else {
		tint = SNOW;
	}
	return shade(contoured(tint, in.height), in.normal, in.world, SUN_SHARE);
}
`;
