/**
 * The terrain shader: one flat color per vertex, a sun, and water fog.
 *
 * Vertex positions arrive relative to their own chunk's origin, which is what
 * keeps them inside the part of `float32` that resolves 122 micrometres. The
 * origin is added here, in `float32` as well, because the camera is subtracted
 * from it in the same instruction: the view matrix already has the eye position
 * folded in, so the sum never has to represent a point far from the viewer.
 *
 * Color carries the block, the face's direction and its occlusion, all baked by
 * the mesher. The sun is the one term left to the shader, and it is a dot
 * product against the surface normal, which on a sphere is the position itself.
 *
 * `fog.w` is the distance the view fades over. Above water it is set far past
 * the horizon, which leaves the same expression doing nothing.
 *
 * `night.x` is how far the sun is over this place's horizon and `night.y` is
 * what is left of the light when it is not.
 */
export const TERRAIN_SHADER = /* wgsl */ `
struct Frame {
	viewProj : mat4x4f,
	eye      : vec4f,
	sun      : vec4f,
	fog      : vec4f,
	night    : vec4f,
};
struct Chunk {
	origin : vec4f,
};
@group(0) @binding(0) var<uniform> frame : Frame;
@group(1) @binding(0) var<uniform> chunk : Chunk;

struct VertexOut {
	@builtin(position) clip   : vec4f,
	@location(0)       color  : vec3f,
	@location(1)       normal : vec3f,
	@location(2)       depth  : f32,
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
	out.normal = normalize(world);
	out.depth = length(world - frame.eye.xyz);
	return out;
}

/**
 * How much sun a surface takes, and how much of the sky it takes instead.
 *
 * The surface normal against the sun gives the direct term. The place's own up
 * against the sun decides whether the sun is over the horizon at all, which is
 * the whole of day and night: every point carries the answer in its position,
 * so there is no terminator to track and nothing to store.
 */
fn litBy(normal : vec3f, ambient : f32, direct : f32) -> f32 {
	let day = frame.night.x;
	let lambert = clamp(dot(normal, frame.sun.xyz), 0.0, 1.0);
	return mix(frame.night.y, ambient + direct * lambert, day);
}

@fragment
fn fragmentMain(in : VertexOut) -> @location(0) vec4f {
	let lit = in.color * litBy(normalize(in.normal), 0.30, 0.70);

	// Under water the view fades toward the water's own color over the distance
	// in fog.w. Above the surface that distance is set far past the horizon,
	// so the same expression leaves the color alone.
	let murk = clamp(in.depth / frame.fog.w, 0.0, 1.0);
	return vec4f(mix(lit, frame.fog.rgb, murk), 1.0);
}

@fragment
fn waterMain(in : VertexOut) -> @location(0) vec4f {
	let lit = in.color * litBy(normalize(in.normal), 0.45, 0.55);
	let murk = clamp(in.depth / frame.fog.w, 0.0, 1.0);
	return vec4f(mix(lit, frame.fog.rgb, murk), 0.62);
}
`;
