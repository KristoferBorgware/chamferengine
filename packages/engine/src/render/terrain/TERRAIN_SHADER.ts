import { BLOCK_LIGHT_WGSL } from "../light/BLOCK_LIGHT_WGSL.js";
import { SHADOW_WGSL } from "../light/SHADOW_WGSL.js";
import { ALPHA_CUT } from "./ALPHA_CUT.js";
import { PICTURE_WGSL } from "./PICTURE_WGSL.js";
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
 * `sun.xyz` points at the sun and `sun.w` is 1 when the sun is to reach every
 * face as though no block stood in its way, which is how a cave is looked into
 * before anything can be carried down there. It takes away only the blocking:
 * a face's own angle to the sun still decides how much of it that face gets.
 *
 * `night.x` is how far the sun is over this place's horizon, `night.y` is
 * what is left of the light when it is not, `night.z` is what the direct
 * sun is worth against the sky, and `night.w` is how much a face's own angle
 * to the sky still shades it once the sun is gone. `sky.rgb` is what the sky
 * is doing, which is the color of everything the sun does not reach
 * directly, and `sky.w` is what that ambient light is worth.
 * \`moon.xyz\` points at the moon and \`moon.w\` is what it is worth.
 *
 * A light standing in the world is the one term that is not in this uniform:
 * it is a cube of levels around wherever it stands, read through group 2.
 */
export const TERRAIN_SHADER = /* wgsl */ `
${SHADOW_WGSL}
${BLOCK_LIGHT_WGSL}

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

/**
 * Every block picture, one layer apiece.
 *
 * **An array rather than an atlas**, so a layer mips down to one texel with
 * nothing beside it to bleed in, and a wall merged over several layers repeats
 * its picture by asking the sampler. A vertex carries the layer it reads as a
 * float holding a whole number, and \`-1\` where nothing has loaded a bake --
 * which draws the color alone, the way this shader always did.
 */
@group(3) @binding(0) var blockMap : texture_2d_array<f32>;
@group(3) @binding(1) var blockSample : sampler;

/**
 * The same array read without the repeat, for the band over a wall.
 *
 * A wall merged down a column runs its v from 0 to the number of layers, so the
 * block's own picture tiles down it and a three-layer wall is three pictures
 * rather than one stretched over three metres. The band hanging over its brink
 * must NOT tile: there is one brink, and it is at the top. Clamping the
 * coordinate is what says so, and it costs a sampler rather than a second
 * coordinate on every vertex in the world.
 */
@group(3) @binding(2) var bandSample : sampler;
${PICTURE_WGSL(3)}

/** How much of a picture has to be there for its pixel to be drawn. */
const ALPHA_CUT : f32 = ${ALPHA_CUT};
struct VertexOut {
	@builtin(position) clip  : vec4f,
	@location(0)       color : vec3f,
	@location(1)       local : vec3f,
	@location(2)       up    : vec3f,
	@location(3)       depth : f32,
	@location(4)       sky   : f32,
	@location(5)       uv    : vec2f,
	@location(6) @interpolate(flat) layer : i32,
	@location(7) @interpolate(flat) band  : i32,
};

@vertex
fn vertexMain(
	@location(0) position : vec3f,
	@location(1) color    : vec3f,
	@location(2) sky      : f32,
	@location(3) uv       : vec2f,
	@location(4) layers   : vec2f,
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
	// How much sky the cell stands under, measured by the mesher from the
	// ground around it. Under full light every face takes the open-sky
	// reading instead, which is what stops a cave being held at the 12% a
	// cell shut in on every side is given.
	out.sky = mix(sky, 1.0, frame.sun.w);
	out.uv = uv;
	// **Flat, not interpolated.** Every corner of a face reads one picture,
	// and a layer averaged between two would be a third picture that is not
	// either of them.
	out.layer = i32(layers.x);
	out.band = i32(layers.y);
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
	sky : f32,
) -> vec3f {
	let day = frame.night.x;
	var lambert = max(dot(normal, frame.sun.xyz), 0.0);
	// Whether anything stands between here and the sun. Asked only where the
	// sun would reach anyway, so a face already turned away costs nothing --
	// and **not asked at all under full light**, which is the whole of what
	// that switch means: the sun reaches every face as though no block stood
	// in its way. The face's own angle to the sun still decides how much it
	// takes, so a cave keeps its shape instead of going flat.
	if (lambert > 0.0 && frame.sun.w < 0.5) {
		lambert = lambert * sunLight(world, normal, away);
	}
	// How much of the sky this face can see, from all of it to the fraction a
	// downward face gets back off the ground. **This is the one thing that
	// can still read as directional with the sun switched off** -- it is a
	// dot product against \`up\`, not against the sun, but two faces of one
	// hexagon differ under it all the same. \`night.w\` blends it toward the
	// open-sky reading for every face alike, which is flat rather than dim:
	// turning this down does not darken the world, it makes every face agree
	// about how much sky is over it. **Past 1 it overshoots the other way**:
	// \`mix\` extrapolates past \`byAngle\` rather than stopping there, so a
	// value above 1 pushes a steep face darker than its own natural floor --
	// which matters, because that floor is 0.71 for a sheer wall and the
	// shipped ground runs 11 degrees of slope at the median, so the natural
	// range barely moves off 1 anywhere but a cliff.
	let byAngle = mix(0.42, 1.0, 0.5 + 0.5 * dot(normal, up));
	let openness = clamp(mix(1.0, byAngle, frame.night.w), 0.0, 1.0);
	// **The sky's hue, not its brightness.** The color the pass clears to
	// already fades from day to night, so taking it whole would dim the
	// ambient twice over -- once by that fade and once by \`day\` below --
	// and would also make a dark blue sky a dark light rather than a blue
	// one. Dividing out its own luminance leaves a tint of 1, and half of
	// that tint is enough to read as sky without turning grey stone blue.
	let lum = max(0.001, dot(frame.sky.rgb, vec3f(0.2126, 0.7152, 0.0722)));
	let tint = mix(vec3f(1.0), frame.sky.rgb / lum, 0.5);
	let fromSky = tint * (ambient * openness * day * frame.sky.w);
	let fromSun = sunColor(up) * (direct * lambert * day * frame.night.z);
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
	// **A light standing in the world owes nothing to the day.** The sun, the
	// sky and the moon are all gated by whether the sun is over this place's
	// horizon; a lamp underground is not, and it adds on top of the floor the
	// same way the moon does rather than having to beat it.
	let lamp = blockLight(world, normal);
	// **The sky's own reach is what \`sky\` scales, and a lamp is outside it.**
	// The sun, the sky and the moon all arrive from over the ground around
	// this cell, so how much of that a cell can see reduces all three; a
	// source standing in the world owes nothing to it, and a cave shut in on
	// every side is exactly where the two have to part.
	return (max(night, fromSky) + fromSun + fromMoon) * sky + lamp;
}

/**
 * The picture a face wears, which is the block's own color where there is one.
 *
 * **The picture IS the albedo, and the vertex color is what modulates it.**
 * With a bake loaded the mesher writes the corner occlusion and the speckle
 * alone into a vertex, so this multiplies out to color times shading; with no
 * bake it writes the registry color the way it always did and this returns 1.
 * Either way one multiply, and the world before the pictures arrive is the
 * world this engine already drew.
 */
fn pictureOn(uv : vec2f, layer : i32, band : i32) -> vec4f {
	// **Sampled before it is chosen, never inside the test.** A layer is a
	// per-vertex number, so a branch on it is not uniform across the draw, and
	// \`textureSample\` picks its own mip from how the coordinate changes
	// between neighbouring pixels -- which only exists where every pixel took
	// the same path. The index is clamped for the same reason: the read
	// happens whether or not its answer is wanted.
	let place = placeOf(layer);
	// Taken here rather than inside {@link samplePicture}: a derivative is a
	// difference across the pixel quad, and this is where the quad is.
	let ddx = dpdx(uv);
	let ddy = dpdy(uv);
	let picked = samplePicture(blockMap, blockSample, uv, place, ddx, ddy);
	// The band over the brink, composited by its own alpha. A block carrying
	// \`-1\` for it takes none of the sample, which happens either way.
	//
	// **Its sampler clamps rather than repeats**, so a wall has one brink
	// however many layers it merged. When several pictures share a layer that
	// clamp has to reach the picture's own edge and not the layer's, which is
	// the one thing about the band a packing has to solve.
	let overPlace = placeOf(band);
	let over = samplePicture(blockMap, bandSample, uv, overPlace, ddx, ddy);
	let cover = select(0.0, over.a, band >= 0);
	let color = mix(picked.rgb, over.rgb, cover);
	return select(vec4f(1.0), vec4f(color, picked.a), layer >= 0);
}

/**
 * A face of ground, lit and fogged, with the picture it wears still in front.
 *
 * The whole of what the opaque pass and the cutout pass have in common, which
 * is everything but what the cutout does with the picture's alpha. Written
 * once so the two can never drift into shading a leaf differently from the
 * trunk beside it.
 */
fn groundColor(in : VertexOut) -> vec4f {
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
	let picture = pictureOn(in.uv, in.layer, in.band);
	let lit =
		in.color * picture.rgb *
		lightOn(normal, up, world, in.depth, 1.0 - direct, direct, in.sky);

	// Under water the view fades toward the water's own color over the distance
	// in fog.w. Above the surface that distance is set far past the horizon,
	// so the same expression leaves the color alone.
	let murk = clamp(in.depth / frame.fog.w, 0.0, 1.0);
	return vec4f(mix(lit, frame.fog.rgb, murk), picture.a);
}

@fragment
fn fragmentMain(in : VertexOut) -> @location(0) vec4f {
	// Alpha 1 whatever the picture holds: a block in this pass covers every
	// pixel it reaches, and the air pass reads that alpha as coverage.
	return vec4f(groundColor(in).rgb, 1.0);
}

/**
 * The same face, with the pixels its picture is transparent at thrown away.
 *
 * **A test, not a blend.** A leaf is either there or it is not, so the pixel
 * is kept whole or dropped whole -- which means this pass can still write
 * depth, and a leaf therefore shadows, occludes and sorts exactly the way
 * stone does. Blending instead would need the whole canopy sorted back to
 * front per triangle, which nothing here can do.
 *
 * The sample is taken inside {@link groundColor}, before anything is thrown
 * away, because a discarded pixel still has neighbours that need it: the mip
 * level and the face normal both come from how a value changes across two
 * pixels, and dropping one first is how a canopy edge loses its shading.
 */
@fragment
fn cutoutMain(in : VertexOut) -> @location(0) vec4f {
	let ground = groundColor(in);
	if (ground.a < ALPHA_CUT) {
		discard;
	}
	return vec4f(ground.rgb, 1.0);
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
		in.color * pictureOn(in.uv, in.layer, in.band).rgb *
		lightOn(normal, up, world, in.depth, 1.0 - direct, direct, in.sky);
	let murk = clamp(in.depth / frame.fog.w, 0.0, 1.0);
	return vec4f(mix(lit, frame.fog.rgb, murk), 0.62);
}
`;
