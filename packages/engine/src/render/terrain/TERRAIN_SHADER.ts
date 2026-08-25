import { SHADOW_WGSL } from "../light/SHADOW_WGSL.js";
import { SUN_SHARE } from "../../light/SUN_SHARE.js";

/**
 * The terrain shader: a sun, a sky, and water fog.
 *
 * Vertex positions arrive relative to their own chunk's origin, which is what
 * keeps them inside the part of `float32` that resolves 122 micrometres. The
 * origin is added here, in `float32` as well, because the camera is subtracted
 * from it in the same instruction: the view matrix already has the eye position
 * folded in, so the sum never has to represent a point far from the viewer.
 *
 * Color carries the block, how much sky its column stands under, and how
 * boxed-in its corner is, all baked by the mesher. **Which way a face points is
 * not baked**: it is read here, from how the position changes across one pixel.
 *
 * `fog.w` is the distance the view fades over. Above water it is set far past
 * the horizon, which leaves the same expression doing nothing.
 *
 * `night.x` is how far the sun is over this place's horizon and `night.y` is
 * what is left of the light when it is not. `sky.rgb` is what the sky is
 * doing, which is the color of everything the sun does not reach directly.
 * \`moon.xyz\` points at the moon and \`moon.w\` is what it is worth.
 */
export const TERRAIN_SHADER = /* wgsl */ `
${SHADOW_WGSL}

/**
 * How much of the light comes from the sun rather than from the sky.
 *
 * The world's own balance, fixed rather than a knob: no source this engine
 * was built against exposes one either, and the two share nothing to tune it
 * against beyond "does it look right," which a fixed number already does.
 */
const SUN_SHARE = ${SUN_SHARE};

/**
 * Where a step stops being legible, in metres of world across one pixel.
 *
 * At the shipped 1 m block, \`0.35\` is about three pixels to a step -- still
 * plainly a staircase, and left alone. \`2.5\` is two and a half steps inside
 * one pixel, where nothing of the terracing survives sampling and all that is
 * left is the interference between its spacing and the pixel grid.
 *
 * It never turns the whole way to the column's up: a hillside that reads as
 * completely smooth is a different lie from a hillside that strobes, and the
 * shape of the ground is still worth seeing at distance.
 */
const BLUR_FROM = 0.35;
const BLUR_TO = 2.5;
const BLUR_MOST = 0.85;

struct Frame {
	viewProj : mat4x4f,
	eye      : vec4f,
	sun      : vec4f,
	fog      : vec4f,
	night    : vec4f,
	sky      : vec4f,
	moon     : vec4f,
};
struct Chunk {
	origin : vec4f,
};
@group(0) @binding(0) var<uniform> frame : Frame;
@group(1) @binding(0) var<uniform> chunk : Chunk;
struct VertexOut {
	@builtin(position) clip  : vec4f,
	@location(0)       color : vec3f,
	@location(1)       local : vec3f,
	@location(2)       up    : vec3f,
	@location(3)       depth : f32,
};

@vertex
fn vertexMain(
	@location(0) position : vec3f,
	@location(1) color    : vec3f,
) -> VertexOut {
	let world = position + chunk.origin.xyz;
	var out : VertexOut;
	out.clip = frame.viewProj * vec4f(world, 1.0);
	out.color = color;
	// The chunk-relative position, not the world one, and the difference is
	// the whole reason a normal can be read off it. A world position on this
	// planet is a number near 6,800, where \`float32\` steps by a millimetre,
	// and the change across one pixel of a surface underfoot is a few
	// millimetres -- so the difference between two of them is two or three
	// representable steps and the normal it gives is noise. Chunk-relative
	// keeps the magnitude under a few hundred, where the step is 60
	// micrometres, and the difference is exact enough to normalise.
	out.local = position;
	out.up = normalize(world);
	out.depth = length(world - frame.eye.xyz);
	return out;
}

/**
 * Which way this face points, from how its position moves across one pixel.
 *
 * Two neighbouring pixels of a flat triangle differ by a step along that
 * triangle's plane, so the cross product of the two steps is the plane's
 * normal, exactly. Every face in this world is flat -- a cell's cap and the
 * wall between two cells are both planar polygons -- so there is nothing a
 * stored normal would say that this does not, and a stored one would cost
 * three floats a vertex and a change to what the mesher writes.
 *
 * The sign comes from the viewer rather than from the winding. Back faces are
 * culled, so a face that is drawn at all is one the camera is looking at the
 * front of, and turning the normal to face the eye is right for a cap, a wall
 * and a floor alike.
 */
fn faceNormal(local : vec3f, toEye : vec3f) -> vec3f {
	let n = normalize(cross(dpdx(local), dpdy(local)));
	return select(-n, n, dot(n, toEye) > 0.0);
}

/**
 * How much of a step the eye can still tell apart, from one block to none.
 *
 * A voxel hillside is a staircase, and at a low sun the flat top of a step
 * takes \`sin(elevation)\` of the direct light while the riser beside it takes
 * \`cos(elevation)\` -- at an 8 degree sun that is a factor of **seven**
 * between two surfaces a metre apart. Near the eye that reads as terracing,
 * which is what the world is. Far off, where a whole step lands inside one
 * pixel, it beats against the pixel grid and draws moire rings across a
 * hillside instead.
 *
 * **The measure is metres of world per pixel, not distance.** A step is
 * unresolvable when the pixel covering it is wider than the step is tall, and
 * that depends on the resolution and the field of view as much as on how far
 * away the ground is -- so it is read off the derivative rather than guessed
 * from a range in metres. Taken on the **chunk-relative** position, because a
 * world position here is a number near 6,800 where \`float32\` steps by about a
 * millimetre and the change across one pixel is a few of those.
 *
 * What it returns is how far to turn the face's own normal toward the
 * column's up: 0 while the steps are legible, rising as they stop being.
 */
fn stepBlur(local : vec3f) -> f32 {
	let perPixel = length(fwidth(local));
	return smoothstep(BLUR_FROM, BLUR_TO, perPixel) * BLUR_MOST;
}

/**
 * What moonlight is, which is sunlight seen twice and cold.
 *
 * A colder white than the sun's, because the eye reads a dim light as blue.
 */
const MOON_COLOR = vec3f(0.62, 0.72, 1.0);

/**
 * The color of direct sunlight, which reddens as the sun goes down.
 *
 * A low sun is seen through more air, and air scatters blue out of it first.
 * The height is measured against the place's own up, so the color turns as a
 * player walks around the planet as well as as the day runs.
 */
fn sunColor(up : vec3f) -> vec3f {
	let height = clamp(dot(up, frame.sun.xyz), 0.0, 1.0);
	return mix(
		vec3f(1.0, 0.52, 0.26),
		vec3f(1.0, 0.98, 0.94),
		smoothstep(0.0, 0.30, height)
	);
}

/**
 * How much light reaches a face, as a color rather than a number.
 *
 * Two terms. **The sun** is one dot product against the face's own normal --
 * which is what makes a slope facing the morning sun bright and the slope
 * behind it dark, and what a normal read from the position rather than from
 * the planet's centre buys. It is switched off by \`day\` when the sun is under
 * this place's horizon.
 *
 * **The sky** is the light with no single direction: a face looking straight
 * up sees all of it, one looking sideways sees half, and one looking down sees
 * only what the ground throws back. That is a dot product against the place's
 * own up, and it is what stops a shaded wall being black. It carries the sky's
 * own color, so shade is blue under a blue sky and orange under a burning one.
 *
 * \`ambient\` and \`direct\` are what the two are worth to a surface facing
 * straight at them, and they sum to 1 so flat ground at noon is unchanged.
 */
fn lightOn(
	normal : vec3f,
	up : vec3f,
	world : vec3f,
	away : f32,
	ambient : f32,
	direct : f32,
) -> vec3f {
	let day = frame.night.x;
	var lambert = max(dot(normal, frame.sun.xyz), 0.0);
	// Whether anything stands between here and the sun. Asked only where the
	// sun would reach anyway, so a face already turned away costs nothing.
	if (lambert > 0.0) {
		lambert = lambert * sunLight(world, normal, away);
	}
	// How much of the sky this face can see, from all of it to the fraction a
	// downward face gets back off the ground.
	let openness = mix(0.42, 1.0, 0.5 + 0.5 * dot(normal, up));
	// **The sky's hue, not its brightness.** The color the pass clears to
	// already fades from day to night, so taking it whole would dim the
	// ambient twice over -- once by that fade and once by \`day\` below --
	// and would also make a dark blue sky a dark light rather than a blue
	// one. Dividing out its own luminance leaves a tint of 1, and half of
	// that tint is enough to read as sky without turning grey stone blue.
	let lum = max(0.001, dot(frame.sky.rgb, vec3f(0.2126, 0.7152, 0.0722)));
	let tint = mix(vec3f(1.0), frame.sky.rgb / lum, 0.5);
	let fromSky = tint * (ambient * openness * day);
	let fromSun = sunColor(up) * (direct * lambert * day);
	// **The moon is the only thing with a direction after dark.** Without it
	// every face of a block takes the same light all night and a block is a
	// silhouette rather than a shape. It is measured against the place's own
	// up the way the sun is, so it sets over a walking player as well as over
	// a waiting one, and it fades out as the day comes up rather than
	// switching off.
	let moonUp = clamp(dot(up, frame.moon.xyz) * 6.0, 0.0, 1.0);
	let moonLambert = max(dot(normal, frame.moon.xyz), 0.0);
	let fromMoon =
		MOON_COLOR * (frame.moon.w * moonLambert * moonUp * (1.0 - day));
	// After dark the sky is what is left, and a face still sees more of it
	// looking up than looking down. **The floor is under the ambient alone**,
	// so the sun and the moon add on top of it rather than having to beat it:
	// a moonlit face reads against an unlit one instead of both bottoming out
	// at the same number.
	let night = vec3f(frame.night.y * openness);
	return max(night, fromSky) + fromSun + fromMoon;
}

@fragment
fn fragmentMain(in : VertexOut) -> @location(0) vec4f {
	let world = in.local + chunk.origin.xyz;
	let up = normalize(in.up);
	// Turned toward the column's own up as a step stops fitting inside a
	// pixel, so distant ground shades as the hillside it is rather than
	// strobing between the top of each step and its riser.
	let normal = normalize(mix(
		faceNormal(in.local, frame.eye.xyz - world), up, stepBlur(in.local)));
	// The two shares sum to 1, so flat ground under a noon sun reads the same
	// whatever the balance is and only what stands at an angle to the sun
	// moves.
	let direct = SUN_SHARE;
	let lit =
		in.color * lightOn(normal, up, world, in.depth, 1.0 - direct, direct);

	// Under water the view fades toward the water's own color over the distance
	// in fog.w. Above the surface that distance is set far past the horizon,
	// so the same expression leaves the color alone.
	let murk = clamp(in.depth / frame.fog.w, 0.0, 1.0);
	return vec4f(mix(lit, frame.fog.rgb, murk), 1.0);
}

@fragment
fn waterMain(in : VertexOut) -> @location(0) vec4f {
	let world = in.local + chunk.origin.xyz;
	let up = normalize(in.up);
	let normal = normalize(mix(
		faceNormal(in.local, frame.eye.xyz - world), up, stepBlur(in.local)));
	// Water takes less of its light from the sun than stone does: a look
	// reaches through it to whatever is under, and that is lit from the sky.
	let direct = SUN_SHARE * 0.78;
	let lit =
		in.color * lightOn(normal, up, world, in.depth, 1.0 - direct, direct);
	let murk = clamp(in.depth / frame.fog.w, 0.0, 1.0);
	return vec4f(mix(lit, frame.fog.rgb, murk), 0.62);
}
`;
