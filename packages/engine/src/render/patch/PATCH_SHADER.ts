/**
 * The patch shader: one preview of the ground, and the pictures it can be
 * drawn as.
 *
 * Every picture is a branch here rather than a rebuild, because a vertex
 * carries all three numbers a picture can ask for -- the ground in metres, the
 * field before sea level was taken off it, and whichever control layer is being
 * shown. Choosing one is a uniform, so it costs a frame.
 *
 * The light is a fixed direction rather than the world's sun. This is a bench
 * for choosing numbers, and a bench with a moving light is one where the same
 * setting looks different at different times of day.
 */
export const PATCH_SHADER = /* wgsl */ `
struct View {
	viewProj : mat4x4f,
	sun      : vec4f,
	/** x: which picture. y: lines rather than surface. z: contour rings on. */
	mode     : vec4f,
	/** The two material lines in metres, and the field's own range here. */
	lines    : vec4f,
};
@group(0) @binding(0) var<uniform> view : View;

struct VertexOut {
	@builtin(position) clip   : vec4f,
	@location(0)       normal : vec3f,
	@location(1)       metres : f32,
	@location(2)       raw    : f32,
	@location(3)       layer  : f32,
};

@vertex
fn vertexMain(
	@location(0) position : vec3f,
	@location(1) normal   : vec3f,
	@location(2) metres   : f32,
	@location(3) raw      : f32,
	@location(4) layer    : f32,
) -> VertexOut {
	var out : VertexOut;
	out.clip = view.viewProj * vec4f(position, 1.0);
	out.normal = normal;
	out.metres = metres;
	out.raw = raw;
	out.layer = layer;
	return out;
}

/** A tint, lit by the fixed light and given the curve a screen expects. */
fn shade(tint : vec3f, normal : vec3f, ambient : f32) -> vec4f {
	let lit = ambient + (1.0 - ambient) * max(0.0, dot(normalize(normal), normalize(view.sun.xyz)));
	return vec4f(pow(tint * lit, vec3f(1.0 / 2.2)), 1.0);
}

@fragment
fn fragmentMain(in : VertexOut) -> @location(0) vec4f {
	if (view.mode.y > 0.5) {
		return vec4f(0.42, 0.82, 1.0, 1.0);
	}
	let picture = i32(view.mode.x);

	// The grey pictures answer a different question from the bands: they read
	// elevation everywhere rather than saying which of the four blocks stands
	// there, and Raw stops before sea level has been taken off the field.
	if (picture == 1) {
		let t = clamp((in.metres + 400.0) / 800.0, 0.0, 1.0);
		return shade(mix(vec3f(0.03, 0.03, 0.04), vec3f(1.0), t), in.normal, 0.28);
	}
	if (picture == 2) {
		let t = clamp(
			(in.raw - view.lines.z) / max(1e-6, view.lines.w - view.lines.z),
			0.0,
			1.0,
		);
		return shade(
			mix(vec3f(0.02, 0.04, 0.10), vec3f(1.0, 0.98, 0.90), t),
			in.normal,
			0.35,
		);
	}
	if (picture == 3) {
		// One control layer on its own, over its own full range: dark where it
		// says nothing, bright where it says most.
		return shade(
			mix(vec3f(0.04, 0.05, 0.09), vec3f(0.6, 0.85, 1.0), clamp(in.layer, 0.0, 1.0)),
			in.normal,
			0.45,
		);
	}

	var tint : vec3f;
	if (in.metres <= 0.0) {
		// Bare sand seen through water, because the ocean is a surface and
		// holds no blocks. What makes a deep blue is how much water a look
		// passes through to reach the floor.
		tint = mix(
			vec3f(0.76, 0.70, 0.50),
			vec3f(0.12, 0.32, 0.55),
			1.0 - exp(in.metres / 45.0),
		);
	} else if (in.metres < view.lines.x) {
		tint = vec3f(0.26, 0.44, 0.19);
	} else if (in.metres < view.lines.y) {
		tint = vec3f(0.42, 0.42, 0.45);
	} else {
		tint = vec3f(0.92, 0.94, 0.97);
	}
	if (view.mode.z > 0.5) {
		let into = fract(in.metres / 100.0) * 100.0;
		let edge = smoothstep(0.0, 3.0, into) * smoothstep(100.0, 97.0, into);
		tint *= mix(0.62, 1.0, edge);
	}
	return shade(tint, in.normal, 0.28);
}
`;
