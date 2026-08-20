/**
 * The sea: a spherical layer of the world at sea level, with waves on it.
 *
 * **It is world geometry, not something carried around the camera.** Every
 * vertex sits where its chunk's triangle puts it, and the wave at a point is a
 * function of that point and the clock alone -- so walking past a wave leaves
 * it where it was, and the surface a player sees is the same surface every
 * other player sees. The sea is drawn out of the same chunks the terrain is,
 * at the same levels of detail the terrain picked, which is what makes it
 * finer underfoot than at the horizon.
 *
 * **Stylized, not simulated.** The waves are folded sines rather than a
 * spectrum, the light on them is a hard-edged highlight rather than a
 * reflection of anything, and the foam is drawn where the water is steepest
 * rather than where it meets the shore. Nothing is stored between frames and
 * nothing is read back.
 *
 * A phase is \`dot(direction, axis)\`, so a wave is a band wrapping the whole
 * planet rather than a plane travelling across a flat sheet. It is continuous
 * everywhere on the sphere -- no seam to cross and no pole to pinch, because a
 * dot product has neither.
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
	// x: the camera's horizon, in radians. y: seconds, for the waves to
	// travel on. z, w: where the swell starts and stops being resolved.
	view  : vec4f,
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
fn vertexMain(
	@location(0) bary    : vec2f,
	@location(1) cornerA : vec3f,
	@location(2) cornerB : vec3f,
	@location(3) cornerC : vec3f,
) -> SeaOut {
	// **One barycentric blend, evaluated once, then normalised.** The patch
	// is a flat triangle of weights and the instance is where its three
	// corners point, so this is the same one-shot construction every cell
	// centre in the world is placed by -- never repeated arc midpoints,
	// which describe a different sphere.
	let w = vec3f(1.0 - bary.x - bary.y, bary.x, bary.y);
	let dir = normalize(cornerA * w.x + cornerB * w.y + cornerC * w.z);

	// **A wave shorter than the gap between two vertices is noise, not a
	// wave**, and how far apart the vertices are is decided by the level of
	// detail the chunk was drawn at -- which grows with distance. So the
	// swell flattens with distance.
	//
	// **Distance, and never the level itself.** A point kept by both a fine
	// chunk and a coarse one has to stand at the same height in each, or the
	// water moves whenever a chunk changes level and every LOD boundary is a
	// step. Distance is a property of the point, so a coarse chunk draws a
	// subset of the fine chunk's surface: incomplete rather than wrong.
	//
	// Not flattened to nothing: a dead flat sea reflects the sun as a single
	// point, and what makes it a path is the last of the slope.
	let seconds = sea.view.y;
	let dist = length(frame.eye.xyz - dir * sea.up.w);
	let resolved = mix(0.15, 1.0, 1.0 - smoothstep(sea.view.z, sea.view.w, dist));
	let height = swell(dir, seconds) * resolved;
	let world = dir * (sea.up.w + height);

	// The normal, from how the swell changes a step each way across the
	// surface. Any two directions across the radial will do -- the slope of a
	// surface does not depend on which frame it was measured in -- so this
	// picks a pair rather than being handed one, and the switch where the
	// helper axis runs out changes the answer nowhere.
	var e1 = cross(vec3f(0.0, 1.0, 0.0), dir);
	if (dot(e1, e1) < 1e-8) { e1 = cross(vec3f(1.0, 0.0, 0.0), dir); }
	e1 = normalize(e1);
	let e2 = normalize(cross(dir, e1));
	// A step in angle rather than in metres, so it stays the same shape
	// however big the planet is.
	let step = 0.0004;
	let arc = sea.up.w * step;
	let slope1 = (swell(normalize(dir + e1 * step), seconds) * resolved - height) / arc;
	let slope2 = (swell(normalize(dir + e2 * step), seconds) * resolved - height) / arc;

	var result : SeaOut;
	result.clip = frame.viewProj * vec4f(world, 1.0);
	result.world = world;
	result.dir = dir;
	// Tilted off the radial by the two slopes, which is the surface normal.
	result.up = normalize(dir - e1 * slope1 - e2 * slope2);
	// How near this vertex is to the top of a wave, for the foam.
	result.crest = height / max(0.001, sea.wave.x) + 0.5;
	// How near the viewer's own horizon this vertex is, as a fraction of the
	// way to it: 0 underfoot and 1 at the skyline, at every altitude. The
	// fragment reads it for the sky the water reflects.
	let lean = acos(clamp(dot(sea.up.xyz, dir), -1.0, 1.0));
	result.out = clamp(lean / max(1e-5, sea.view.x), 0.0, 1.0);
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
	return vec4f(line, 1.0);
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
	let alpha = mix(sea.look.x, 1.0, through);
	return vec4f(tint * shade, alpha);
}
`;
