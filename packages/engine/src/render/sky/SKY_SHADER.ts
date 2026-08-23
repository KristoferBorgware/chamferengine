/**
 * What is behind the air: space, the stars in it, and the moon.
 *
 * **The scattering is not here any more.** A sky pass fills the pixels nothing
 * else covers, so air drawn in it exists only where the world does not -- no
 * haze over a distant mountain, and no shell around the planet seen from
 * outside, because every pixel of the planet was drawn over the sky rather
 * than through it. {@link ATMOSPHERE_SHADER} marches the air over the finished
 * frame instead, and what is left here is the backdrop it is marched against.
 *
 * Everything is in **world directions**, so the backdrop is fixed to the world
 * and not to the view. Walking turns a player's own up by `s/R` -- a full turn
 * over this planet's 10,681 m -- and stars fixed to the view would be carried
 * around the planet by the player.
 *
 * The moon is drawn at a distance rather than painted on. Walking to the far
 * side of the planet shifts it 1.9 degrees against the stars, which a painted
 * one cannot do.
 */
export const SKY_SHADER = /* wgsl */ `
struct Frame {
	viewProj : mat4x4f,
	eye      : vec4f,
	sun      : vec4f,
	fog      : vec4f,
	night    : vec4f,
};
struct Sky {
	inverseViewProj : mat4x4f,
	moon            : vec4f,
};
@group(0) @binding(0) var<uniform> frame : Frame;
@group(1) @binding(0) var<uniform> sky : Sky;

struct SkyOut {
	@builtin(position) clip : vec4f,
	@location(0)       ndc  : vec2f,
};

@vertex
fn vertexMain(@builtin(vertex_index) index : u32) -> SkyOut {
	// One triangle covering the screen, so every pixel gets a ray.
	var corners = array<vec2f, 3>(
		vec2f(-1.0, -3.0), vec2f(-1.0, 1.0), vec2f(3.0, 1.0));
	var out : SkyOut;
	out.clip = vec4f(corners[index], 1.0, 1.0);
	out.ndc = corners[index];
	return out;
}

/** A field of stars, fixed in world directions. */
fn stars(direction : vec3f) -> f32 {
	let grid = floor(direction * 340.0);
	var h = u32(i32(grid.x) * 374761393 + i32(grid.y) * 668265263 + i32(grid.z) * 1274126177);
	h = (h ^ (h >> 13u)) * 1274126177u;
	let value = f32((h ^ (h >> 16u)) & 0xffffffu) / 16777216.0;
	if (value < 0.9975) { return 0.0; }
	return (value - 0.9975) / 0.0025;
}

@fragment
fn fragmentMain(in : SkyOut) -> @location(0) vec4f {
	// The ray this pixel looks along, in world directions.
	let far = sky.inverseViewProj * vec4f(in.ndc, 1.0, 1.0);
	let near = sky.inverseViewProj * vec4f(in.ndc, 0.0, 1.0);
	let direction = normalize(far.xyz / far.w - near.xyz / near.w);

	let worldDirection = direction;

	// Space is black, and the air in front of it is another pass's business.
	var color = vec3f(0.0);
	// **The air in front cannot hide a star on its own.** It dims one by the
	// optical depth along the ray, which overhead is about a tenth -- and what
	// actually hides a star by day is a sky ten thousand times brighter than
	// it, which needs a dynamic range this picture does not carry. So the day
	// takes them out here, and the air is left to take out the rest near the
	// horizon, where its own depth is enough to do it.
	let dark = 1.0 - clamp(frame.night.x, 0.0, 1.0);
	color += vec3f(stars(worldDirection)) * dark * 0.9;

	let toMoon = dot(worldDirection, sky.moon.xyz);
	let moonEdge = cos(sky.moon.w);
	if (toMoon > moonEdge) {
		let rim = clamp((toMoon - moonEdge) / (1.0 - moonEdge), 0.0, 1.0);
		let lit = clamp(dot(sky.moon.xyz, frame.sun.xyz) * -0.5 + 0.5, 0.15, 1.0);
		color = mix(color, vec3f(0.92, 0.90, 0.84) * lit, smoothstep(0.0, 0.35, rim));
	}

	// Under water the sky is whatever the water lets through.
	color = mix(color, frame.fog.rgb, clamp(3000.0 / frame.fog.w, 0.0, 1.0) * step(frame.fog.w, 1000.0));
	return vec4f(color, 1.0);
}
`;
