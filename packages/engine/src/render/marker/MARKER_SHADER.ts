/**
 * A camera drawn as a solid box and a wire cone, in flat world-space colors.
 *
 * Shading is baked into the vertices, so the shader is a matrix multiply and a
 * pass-through: a marker is not part of the world and must not read as if it
 * were lit by the same sun, or it stops being legible against the ground at
 * dusk.
 *
 * Positions are absolute rather than relative to a chunk, as the clouds' are,
 * because a marker has no chunk. `float32` spacing at the worked planet's
 * 6,800 m radius is 0.49 mm, against a box some metres across.
 */
export const MARKER_SHADER = /* wgsl */ `
struct Frame {
	viewProj : mat4x4f,
	eye      : vec4f,
	sun      : vec4f,
	fog      : vec4f,
	night    : vec4f,
};
@group(0) @binding(0) var<uniform> frame : Frame;

struct MarkerOut {
	@builtin(position) clip  : vec4f,
	@location(0)       color : vec3f,
};

@vertex
fn vertexMain(
	@location(0) position : vec3f,
	@location(1) color    : vec3f,
) -> MarkerOut {
	var out : MarkerOut;
	out.clip = frame.viewProj * vec4f(position, 1.0);
	out.color = color;
	return out;
}

@fragment
fn fragmentMain(in : MarkerOut) -> @location(0) vec4f {
	return vec4f(in.color, 1.0);
}
`;
