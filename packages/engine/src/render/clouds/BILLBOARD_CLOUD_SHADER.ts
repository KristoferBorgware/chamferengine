import { WIND_AXIS } from "../../sky/WIND_AXIS.js";

const axis = WIND_AXIS;

/**
 * A billboard cloud: a flat hexagon turned to face the eye, drifting about
 * {@link WIND_AXIS} at its own rate.
 *
 * A vertex carries its puff's placement whole -- the un-rotated direction, the
 * radius and the drift rate -- so the wind is one uniform (elapsed seconds)
 * and every puff turns on the GPU, in the vertex shader, rather than a buffer
 * rebuilt on the CPU as the volumetric clouds' is. The camera-facing basis is
 * built from `frame.eye` the same way every frame, so nothing about a facing
 * is cached across one.
 *
 * Positions are absolute, as the volumetric clouds' are, because the sky has
 * no chunks in it.
 */
export const BILLBOARD_CLOUD_SHADER = /* wgsl */ `
struct Frame {
	viewProj : mat4x4f,
	eye      : vec4f,
	sun      : vec4f,
	fog      : vec4f,
	night    : vec4f,
};
@group(0) @binding(0) var<uniform> frame : Frame;

struct Wind {
	time : f32,
};
@group(1) @binding(0) var<uniform> wind : Wind;

const WIND_AXIS = vec3f(${axis.x}, ${axis.y}, ${axis.z});

fn rotateAboutWind(p : vec3f, angle : f32) -> vec3f {
	let c = cos(angle);
	let s = sin(angle);
	return p * c + cross(WIND_AXIS, p) * s + WIND_AXIS * dot(WIND_AXIS, p) * (1.0 - c);
}

struct PuffOut {
	@builtin(position) clip  : vec4f,
	@location(0)       cover : f32,
};

@vertex
fn vertexMain(
	@location(0) direction : vec3f,
	@location(1) corner    : vec2f,
	@location(2) size      : f32,
	@location(3) cover     : f32,
	@location(4) radius    : f32,
	@location(5) windRate  : f32,
) -> PuffOut {
	let turned = rotateAboutWind(direction, wind.time * windRate);
	let center = turned * radius;

	let toEye = normalize(frame.eye.xyz - center);
	var right = cross(vec3f(0.0, 1.0, 0.0), toEye);
	if (dot(right, right) < 1e-6) {
		right = vec3f(1.0, 0.0, 0.0);
	}
	right = normalize(right);
	let up = cross(toEye, right);
	let position = center + right * (corner.x * size) + up * (corner.y * size);

	var out : PuffOut;
	out.clip = frame.viewProj * vec4f(position, 1.0);
	out.cover = cover;
	return out;
}

@fragment
fn fragmentMain(in : PuffOut) -> @location(0) vec4f {
	let day = frame.night.x;
	let shade = mix(frame.night.y, 1.0, day);
	return vec4f(vec3f(0.97, 0.97, 1.0) * shade, clamp(in.cover, 0.0, 1.0) * 0.8);
}
`;
