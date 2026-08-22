import { BLOCK_COLORS } from "../../generation/terrain/blockColor.js";
import { BlockType } from "../../generation/terrain/BlockType.js";
import { SEA_CLARITY, SEA_COLORS } from "../sea/SEA_COLORS.js";

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

/** Metres of water a look passes through before it is all water. */
const SEA_CLARITY = ${SEA_CLARITY}.0;

struct View {
	viewProj : mat4x4f,
	sun      : vec4f,
	/** x: which picture. y: lines rather than surface. z: which control layer. */
	mode     : vec4f,
	/** The two material lines in metres, and the field's own range here. */
	lines    : vec4f,
	/** The ground's own range in metres here, which Height is drawn against. */
	ground   : vec4f,
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
};

@vertex
fn vertexMain(
	@location(0) position : vec3f,
	@location(1) normal   : vec3f,
	@location(2) metres   : f32,
	@location(3) raw      : f32,
	@location(4) terrain  : f32,
	@location(5) mountain : f32,
) -> VertexOut {
	var out : VertexOut;
	out.clip = view.viewProj * vec4f(position, 1.0);
	out.normal = normal;
	out.height = position.y;
	out.metres = metres;
	out.raw = raw;
	// Both layers are on the vertex and the uniform picks one, so choosing a
	// picture of one of them costs a frame rather than a rebuilt mesh.
	out.layer = select(terrain, mountain, view.mode.z > 0.5);
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
fn lightOn(normal : vec3f, direct : f32) -> f32 {
	let n = normalize(normal);
	let lambert = max(0.0, dot(n, normalize(view.sun.xyz)));
	let openness = mix(0.42, 1.0, 0.5 + 0.5 * n.y);
	return direct * lambert + (1.0 - direct) * openness;
}

/** A tint, lit by the fixed light and given the curve a screen expects. */
fn shade(tint : vec3f, normal : vec3f, direct : f32) -> vec4f {
	return vec4f(pow(tint * lightOn(normal, direct), vec3f(1.0 / 2.2)), 1.0);
}

@fragment
fn fragmentMain(in : VertexOut) -> @location(0) vec4f {
	if (view.mode.y > 0.5) {
		return vec4f(0.42, 0.82, 1.0, 1.0);
	}
	let picture = i32(view.mode.x);

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
		return shade(mix(vec3f(0.03, 0.03, 0.04), vec3f(1.0), t), in.normal, 0.4);
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
			0.35,
		);
	}
	if (picture == 3) {
		// One control layer on its own, over its own full range: dark where it
		// says nothing, bright where it says most.
		return shade(
			mix(vec3f(0.04, 0.05, 0.09), vec3f(0.6, 0.85, 1.0), clamp(in.layer, 0.0, 1.0)),
			in.normal,
			0.3,
		);
	}

	var tint : vec3f;
	if (in.metres <= 0.0) {
		// **Bare sand seen through the sea's own two colours.** The ocean is a
		// surface at one radius and holds no blocks, so the floor is bare; how
		// much water a look passes through decides both how far that floor
		// shows and which of the two colours it is seen against. A shore is
		// sand under a tint and open water never gets back out.
		let through = 1.0 - exp(in.metres / SEA_CLARITY);
		tint = mix(SAND, mix(SEA_SHALLOW, SEA_DEEP, through), through);
	} else if (in.metres < view.lines.x) {
		tint = GRASS;
	} else if (in.metres < view.lines.y) {
		tint = STONE;
	} else {
		tint = SNOW;
	}
	return shade(contoured(tint, in.height), in.normal, 0.62);
}
`;
