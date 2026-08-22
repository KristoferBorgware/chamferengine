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
 * `night.x` is how far the sun is over this place's horizon, `night.y` is what
 * is left of the light when it is not, and `night.z` is how much of the light
 * comes from the sun rather than from the sky. `sky.rgb` is what the sky is
 * doing, which is the color of everything the sun does not reach directly.
 */
export const TERRAIN_SHADER = /* wgsl */ `
struct Frame {
	viewProj : mat4x4f,
	eye      : vec4f,
	sun      : vec4f,
	fog      : vec4f,
	night    : vec4f,
	sky      : vec4f,
};
struct Chunk {
	origin : vec4f,
};
/**
 * The coarse height map, and the twenty transforms that read it.
 *
 * \`shape.x\` is how many lattice steps run along a face edge, \`shape.y\` is the
 * radius sea level sits at, \`shape.z\` is how much direct sun a shadow takes
 * away and \`shape.w\` is how many metres a shadow ray looks along.
 */
struct Shadow {
	shape    : vec4f,
	centroid : array<vec4f, 20>,
	basis    : array<vec4f, 60>,
};
@group(0) @binding(0) var<uniform> frame : Frame;
@group(1) @binding(0) var<uniform> chunk : Chunk;
@group(2) @binding(0) var<uniform> shadow : Shadow;
@group(2) @binding(1) var heightMap : texture_2d_array<f32>;

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

/** Which of the twenty faces a direction falls in: the nearest centroid. */
fn faceOf(dir : vec3f) -> i32 {
	var best = 0;
	var bestDot = dot(dir, shadow.centroid[0].xyz);
	for (var f = 1; f < 20; f++) {
		let d = dot(dir, shadow.centroid[f].xyz);
		if (d > bestDot) {
			bestDot = d;
			best = f;
		}
	}
	return best;
}

/** Where a direction sits inside a face, as three weights summing to 1. */
fn weightsOn(face : i32, dir : vec3f) -> vec3f {
	let w = vec3f(
		dot(shadow.basis[face * 3 + 0].xyz, dir),
		dot(shadow.basis[face * 3 + 1].xyz, dir),
		dot(shadow.basis[face * 3 + 2].xyz, dir)
	);
	return w / (w.x + w.y + w.z);
}

/**
 * The face a direction is in, checking the one it was last in first.
 *
 * A shadow ray reaches a couple of kilometres and a face edge is 7,100 m
 * long, so a ray almost never leaves the face it started in. Testing that
 * face is three dot products; finding a new one is twenty.
 */
fn faceNear(dir : vec3f, hint : i32) -> i32 {
	let w = weightsOn(hint, dir);
	if (min(w.x, min(w.y, w.z)) >= 0.0) {
		return hint;
	}
	return faceOf(dir);
}

/** One lattice point of the map, in metres above sea level. */
fn mapAt(face : i32, i : i32, j : i32) -> f32 {
	return textureLoad(heightMap, vec2i(i, j), face, 0).x;
}

/**
 * How high the ground stands at a direction, in metres above sea level.
 *
 * The same blend the terrain generator reads the map with: the direction
 * gives a face and two fractional lattice coordinates, and the remainders
 * land in one of the two triangles a square of steps is cut into, which is
 * what decides the three corners.
 */
fn groundAt(dir : vec3f, face : i32) -> f32 {
	let w = weightsOn(face, dir);
	let n = shadow.shape.x;
	let fi = max(0.0, w.y * n);
	let fj = max(0.0, w.z * n);
	let i0 = i32(min(n - 1.0, floor(fi)));
	let j0 = i32(min(n - 1.0 - f32(i0), floor(fj)));
	let a = fi - f32(i0);
	let b = fj - f32(j0);
	if (a + b <= 1.0) {
		return (1.0 - a - b) * mapAt(face, i0, j0)
			+ a * mapAt(face, i0 + 1, j0)
			+ b * mapAt(face, i0, j0 + 1);
	}
	return (1.0 - b) * mapAt(face, i0 + 1, j0)
		+ (1.0 - a) * mapAt(face, i0, j0 + 1)
		+ (a + b - 1.0) * mapAt(face, i0 + 1, j0 + 1);
}

/** How many places along the ray the ground is looked at. */
const SHADOW_STEPS = 24;

/** Where the march starts, in metres out from the surface. */
const SHADOW_NEAR = 6.0;

/**
 * How far above the ground the march starts, in metres.
 *
 * The map is the terrain, so the two agree to within the block the height was
 * rounded into and the ramp the map draws across one of its own cells. Below
 * that the ray starts inside the ground it came from and everything shadows
 * itself.
 */
const SHADOW_LIFT = 3.0;

/**
 * How sharply a near miss darkens, as one over the angle it may miss by.
 *
 * A ray that clears a ridge by a metre after a kilometre passed within a
 * thousandth of a radian of it, and the sun is half a degree wide, so it is
 * partly blocked. Dividing the clearance by the distance is that angle, and
 * it gives a shadow a soft edge without a second sample.
 *
 * The reciprocal is the width of the penumbra: 60 is a degree either side,
 * twice the sun's own half-degree and narrow enough that open ground stays
 * open. At 24 it is 2.4 degrees, and ground sloping under a low sun sits in
 * partial shadow over whole hillsides.
 */
const SHADOW_SOFTNESS = 60.0;

/**
 * How much of the sun reaches a point, from the coarse map alone.
 *
 * A shadow is one question asked over and over: walk toward the sun, and does
 * the ground ever stand above the walk? The coarse map already answers it
 * everywhere on the planet, so this needs no second pass over the geometry
 * and nothing rendered from the sun's point of view.
 *
 * The steps grow, because the near ground has to be sampled finely enough to
 * catch the bank a few metres away and the far ground has to be reached at
 * all. The march starts on the **map's** own surface rather than on the block
 * the fragment belongs to: the two differ by the block the height was rounded
 * into, and a ray that starts under the map is in shadow from its first step.
 */
fn sunReach(world : vec3f, up : vec3f) -> f32 {
	let strength = shadow.shape.z;
	let sun = frame.sun.xyz;
	// A face turned away from the sun is not shadowed, it is unlit, and the
	// lambert term has already said so.
	if (strength <= 0.0 || dot(up, sun) <= 0.0) {
		return 1.0;
	}
	let sea = shadow.shape.y;
	var face = faceOf(up);
	let base = max(length(world), sea + groundAt(up, face)) + SHADOW_LIFT;
	let start = up * base;

	let reach = shadow.shape.w;
	let growth = pow(reach / SHADOW_NEAR, 1.0 / f32(SHADOW_STEPS));
	var t = SHADOW_NEAR;
	var clear = 1.0;
	for (var s = 0; s < SHADOW_STEPS; s++) {
		let p = start + sun * t;
		let r = length(p);
		let dir = p / r;
		face = faceNear(dir, face);
		let above = r - (sea + groundAt(dir, face));
		if (above < 0.0) {
			return 1.0 - strength;
		}
		clear = min(clear, above * SHADOW_SOFTNESS / t);
		t *= growth;
	}
	return 1.0 - strength * (1.0 - clamp(clear, 0.0, 1.0));
}

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
	ambient : f32,
	direct : f32,
) -> vec3f {
	let day = frame.night.x;
	var lambert = max(dot(normal, frame.sun.xyz), 0.0);
	// Whether anything stands between here and the sun. Asked only where the
	// sun would reach anyway, so a face already turned away costs nothing.
	if (lambert > 0.0) {
		lambert = lambert * sunReach(world, up);
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
	let skyLight = tint * (ambient * openness * day);
	let sunLight = sunColor(up) * (direct * lambert * day);
	// After dark the sky is what is left, and a face still sees more of it
	// looking up than looking down.
	let night = vec3f(frame.night.y * openness);
	return max(night, skyLight + sunLight);
}

@fragment
fn fragmentMain(in : VertexOut) -> @location(0) vec4f {
	let world = in.local + chunk.origin.xyz;
	let normal = faceNormal(in.local, frame.eye.xyz - world);
	// The two shares sum to 1, so flat ground under a noon sun reads the same
	// whatever the balance is and only what stands at an angle to the sun
	// moves.
	let direct = frame.night.z;
	let lit =
		in.color * lightOn(normal, normalize(in.up), world, 1.0 - direct, direct);

	// Under water the view fades toward the water's own color over the distance
	// in fog.w. Above the surface that distance is set far past the horizon,
	// so the same expression leaves the color alone.
	let murk = clamp(in.depth / frame.fog.w, 0.0, 1.0);
	return vec4f(mix(lit, frame.fog.rgb, murk), 1.0);
}

@fragment
fn waterMain(in : VertexOut) -> @location(0) vec4f {
	let world = in.local + chunk.origin.xyz;
	let normal = faceNormal(in.local, frame.eye.xyz - world);
	// Water takes less of its light from the sun than stone does: a look
	// reaches through it to whatever is under, and that is lit from the sky.
	let direct = frame.night.z * 0.78;
	let lit =
		in.color * lightOn(normal, normalize(in.up), world, 1.0 - direct, direct);
	let murk = clamp(in.depth / frame.fog.w, 0.0, 1.0);
	return vec4f(mix(lit, frame.fog.rgb, murk), 0.62);
}
`;
