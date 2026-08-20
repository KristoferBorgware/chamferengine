/**
 * The sea: one translucent shell around the camera, with waves on it.
 *
 * **Stylized, not simulated.** The waves are a sum of three travelling sines
 * rather than a spectrum, the light on them is a hard-edged highlight rather
 * than a reflection of anything, and the foam is drawn where the water is
 * steepest rather than where it meets the shore. What that buys is a sea that
 * costs one draw call and no state at all: nothing is stored between frames
 * and nothing is read back.
 *
 * A phase is `dot(direction, axis)`, so a wave is a band wrapping the whole
 * planet rather than a plane travelling across a flat sheet. Three axes that
 * do not line up give a surface with no visible grain, and every one of them
 * is continuous everywhere on the sphere -- there is no seam to cross and no
 * pole to pinch, because a dot product does not have either.
 */
export const SEA_SHADER = /* wgsl */ `
struct Frame {
	viewProj : mat4x4f,
	eye      : vec4f,
	sun      : vec4f,
	fog      : vec4f,
	night    : vec4f,
};
@group(0) @binding(0) var<uniform> frame : Frame;

struct Sea {
	// xyz: the radial up under the camera. w: the sea's own radius.
	up    : vec4f,
	// xyz: east across that up. w: how far the disc reaches, in radians.
	east  : vec4f,
	// xyz: north across it. w: seconds, for the waves to travel on.
	north : vec4f,
	// height in metres, metres between crests, how fast they travel, foam.
	wave  : vec4f,
	// how solid the water reads close up, how hard the sun's highlight is,
	// how many metres of it a look reaches through, and how choppy it is.
	look  : vec4f,
	// The colour of shallow water, and of deep.
	shallow : vec4f,
	deep    : vec4f,
	// What the sky is doing, for the water to reflect at the horizon.
	sky     : vec4f,
};
@group(1) @binding(0) var<uniform> sea : Sea;

const AXIS_A = vec3f(0.86, 0.36, 0.36);
const AXIS_B = vec3f(-0.31, 0.80, 0.51);

/** One hashed value per lattice corner, from three wrapping multiplies. */
fn hash13(p : vec3f) -> f32 {
	let q = vec3u(vec3i(floor(p))) * vec3u(1597334677u, 3812015801u, 2798796415u);
	let n = (q.x ^ q.y ^ q.z) * 1597334677u;
	return f32(n) * (1.0 / 4294967295.0);
}

/**
 * Value noise in three dimensions, sampled from a direction.
 *
 * **The article warps its wave field with two-dimensional noise over the
 * ground plane, and there is no such plane here.** A sphere has no seamless
 * two-dimensional parameterisation -- that is the hairy ball theorem again,
 * the same one that forbids a global north -- so any texture laid across one
 * tears somewhere or pinches at a pole. Noise sampled from the direction
 * vector in three dimensions has neither problem, which is exactly why the
 * terrain samples in 3D world space rather than in face-local coordinates.
 */
fn vnoise3(p : vec3f) -> f32 {
	let i = floor(p);
	let f = p - i;
	// The quintic fade, not smoothstep: a smoothstep leaves a jump in
	// curvature at every lattice plane, which shading shows as a grid.
	let u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
	let a = mix(hash13(i + vec3f(0.0, 0.0, 0.0)), hash13(i + vec3f(1.0, 0.0, 0.0)), u.x);
	let b = mix(hash13(i + vec3f(0.0, 1.0, 0.0)), hash13(i + vec3f(1.0, 1.0, 0.0)), u.x);
	let c = mix(hash13(i + vec3f(0.0, 0.0, 1.0)), hash13(i + vec3f(1.0, 0.0, 1.0)), u.x);
	let d = mix(hash13(i + vec3f(0.0, 1.0, 1.0)), hash13(i + vec3f(1.0, 1.0, 1.0)), u.x);
	return mix(mix(a, b, u.y), mix(c, d, u.y), u.z) * 2.0 - 1.0;
}

/**
 * One octave of water: two folded bands, multiplied.
 *
 * **A single folded sine is a set of parallel stripes, however sharp its
 * crests are.** Folding two bands that do not line up and multiplying them
 * gives cells rather than bands -- a crest is where both fold at once, which
 * is a peak with a length and a width. Blending the fold toward the
 * complementary cosine, weighted by the fold itself, rounds the very top so
 * a crest is a wave rather than a knife edge.
 */
fn octave(dir : vec3f, k : f32, drift : f32, chop : f32) -> f32 {
	let a = dot(dir, AXIS_A) * k + drift;
	let b = dot(dir, AXIS_B) * k + drift;
	let wave = vec2f(1.0 - abs(sin(a)), 1.0 - abs(sin(b)));
	let round = vec2f(abs(cos(a)), abs(cos(b)));
	let w = mix(wave, round, wave);
	return pow(1.0 - pow(w.x * w.y, 0.65), chop);
}

/** How high the water stands at a direction, in metres off the sea radius. */
fn swell(dir : vec3f, seconds : f32) -> f32 {
	// One turn of phase per wavelength around the planet, so the number a
	// person sets in metres is the number of metres between two crests.
	// A phase is a dot product, which is continuous over the whole sphere:
	// no seam to cross and no pole to pinch, because a dot product has
	// neither.
	var k = 6.28318530718 * sea.up.w / max(1.0, sea.wave.y);
	let speed = sea.wave.z;
	var chop = max(1.0, sea.look.w);

	// **The domain warp is what stops the sea being a lattice.** Everything
	// below it is periodic -- sines folded and multiplied are still sines --
	// so without this the water draws the same crest over and over on a
	// regular grid, which is what it looks like. Bending the direction by a
	// noise field first means no two crests are laid out alike, and because
	// the noise is smooth the surface stays smooth. A phase moves by one
	// radian for a direction offset of 1/k, so the warp is measured in
	// radians of phase and divided by k to become an offset.
	let wf = k * 0.3;
	let warp = vec3f(
		vnoise3(dir * wf),
		vnoise3(dir * wf + vec3f(19.3, 7.7, 3.1)),
		vnoise3(dir * wf + vec3f(-5.2, 11.9, 23.4))
	) * (1.6 / k);
	var d = normalize(dir + warp);

	var h = 0.0;
	var amp = 1.0;
	var total = 0.0;
	var drift = seconds * speed;
	for (var o = 0; o < 3; o++) {
		// Two samples travelling opposite ways. One direction alone slides
		// the whole ocean past the viewer like a conveyor; against each
		// other they interfere, and the pattern churns instead of moving.
		var band = octave(d, k, drift, chop);
		band += octave(d, k, -drift, chop);
		h += band * amp;
		total += amp * 2.0;
		// Turn the direction between octaves as well as raising the
		// frequency, or every octave folds along the same two axes and the
		// stack sharpens one pattern rather than building a second.
		d = normalize(vec3f(d.y * 0.8 + d.z * 0.6, d.z * 0.8 - d.x * 0.6, d.x));
		k *= 1.9;
		amp *= 0.22;
		chop = mix(chop, 1.0, 0.2);
	}
	// The fold runs 0 to 1 rather than -1 to 1, so centre it: the number a
	// person sets is trough to crest, and the still water line is halfway.
	return (h / total - 0.5) * sea.wave.x;
}

struct SeaOut {
	@builtin(position) clip  : vec4f,
	@location(0)       world : vec3f,
	@location(1)       dir   : vec3f,
	@location(2)       up    : vec3f,
	@location(3)       crest : f32,
	@location(4)       out   : f32,
};

@vertex
fn vertexMain(@location(0) local : vec2f) -> SeaOut {
	// The flat disc laid onto the sphere: how far out the vertex sits becomes
	// an angle from the camera's own up, and which way it sits becomes a
	// direction in the tangent plane there.
	let out = length(local);
	let angle = out * sea.east.w;
	var across = vec3f(0.0);
	if (out > 1e-6) {
		let side = local / out;
		across = sea.east.xyz * side.x + sea.north.xyz * side.y;
	}
	let dir = normalize(sea.up.xyz * cos(angle) + across * sin(angle));

	// **A wave shorter than the gap between two vertices is noise, not a
	// wave.** The disc packs its rings toward the middle, so underfoot they
	// sit a couple of metres apart and out at the rim tens of metres apart
	// -- and from altitude the rim is kilometres away, where a 30 m swell
	// falls to a fleck per vertex that crawls as the camera moves. Flatten
	// the swell as the rim approaches rather than drawing what cannot be
	// resolved. Not to nothing: a dead flat sea reflects the sun as a single
	// point, and what makes it a path is the last of the slope.
	let seconds = sea.north.w;
	let resolved = mix(1.0, 0.25, smoothstep(0.35, 0.85, out));
	let height = swell(dir, seconds) * resolved;
	let world = dir * (sea.up.w + height);

	// The normal, from how the swell changes a step east and a step north.
	// A step in angle rather than in metres, so it stays the same shape
	// however big the planet is.
	let step = 0.0004;
	let eastDir = normalize(dir + sea.east.xyz * step);
	let northDir = normalize(dir + sea.north.xyz * step);
	let arc = sea.up.w * step;
	let slopeEast = (swell(eastDir, seconds) * resolved - height) / arc;
	let slopeNorth = (swell(northDir, seconds) * resolved - height) / arc;

	var result : SeaOut;
	result.clip = frame.viewProj * vec4f(world, 1.0);
	result.world = world;
	result.dir = dir;
	// Tilted off the radial by the two slopes, which is the surface normal.
	result.up = normalize(
		dir - sea.east.xyz * slopeEast - sea.north.xyz * slopeNorth
	);
	// How near this vertex is to the top of a wave, for the foam.
	result.crest = height / max(0.001, sea.wave.x) + 0.5;
	// How far out toward the horizon this vertex sits, which is the one
	// measure of "near the horizon" that means the same thing underfoot and
	// from orbit. The fragment reads it for both the sky reflection and the
	// fade at the rim.
	result.out = out;
	return result;
}

/**
 * The mesh itself, drawn as lines over the same geometry.
 *
 * Every knob still applies -- the wave shape, the rim fade and the reach are
 * the vertex shader's, untouched -- so this shows where the vertices actually
 * are while a wave is moving them, which is the one thing the filled surface
 * cannot be asked. It is lit by nothing and coloured by how near the horizon
 * a line is, so the packing of the rings reads as shading.
 */
@fragment
fn wireMain(in : SeaOut) -> @location(0) vec4f {
	let near = 1.0 - smoothstep(0.0, 0.7, in.out);
	let line = mix(vec3f(0.25, 0.85, 1.0), vec3f(1.0, 0.95, 0.55), near);
	return vec4f(line, 1.0 - smoothstep(0.92, 1.0, in.out));
}

@fragment
fn fragmentMain(in : SeaOut) -> @location(0) vec4f {
	let normal = normalize(in.up);
	let toEye = normalize(frame.eye.xyz - in.world);
	let day = frame.night.x;

	// **How much water the look passes through is what decides everything
	// here.** A metre of it is nearly clear and forty are not, so the sea
	// floor shows near the shore and nowhere else -- and the alternative,
	// one opacity for the whole surface, draws the bottom of the ocean out
	// to the horizon or hides it in the shallows.
	let through = smoothstep(
		0.0, max(1.0, sea.look.z), length(frame.eye.xyz - in.world)
	);
	var tint = mix(sea.shallow.rgb, sea.deep.rgb, through);

	// The water reflects the sky, a little everywhere and a lot at the
	// horizon. Read the horizon off the disc rather than off the view angle:
	// at eye height nearly the whole sea is glancing, so a Fresnel term
	// paints all of it sky, while the rim of the disc is the horizon at
	// every altitude the player can reach. Without the constant share the
	// open ocean is a navy hole with a bright edge.
	let horizon = smoothstep(0.45, 1.0, in.out);
	tint = mix(tint, sea.sky.rgb, 0.12 + horizon * 0.55);

	// The sun, as a highlight with an edge rather than a smooth falloff --
	// which is the whole difference between stylized water and the other
	// kind. Two steps: a sheen, and a small hard glint inside it. **Both are
	// cut close to 1**: the sea is near flat, so a loose threshold is not a
	// highlight but a wash over half the picture. What spreads it into a
	// path toward the sun rather than a point is the wave slope -- the
	// waves default to 1.2 m over 90 m, which tilts the surface about five
	// degrees, so the path is about ten degrees wide and it narrows to
	// nothing if the waves are turned off.
	let half = normalize(toEye + frame.sun.xyz);
	let raw = clamp(dot(normal, half), 0.0, 1.0);
	let sheen = smoothstep(0.985, 0.996, raw);
	let glint = smoothstep(0.9992, 0.9997, raw);
	tint += (sheen * 0.22 + glint * 0.85) * sea.look.y * day;

	// Foam on the crests, banded rather than faded, so it reads as drawn.
	let foam = smoothstep(1.0 - sea.wave.w * 0.6, 1.0 - sea.wave.w * 0.6 + 0.06, in.crest);
	tint = mix(tint, vec3f(0.95, 0.98, 1.0), foam * sea.wave.w);

	// Lit by the same sun the ground takes, and never black at night.
	let sunlit = clamp(dot(normal, frame.sun.xyz), 0.0, 1.0);
	let shade = mix(frame.night.y, 0.55 + 0.45 * sunlit, day);
	// An edge that simply stopped would draw a hard circle around the
	// player, so the last stretch of the disc fades out instead.
	let fade = 1.0 - smoothstep(0.92, 1.0, in.out);
	let alpha = mix(sea.look.x, 1.0, through);
	return vec4f(tint * shade, alpha * fade);
}
`;
