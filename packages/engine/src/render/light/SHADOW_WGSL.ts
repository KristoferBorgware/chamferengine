/**
 * The shadow maps, as WGSL both the ground and the sea include.
 *
 * Two shaders read the sun's own view of what stands near the camera, so it
 * lives here rather than twice. It declares its own bind group and takes the
 * sun as an argument, so it depends on nothing an including shader has to
 * provide beyond binding group 2 to a {@link LightViews}.
 *
 * **The coarse-map march that used to live here is gone.** It walked toward
 * the sun over the 32 m height map and cost more than it gave once the
 * cascades existed to do the same job at the scale that is actually visible
 * -- a block shadowing its neighbour, which the coarse map was never fine
 * enough to draw in the first place. See F-074.
 */
export const SHADOW_WGSL = /* wgsl */ `
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
@group(2) @binding(0) var<uniform> cascade : Cascade;
@group(2) @binding(1) var cascadeMap : texture_depth_2d_array;
@group(2) @binding(2) var cascadeDepth : sampler_comparison;

/**
 * What the sun sees of the clouds.
 *
 * \`toLight\` is the one box, \`look.y\` is how much of the sun a cloud may take
 * and \`look.x\` is unused. There is one box and no cascades because a cloud
 * deck is kilometres wide and kilometres up: nothing about it is near, so
 * there is nothing to spend resolution on being near.
 */
struct CloudCover {
	toLight : mat4x4f,
	look    : vec4f,
};
@group(2) @binding(3) var<uniform> cloud : CloudCover;
@group(2) @binding(4) var cloudMap : texture_2d<f32>;
@group(2) @binding(5) var cloudSample : sampler;

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
 * the last. Past the furthest this returns 1 -- nothing here reaches the
 * horizon, only the ground a shadow map was actually drawn for.
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
 * How much of the sun the clouds leave, as what the coverage map holds.
 *
 * **A multiplier, not a minimum.** The ground shadows are a yes or a no --
 * the hill is either in the way or it is not -- so the darker of the two is
 * the answer. A cloud is neither: it thins toward its edge and two of them
 * stacked stop more than one, so the coverage is a *fraction of the light
 * left*, and a cloud shadow falling inside a hill's shadow takes its share of
 * what the hill already left rather than being ignored.
 *
 * The read is one filtered lookup. The map is metres to a texel and a cloud
 * edge is soft, so the hardware's own blend between texels is most of what
 * makes the edge of a cloud shadow look like the edge of a cloud.
 */
fn cloudReach(world : vec3f) -> f32 {
	let strength = cloud.look.y;
	if (strength <= 0.0) {
		return 1.0;
	}
	let clip = cloud.toLight * vec4f(world, 1.0);
	let ndc = clip.xyz / clip.w;
	let uv = vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
	// Outside the box there is no cloud recorded, which is not the same as
	// there being no cloud -- but the box is kilometres across and centred on
	// the player, so the ground outside it is past the horizon.
	if (uv.x <= 0.0 || uv.x >= 1.0 || uv.y <= 0.0 || uv.y >= 1.0) {
		return 1.0;
	}
	let cover = textureSampleLevel(cloudMap, cloudSample, uv, 0.0).r;
	return 1.0 - strength * clamp(cover, 0.0, 1.0);
}

/**
 * How much of the sun reaches a point, from the two things that know.
 *
 * The shadow maps reach as far as their own box and know everything that
 * drew itself into them, a placed block and a moving thing included; the
 * cloud cover reaches as far as its own, wider box. A point is as lit as the
 * darker of the two says it is.
 */
fn sunLight(world : vec3f, normal : vec3f, away : f32) -> f32 {
	return cascadeReach(world, normal, away) * cloudReach(world);
}
`;
