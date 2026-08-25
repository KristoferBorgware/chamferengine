/**
 * The terrain's shadow on the air, as WGSL the atmosphere pass includes.
 *
 * **Nothing shadows the air, so a low sun glows through a mountain.** Every
 * in-scattering sample along a view ray asks whether the sun reaches it, and
 * the only thing that could answer no was the planet's own sphere -- terrain
 * is invisible to a ball test. So the column of air in front of a ridge was
 * lit as though the ridge were not there, and with the haze thrown 30x
 * forward a low sun behind it painted a warm disc across its face.
 *
 * The coarse map answers the question everywhere on the planet, at one height
 * per cell, which is why it is here rather than a shadow map: a shadow map
 * holds what the sun can see from one box, and the box that would cover the
 * ground a hazy ray crosses is kilometres wide. This is the same walk the
 * ground shading used to run before the cascades replaced it, doing the job
 * the cascades cannot reach -- they carry 260 m and a ridge on the horizon is
 * kilometres off.
 *
 * **What makes it affordable is a ceiling.** No ground on the planet stands
 * above the tallest point of the map, so a sample already above that radius
 * cannot be shadowed by ground at all, and the walk from a sample below it
 * only has to run until it clears that radius -- which is one ray-sphere
 * solve, exact, and bounds every march on the planet to the same short
 * distance. Looking up, nothing marches. Looking at the horizon under a low
 * sun, everything does, which is the view this exists for.
 *
 * It declares its own bind group, so an including shader depends on nothing
 * beyond binding group 1 to a {@link GroundHeights}.
 */
export const AIR_SHADOW_WGSL = /* wgsl */ `
/**
 * The coarse height map, and the twenty transforms that read it.
 *
 * \`shape.x\` is how many lattice steps run along a face edge, \`shape.y\` is the
 * radius sea level sits at, \`shape.z\` is how much of the sun a shadow takes
 * away and \`shape.w\` is the radius the tallest ground on the planet reaches.
 */
struct Terrain {
	shape    : vec4f,
	centroid : array<vec4f, 20>,
	basis    : array<vec4f, 60>,
};
@group(1) @binding(0) var<uniform> terrain : Terrain;
@group(1) @binding(1) var heightMap : texture_2d_array<f32>;

/** Which of the twenty faces a direction falls in: the nearest centroid. */
fn faceOf(dir : vec3f) -> i32 {
	var best = 0;
	var bestDot = dot(dir, terrain.centroid[0].xyz);
	for (var f = 1; f < 20; f++) {
		let d = dot(dir, terrain.centroid[f].xyz);
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
		dot(terrain.basis[face * 3 + 0].xyz, dir),
		dot(terrain.basis[face * 3 + 1].xyz, dir),
		dot(terrain.basis[face * 3 + 2].xyz, dir)
	);
	return w / (w.x + w.y + w.z);
}

/**
 * The face a direction is in, checking the one it was last in first.
 *
 * A walk here reaches a kilometre or two and a face edge is thousands of
 * metres long, so it almost never leaves the face it started in. Testing that
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
	let n = terrain.shape.x;
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

/**
 * How many places along one sample's walk toward the sun the ground is read.
 *
 * **The whole feature's cost is this number times the in-scattering count**,
 * and both are texture reads a fragment, so it is small on purpose. The steps
 * grow rather than spacing evenly: a ridge a few hundred metres off is what
 * paints the glow this exists to remove, and a point high in the air needs
 * the far end of the walk instead, so the same six samples have to serve both.
 */
const AIR_SHADOW_STEPS = 6;

/** Where the walk starts, in metres out from the sample. */
const AIR_SHADOW_NEAR = 40.0;

/**
 * How sharply a near miss darkens, as one over the angle it may miss by.
 *
 * A ray that clears a ridge by a metre after a kilometre passed within a
 * thousandth of a radian of it, and the sun is half a degree wide, so it is
 * partly blocked. Dividing the clearance by the distance travelled is that
 * angle. The reciprocal is the width of the penumbra: 60 is a degree either
 * side, twice the sun's own half-degree.
 */
const AIR_SHADOW_SOFTNESS = 60.0;

/**
 * The sun heights the walk fades out between, as sines of an elevation.
 *
 * **A gentle world has almost nowhere for a shadow to fall.** Ground shades
 * itself only where its own slope beats the sun's height, and the shipped
 * ground runs 11.1 degrees at the median: measured over a 3,000 m patch,
 * 4.6% of it is in shadow at a 20 degree sun and 0.1% at 35. So a walk run
 * with the sun well up buys almost nothing and costs the same as one run at
 * dawn, and the fade between those two angles is what keeps the expense on
 * the hour of the day that has the artifact.
 *
 * It has to be a fade and not a switch: a threshold would draw its own edge
 * across the sky as the sun climbed through it.
 */
const AIR_SHADOW_LOW = 0.342;
const AIR_SHADOW_HIGH = 0.574;

/**
 * How much of the sun reaches a point in the air, with terrain in the way.
 *
 * \`hint\` is the face the ray started in, threaded through from the caller so
 * the twenty-way search runs once a pixel rather than once a sample.
 *
 * **The walk stops where the ray clears the tallest ground the planet has.**
 * Past that radius nothing can stand between a point and the sun, whatever
 * direction the sun is in, so the span is one ray-sphere solve against that
 * ceiling and a sample already above it costs nothing at all. That is what
 * makes a look at the sky free and holds a look at the horizon to a walk of a
 * couple of kilometres however low the sun is.
 */
fn terrainReach(point : vec3f, sun : vec3f, hint : i32) -> f32 {
	var strength = terrain.shape.z;
	if (strength <= 0.0) {
		return 1.0;
	}
	let r2 = dot(point, point);
	let b = dot(point, sun);
	// How high the sun stands over this sample's own place, which is the same
	// dot product the span below needs.
	strength = strength
		* (1.0 - smoothstep(AIR_SHADOW_LOW, AIR_SHADOW_HIGH, b * inverseSqrt(r2)));
	let ceiling = terrain.shape.w;
	if (strength <= 0.0 || r2 >= ceiling * ceiling) {
		return 1.0;
	}
	// Where |point + t * sun| reaches the ceiling. The point is inside it, so
	// the discriminant beats b * b and the root is positive whichever way the
	// sun points.
	let span = sqrt(max(0.0, b * b + ceiling * ceiling - r2)) - b;
	let near = min(AIR_SHADOW_NEAR, span * 0.5);
	if (near <= 0.0) {
		return 1.0;
	}

	let sea = terrain.shape.y;
	var face = faceNear(point, hint);
	let growth = pow(span / near, 1.0 / f32(AIR_SHADOW_STEPS));
	var t = near;
	var clear = 1.0;
	for (var s = 0; s < AIR_SHADOW_STEPS; s++) {
		let p = point + sun * t;
		let radius = length(p);
		let dir = p / radius;
		face = faceNear(dir, face);
		let above = radius - (sea + groundAt(dir, face));
		if (above < 0.0) {
			return 1.0 - strength;
		}
		clear = min(clear, above * AIR_SHADOW_SOFTNESS / t);
		t = t * growth;
	}
	return 1.0 - strength * (1.0 - clamp(clear, 0.0, 1.0));
}
`;
