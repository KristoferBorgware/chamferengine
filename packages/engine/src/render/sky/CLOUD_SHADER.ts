/**
 * Clouds: hexagons of the lattice, held at a radius above the ground.
 *
 * A cloud borrows the lattice and is not a cell. It has no address, so the
 * buffer it lives in is thrown away and refilled as the wind turns rather than
 * being updated in place.
 *
 * Positions are absolute here rather than relative to a chunk, because the sky
 * has no chunks in it.
 */
export const CLOUD_SHADER = /* wgsl */ `
struct Frame {
	viewProj : mat4x4f,
	eye      : vec4f,
	sun      : vec4f,
	fog      : vec4f,
	night    : vec4f,
};
@group(0) @binding(0) var<uniform> frame : Frame;

struct CloudOut {
	@builtin(position) clip  : vec4f,
	@location(0)       cover : f32,
	@location(1)       up    : vec3f,
};

@vertex
fn vertexMain(
	@location(0) position : vec3f,
	@location(1) cover    : f32,
) -> CloudOut {
	var out : CloudOut;
	out.clip = frame.viewProj * vec4f(position, 1.0);
	out.cover = cover;
	out.up = normalize(position);
	return out;
}

@fragment
fn fragmentMain(in : CloudOut) -> @location(0) vec4f {
	// Lit from above by the same sun the ground takes, and darker underneath.
	let lambert = clamp(dot(in.up, frame.sun.xyz), 0.0, 1.0);
	let day = frame.night.x;
	let shade = mix(frame.night.y, 0.45 + 0.55 * lambert, day);
	return vec4f(vec3f(0.97, 0.97, 1.0) * shade, clamp(in.cover, 0.0, 1.0) * 0.85);
}
`;
