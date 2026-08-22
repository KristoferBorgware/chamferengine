/**
 * The shadow march, as WGSL both the ground and the sea include.
 *
 * A shadow is one question asked over and over -- *is anything between this
 * point and the sun* -- and the coarse map already answers it everywhere on
 * the planet. Two shaders ask it, so the walk lives here rather than twice.
 *
 * It declares its own bind group and takes the sun as an argument, so it
 * depends on nothing a including shader has to provide beyond binding group 2
 * to a {@link SunShadow}.
 */
export const SHADOW_WGSL = /* wgsl */ `
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
@group(2) @binding(0) var<uniform> shadow : Shadow;
@group(2) @binding(1) var heightMap : texture_2d_array<f32>;

/**
 * The sun's own view of what stands near the camera.
 *
 * \`toLight\` is one matrix a cascade, \`reach.xyz\` is how far each carries from
 * the eye and \`reach.w\` is how far the last fades out over. \`look.xyz\` is how
 * much of the sun a cascade may take, and \`look.w\` is how many texels a
 * cascade holds along one side.
 */
struct Cascade {
	toLight : array<mat4x4f, 3>,
	reach   : vec4f,
	look    : vec4f,
};
@group(3) @binding(0) var<uniform> cascade : Cascade;
@group(3) @binding(1) var cascadeMap : texture_depth_2d_array;
@group(3) @binding(2) var cascadeDepth : sampler_comparison;
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
fn sunReach(world : vec3f, up : vec3f, sun : vec3f) -> f32 {
	let strength = shadow.shape.z;
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
 * How far a sample is pushed off the surface before the shadow map is read.
 *
 * A surface drawn into the shadow map records its own depth, so reading that
 * map at the same place asks whether a face is in front of itself -- and the
 * answer is a coin toss, which comes out as stripes across every lit surface.
 * Moving the sample along the face's own normal by rather more than one texel
 * of the cascade it is read from settles it, and it moves the sample sideways
 * rather than deeper, so a shadow stays attached to the thing casting it
 * instead of sliding out from under it.
 */
const CASCADE_LIFT = 1.7;

/** A last nudge in depth, for a face lying nearly along the light. */
const CASCADE_BIAS = 0.0006;

/**
 * How much of the sun the shadow maps say reaches a point.
 *
 * \`away\` is how far the point is from the eye, which is what picks the
 * cascade: the first covers a few tens of metres and each after it four times
 * the last. Past the furthest this returns 1 and the walk over the coarse map
 * is the only answer, so the two hand over rather than stopping.
 *
 * The read is nine comparisons rather than nine depths. A comparison sampler
 * answers *nearer than this?* per texel and averages the answers, so the
 * hardware's own filtering softens the edge instead of blurring the depths,
 * which would put a shadow halfway up a wall.
 */
fn cascadeReach(world : vec3f, normal : vec3f, away : f32) -> f32 {
	let strength = cascade.look.z;
	if (strength <= 0.0 || away > cascade.reach.z) {
		return 1.0;
	}
	var slot = 0;
	if (away > cascade.reach.x) { slot = 1; }
	if (away > cascade.reach.y) { slot = 2; }

	// One texel of the cascade this is read from, in metres. The matrix maps
	// its own half-width to 1, so the width is two over that scale.
	let side = length(vec3f(
		cascade.toLight[slot][0][0],
		cascade.toLight[slot][1][0],
		cascade.toLight[slot][2][0]
	));
	let texel = 2.0 / (max(1.0, cascade.look.w) * max(1e-6, side));
	let clip = cascade.toLight[slot] * vec4f(world + normal * (texel * CASCADE_LIFT), 1.0);
	let ndc = clip.xyz / clip.w;
	let uv = vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
	// Outside its own box, a cascade knows nothing and says so.
	if (ndc.z <= 0.0 || ndc.z >= 1.0
		|| uv.x <= 0.0 || uv.x >= 1.0 || uv.y <= 0.0 || uv.y >= 1.0) {
		return 1.0;
	}

	let step = 1.0 / max(1.0, cascade.look.w);
	let depth = ndc.z - CASCADE_BIAS;
	var lit = 0.0;
	for (var y = -1; y <= 1; y++) {
		for (var x = -1; x <= 1; x++) {
			lit += textureSampleCompareLevel(
				cascadeMap,
				cascadeDepth,
				uv + vec2f(f32(x), f32(y)) * step,
				slot,
				depth
			);
		}
	}
	lit = lit / 9.0;

	// The last cascade gives out at its own edge, and a shadow that stopped
	// there would stop along a line drawn across the ground.
	let fade = smoothstep(
		cascade.reach.z - max(1.0, cascade.reach.w),
		cascade.reach.z,
		away
	);
	return 1.0 - strength * (1.0 - lit) * (1.0 - fade);
}

/**
 * How much of the sun reaches a point, from both of the things that know.
 *
 * The walk over the coarse map reaches the horizon and knows only where the
 * ground is. The shadow maps reach as far as their boxes and know everything
 * that drew itself into them, a placed block and a moving thing included.
 * Each is the other's blind spot, so a point is as lit as the darker of the
 * two says it is.
 */
fn sunLight(world : vec3f, up : vec3f, sun : vec3f, normal : vec3f, away : f32) -> f32 {
	return min(sunReach(world, up, sun), cascadeReach(world, normal, away));
}
`;
