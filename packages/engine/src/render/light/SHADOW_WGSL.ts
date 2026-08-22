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
`;
