import { SHADOW_WGSL } from "../light/SHADOW_WGSL.js";

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
${SHADOW_WGSL}
struct Frame {
	viewProj : mat4x4f,
	eye      : vec4f,
	sun      : vec4f,
	fog      : vec4f,
	night    : vec4f,
	sky      : vec4f,
	moon     : vec4f,
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
	// x: how much ripple slope a fragment is given. y: how far the swell's
	// own strength rises and falls between one stretch of water and the next.
	// z, w: unused.
	detail  : vec4f,
};
@group(1) @binding(0) var<uniform> sea : Sea;

const AXIS_A = vec3f(0.86, 0.36, 0.36);
const AXIS_B = vec3f(-0.31, 0.80, 0.51);

/** What the moon lays on the water: a cold white, and never a bright one. */
const MOON_ON_WATER = vec3f(0.40, 0.48, 0.62);

/** One hashed value per lattice corner, from three wrapping multiplies. */
fn hash13(p : vec3f) -> f32 {
	let q = vec3u(vec3i(floor(p))) * vec3u(1597334677u, 3812015801u, 2798796415u);
	let n = (q.x ^ q.y ^ q.z) * 1597334677u;
	return f32(n) * (1.0 / 4294967295.0);
}

/**
 * Value noise in three dimensions, and its gradient, from one set of corners.
 *
 * **The article warps its wave field with two-dimensional noise over the
 * ground plane, and there is no such plane here.** A sphere has no seamless
 * two-dimensional parameterisation -- that is the hairy ball theorem again,
 * the same one that forbids a global north -- so any texture laid across one
 * tears somewhere or pinches at a pole. Noise sampled from the direction
 * vector in three dimensions has neither problem, which is exactly why the
 * terrain samples in 3D world space rather than in face-local coordinates.
 *
 * \`x\` is the value over -1 to 1 and \`yzw\` is its gradient with respect to the
 * sample point. The gradient falls out of the same eight hashed corners the
 * value is built from, so a slope is one noise lookup rather than the four a
 * difference would take. That is what makes a per-fragment slope affordable.
 */
fn vnoise3d(p : vec3f) -> vec4f {
	let i = floor(p);
	let f = p - i;
	// The quintic fade, not smoothstep: a smoothstep leaves a jump in
	// curvature at every lattice plane, which shading shows as a grid.
	let u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
	let du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
	let a = hash13(i + vec3f(0.0, 0.0, 0.0));
	let b = hash13(i + vec3f(1.0, 0.0, 0.0));
	let c = hash13(i + vec3f(0.0, 1.0, 0.0));
	let d = hash13(i + vec3f(1.0, 1.0, 0.0));
	let e = hash13(i + vec3f(0.0, 0.0, 1.0));
	let g = hash13(i + vec3f(1.0, 0.0, 1.0));
	let h = hash13(i + vec3f(0.0, 1.0, 1.0));
	let j = hash13(i + vec3f(1.0, 1.0, 1.0));
	let k0 = a;
	let k1 = b - a;
	let k2 = c - a;
	let k3 = e - a;
	let k4 = a - b - c + d;
	let k5 = a - c - e + h;
	let k6 = a - b - e + g;
	let k7 = -a + b + c - d + e - g - h + j;
	let value =
		k0 + k1 * u.x + k2 * u.y + k3 * u.z +
		k4 * u.x * u.y + k5 * u.y * u.z + k6 * u.z * u.x +
		k7 * u.x * u.y * u.z;
	let grad = du * vec3f(
		k1 + k4 * u.y + k6 * u.z + k7 * u.y * u.z,
		k2 + k5 * u.z + k4 * u.x + k7 * u.z * u.x,
		k3 + k6 * u.x + k5 * u.y + k7 * u.x * u.y
	);
	return vec4f(value * 2.0 - 1.0, grad * 2.0);
}

/** The value alone, for a caller with no use for the slope. */
fn vnoise3(p : vec3f) -> f32 {
	return vnoise3d(p).x;
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
 *
 * **The two bands take a phase each rather than sharing one.** A shared
 * offset slides the whole pattern sideways and leaves the angle its two
 * families of crests cross at exactly where it was, which is a lattice
 * carried to a new place rather than broken; two offsets shear it, so the
 * crossing angle is one thing here and another a few wavelengths away.
 * Measured over a 400 m patch, the slope directions of the shared form pile
 * into one bin 2.7 times as full as the average and the sheared form 1.8, and
 * a 1600 m patch reads 2.9 against 1.9.
 */
fn octave(dir : vec3f, k : f32, phaseA : f32, phaseB : f32, chop : f32) -> f32 {
	let a = dot(dir, AXIS_A) * k + phaseA;
	let b = dot(dir, AXIS_B) * k + phaseB;
	let wave = vec2f(1.0 - abs(sin(a)), 1.0 - abs(sin(b)));
	let round = vec2f(abs(cos(a)), abs(cos(b)));
	let w = mix(wave, round, wave);
	return pow(1.0 - pow(w.x * w.y, 0.65), chop);
}

/**
 * Radians of phase the bend field is worth, and how far one bend of it runs.
 *
 * The bend is read at a sixteenth of the octave's own frequency, so a crest
 * holds its line over a train of them and the direction drifts across a bay
 * rather than within one wave. Twelve radians over sixteen wavelengths is
 * three quarters of a wavelength of sideways travel per wavelength of ground
 * -- enough to turn a crest, far short of inventing one.
 */
const BEND_RADIANS = 12.0;
const BEND_OVER = 16.0;

/**
 * How many octaves are bent before the rest are left along the fixed axes.
 *
 * Bending all three measures 1.80 against 1.85 for two on a 400 m patch, and
 * each bent octave is two noise lookups. Bending only the first reads 2.13,
 * which is a weave again.
 */
const BEND_OCTAVES = 2;

/** What each octave is worth against the one before it. */
const OCTAVE_GAIN = 0.4;

/**
 * How much slower the second band's clock runs than the first's.
 *
 * A band folded at its own zero crossing repeats every \`pi\` of phase, so one
 * clock for both bands makes the whole field the field it was \`pi / speed\`
 * seconds ago -- 3.93 seconds at the default speed, measured as a match of
 * **1.000** against the surface three seconds earlier. Two clocks that share
 * no whole-number ratio leave the crossings of the two bands travelling
 * instead of pulsing in place.
 */
const AGAINST = 0.76;

/**
 * What one octave's clock is multiplied by for the next.
 *
 * A wave in deep water travels at the square root of its wavelength, so an
 * octave at 1.9 times the frequency runs \`sqrt(1.9)\` times as fast. Giving
 * every octave the same clock instead leaves the narrow ones crawling under
 * the wide ones and hands all three the same period.
 */
const DISPERSION = 1.37840;

/**
 * How fast the bend field itself travels across the water, in metres a
 * second.
 *
 * The bend is where the crests are, and a swell's groups move as well as its
 * crests. It is the single largest part of the reading: with the bend held
 * still the surface comes back to a **0.84** match of a moment 15 seconds
 * earlier, and with it moving the best match over thirty seconds is **0.31**.
 */
const BEND_TRAVEL = 3.4;

/**
 * How high the water stands at a direction, in metres off the sea radius.
 *
 * Three octaves and no more. At the shipped settings a patch is cut to a
 * vertex every 4 m and the third octave is a 12.5 m wave, which is three
 * vertices across it; a fourth would be 6.6 m, under two vertices, so the
 * crests it draws would move with the camera rather than stand in the world.
 * Everything shorter than the third octave is a slope the fragment adds, not
 * geometry -- see \`ripple\`.
 */
fn swell(dir : vec3f, seconds : f32) -> f32 {
	// One turn of phase per wavelength around the planet, so the number a
	// person sets in metres is the number of metres between two crests.
	// A phase is a dot product, which is continuous over the whole sphere:
	// no seam to cross and no pole to pinch, because a dot product has
	// neither.
	var k = 6.28318530718 * sea.up.w / max(1.0, sea.wave.y);
	var omega = sea.wave.z;
	var chop = max(1.0, sea.look.w);

	var d = dir;
	var h = 0.0;
	var amp = 1.0;
	var total = 0.0;
	for (var o = 0; o < 3; o++) {
		// **The bend is what stops the sea being a lattice.** Everything
		// else here is periodic -- sines folded and multiplied are still
		// sines -- so without it the water draws the same crest over and
		// over on a regular grid. A phase moves by one radian for a
		// direction offset of 1/k, so the bend is measured in radians and
		// read off a noise field far below the octave's own frequency.
		var bendA = 0.0;
		var bendB = 0.0;
		if (o < BEND_OCTAVES) {
			let wf = k / BEND_OVER;
			// The bend travels as well as the crests do. The sample point is
			// the direction times wf, so a metre along the surface is
			// wf / R of it, and that factor turns a speed in metres a second
			// into one here.
			let groups = AXIS_A * (seconds * BEND_TRAVEL * wf / sea.up.w);
			let p = d * wf + groups;
			bendA = vnoise3(p + vec3f(19.3, 7.7, 3.1)) * BEND_RADIANS;
			bendB = vnoise3(p + vec3f(-5.2, 11.9, 23.4)) * BEND_RADIANS;
		}
		// Two samples travelling opposite ways. One direction alone slides
		// the whole ocean past the viewer like a conveyor; against each
		// other they interfere, and the pattern churns instead of moving.
		// Only the clocks are mirrored, never the bend: the bend says where
		// the crests are, and both copies are the same water.
		let clockA = seconds * omega;
		let clockB = -clockA * AGAINST;
		var band = octave(d, k, clockA + bendA, clockB + bendB, chop);
		band += octave(d, k, -clockA + bendA, -clockB + bendB, chop);
		h += band * amp;
		total += amp * 2.0;
		// Turn the direction between octaves as well as raising the
		// frequency, or every octave folds along the same two axes and the
		// stack sharpens one pattern rather than building a second.
		d = normalize(vec3f(d.y * 0.8 + d.z * 0.6, d.z * 0.8 - d.x * 0.6, d.x));
		k *= 1.9;
		omega *= DISPERSION;
		amp *= OCTAVE_GAIN;
		chop = mix(chop, 1.0, 0.2);
	}
	// The fold runs 0 to 1 rather than -1 to 1, so centre it: the number a
	// person sets is trough to crest, and the still water line is halfway.
	return (h / total - 0.5) * sea.wave.x;
}

/** How far one rise and fall of the swell's own strength runs, in waves. */
const GROUP_OVER = 12.0;

/**
 * How much of its height the swell keeps here, from 1 down to \`1 - depth\`.
 *
 * Swell arrives in groups: a stretch of open water runs its full height and
 * the next stretch is half of it. The factor never rises above 1, so the
 * height a person sets stays the tallest wave on the planet rather than an
 * average the field wanders either side of.
 *
 * A scale over the whole surface, not a term inside it, so the vertex shader
 * applies the one value to the height and to both slopes and \`swell\` is
 * called no more often than before.
 */
fn grouping(dir : vec3f, depth : f32) -> f32 {
	let k = 6.28318530718 * sea.up.w / max(1.0, sea.wave.y);
	let g = vnoise3(dir * (k / GROUP_OVER) + vec3f(51.1, 3.3, -8.8));
	return 1.0 - depth * (0.5 - 0.5 * g);
}

/**
 * The slope of the water below what a vertex can carry.
 *
 * A patch is cut to a vertex every 4 m at the shipped settings, so the
 * geometry stops at a 12.5 m wave and the water between two crests is drawn
 * as a sheet of glass. This puts the missing band back as a slope rather than
 * as geometry: three octaves of noise read for their gradient, tilting the
 * normal a fragment is shaded by without moving a vertex.
 *
 * **The gradient comes out of the same eight corners as the value**, so an
 * octave is one lookup rather than the four a difference over the surface
 * would take.
 *
 * The result is the part of the slope that lies across the surface, in metres
 * of rise per metre travelled. A height of \`amp * noise(dir * k)\` changes by
 * \`amp * k\` per unit of direction and a metre along the surface is \`1 / R\` of
 * direction, so the two divide out against the radius.
 */
fn ripple(dir : vec3f, seconds : f32, strength : f32) -> vec3f {
	// A quarter of the swell's wavelength is where the geometry gives out,
	// and the octaves run down from there.
	var k = 6.28318530718 * sea.up.w / max(0.5, sea.wave.y * 0.25);
	// A fortieth of the swell's height at the widest. A ripple is read as a
	// slope and never as a height, so what it is worth is how far it tilts
	// the surface: this leaves the widest octave about 0.06 of tilt, which
	// is texture on a wave. Past about 0.2 the highlight breaks into
	// separate lit pixels and the water reads as glitter.
	var amp = sea.wave.x * 0.025 * strength;
	var slope = vec3f(0.0);
	for (var o = 0; o < 3; o++) {
		// Carried along an axis rather than folded, so the detail travels
		// across the crests instead of pulsing in place. The sample point is
		// the direction times k, so a metre along the surface is k / R of
		// it: that factor turns the speed back into metres a second, and
		// every octave travels at the same one. Alternating the axis stops
		// the three of them moving as one sheet.
		let axis = select(AXIS_B, AXIS_A, (o & 1) == 0);
		let travel = axis * (seconds * sea.wave.z * 0.6 * k / sea.up.w);
		let n = vnoise3d(dir * k + travel);
		slope += n.yzw * (amp * k / sea.up.w);
		k *= 2.3;
		amp *= 0.45;
	}
	// Only the part across the surface: a slope along the radial is not a
	// slope, it is a change of height.
	return slope - dir * dot(slope, dir);
}

struct SeaOut {
	@builtin(position) clip  : vec4f,
	@location(0)       world : vec3f,
	@location(1)       dir   : vec3f,
	@location(2)       up    : vec3f,
	@location(3)       crest : f32,
	@location(4)       out   : f32,
	@location(5)       detail : f32,
};

/**
 * How far under the water a curtain vertex hangs, in metres.
 *
 * The slit a curtain fills is the difference between two readings of the same
 * wave field, so it is never wider than trough to crest. The quarter metre on
 * top covers the sphere's own curvature between two patches cut at different
 * spacings, which is a millimetre at chunk scale and does not go away when
 * the water is flat.
 */
fn curtainDrop() -> f32 {
	return sea.wave.x + 0.25;
}

@vertex
fn vertexMain(
	@location(0) place   : vec3f,
	@location(1) cornerA : vec3f,
	@location(2) cornerB : vec3f,
	@location(3) cornerC : vec3f,
) -> SeaOut {
	let bary = place.xy;
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
	let near = 1.0 - smoothstep(sea.view.z, sea.view.w, dist);
	let resolved = mix(0.15, 1.0, near) * grouping(dir, sea.detail.y);
	let height = swell(dir, seconds) * resolved;
	// A curtain vertex stands where its rim vertex stands and hangs under it,
	// so it carries the rim's own wave rather than a second reading of one.
	let world = dir * (sea.up.w + height - place.z * curtainDrop());

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
	// How much of the ripple slope this fragment gets. It fades out over the
	// same stretch the swell flattens over, because both give out for the
	// same reason: a wave narrower than the pixels drawing it is a shimmer.
	result.detail = near;
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
	// **The vertex normal is the slope of a 12.5 m wave and nothing
	// narrower**, because a vertex stands every 4 m and a slope is measured
	// between them. Tilting it here by a slope read from noise puts the
	// metre-scale texture of water back without moving a vertex, and it is
	// where the highlight stops being a polygon: a per-vertex normal
	// interpolated across a triangle gives a hard threshold straight edges,
	// and this breaks them at the fragment.
	let dir = normalize(in.dir);
	let strength = sea.detail.x * in.detail;
	var normal = normalize(in.up);
	if (strength > 0.001) {
		normal = normalize(normal - ripple(dir, sea.view.y, strength));
	}
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
	// **What stands between the water and the sun is the same walk the ground
	// takes.** A headland at sunrise throws its shadow across the bay beside
	// it as well as across the ground, and the sea is at sea level -- the
	// lowest thing there is -- so it is in the shade of anything at all.
	let lit = sunLight(in.world, dir, frame.sun.xyz, normal, length(frame.eye.xyz - in.world));
	let half = normalize(toEye + frame.sun.xyz);
	let raw = clamp(dot(normal, half), 0.0, 1.0);
	let sheen = smoothstep(0.985, 0.996, raw);
	let glint = smoothstep(0.9992, 0.9997, raw);
	tint += (sheen * 0.22 + glint * 0.85) * sea.look.y * day * lit;

	// The same highlight for the moon, wider and far dimmer, so a night sea
	// carries a path across it rather than being one flat sheet. Cut looser
	// than the sun's: a moon path on real water is a broad smear, and a
	// threshold as tight as the sun's would draw a handful of lit pixels.
	let moonHalf = normalize(toEye + frame.moon.xyz);
	let moonRaw = clamp(dot(normal, moonHalf), 0.0, 1.0);
	let moonUp = clamp(dot(sea.up.xyz, frame.moon.xyz) * 6.0, 0.0, 1.0);
	let moonPath = smoothstep(0.975, 0.995, moonRaw);
	tint += MOON_ON_WATER * (moonPath * frame.moon.w * moonUp * (1.0 - day));

	// Foam on the crests, banded rather than faded, so it reads as drawn.
	// The crest reading is one number a vertex, so a band of it drawn
	// straight has the straight edges of the triangle it was interpolated
	// over. Moving the edge by a noise field a metre or so across gives it
	// the ragged outline foam has.
	let ragged = vnoise3(dir * (6.28318530718 * sea.up.w / 3.0)) * 0.05 * strength;
	let line = 1.0 - sea.wave.w * 0.6 + ragged;
	let foam = smoothstep(line, line + 0.06, in.crest);
	tint = mix(tint, vec3f(0.95, 0.98, 1.0), foam * sea.wave.w);

	// Lit by the same sun the ground takes, and never black at night. The
	// shadow takes the sun's share of it and leaves the sky's, the way it
	// does on land.
	let sunlit = clamp(dot(normal, frame.sun.xyz), 0.0, 1.0) * lit;
	let shade = mix(frame.night.y, 0.55 + 0.45 * sunlit, day);
	let alpha = mix(sea.look.x, 1.0, through);
	return vec4f(tint * shade, alpha);
}
`;
