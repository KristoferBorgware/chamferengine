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
const AXIS_C = vec3f(0.44, -0.52, 0.73);

/**
 * One band of water, folded at its own zero crossing.
 *
 * **A sine has a dome at the top and water does not.** One minus the
 * absolute value creases the wave where the sine crossed zero, and raising
 * that to a power past 1 pushes the broad part down: narrow crests standing
 * out of flat troughs, which is the shape of a real swell and the shape a
 * stylized sea is drawn with. It is the same fold the terrain's ridge knob
 * uses on its octaves, for the same reason -- a sum of smooth things is
 * smooth, and an absolute value is the only place an edge comes from.
 */
fn fold(phase : f32, chop : f32) -> f32 {
	return pow(1.0 - abs(sin(phase)), chop);
}

/** How high the water stands at a direction, in metres off the sea radius. */
fn swell(dir : vec3f, seconds : f32) -> f32 {
	// One turn of phase per wavelength around the planet, so the number a
	// person sets in metres is the number of metres between two crests.
	// A phase is a dot product, which is continuous over the whole sphere:
	// no seam to cross, no pole to pinch, and no patch of flat water where
	// a two-dimensional wave texture would have run out of parameterisation.
	let k = 6.28318530718 * sea.up.w / max(1.0, sea.wave.y);
	let speed = sea.wave.z;
	let chop = max(1.0, sea.look.w);
	var h = fold(dot(dir, AXIS_A) * k + seconds * speed, chop);
	h += 0.55 * fold(dot(dir, AXIS_B) * k * 1.7 - seconds * speed * 1.3, chop);
	h += 0.30 * fold(dot(dir, AXIS_C) * k * 3.1 + seconds * speed * 0.7, chop);
	// The fold runs 0 to 1 rather than -1 to 1, so centre it: the number a
	// person sets is trough to crest, and the still water line is halfway.
	return (h / 1.85 - 0.5) * sea.wave.x;
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
