/**
 * The first-light shader: one flat colour per cell, shaded by a fixed light.
 *
 * The normal comes from the vertex position rather than a stored attribute,
 * because every position on this sphere is already its own outward direction.
 */
export const LATTICE_SHADER = /* wgsl */ `
struct Uniforms {
	viewProj : mat4x4f,
	tint     : vec4f,
};
@group(0) @binding(0) var<uniform> u : Uniforms;

struct VertexOut {
	@builtin(position) clip   : vec4f,
	@location(0)       colour : vec3f,
	@location(1)       normal : vec3f,
};

@vertex
fn vertexMain(
	@location(0) position : vec3f,
	@location(1) colour   : vec3f,
) -> VertexOut {
	var out : VertexOut;
	out.clip = u.viewProj * vec4f(position, 1.0);
	out.colour = colour;
	out.normal = normalize(position);
	return out;
}

@fragment
fn fragmentMain(in : VertexOut) -> @location(0) vec4f {
	let toLight = normalize(vec3f(0.45, 0.75, 0.5));
	let lambert = clamp(dot(normalize(in.normal), toLight), 0.0, 1.0);
	let shade = 0.32 + 0.68 * lambert;
	return vec4f(in.colour * shade * u.tint.rgb, u.tint.a);
}
`;
