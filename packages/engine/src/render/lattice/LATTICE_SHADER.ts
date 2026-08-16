/**
 * The first-light shader: one flat color per cell, shaded by a fixed light.
 *
 * The normal comes from the vertex position rather than a stored attribute,
 * because every position on this sphere is already its own outward direction.
 *
 * `colorMix` chooses what a pass is drawing. At 0 each cell keeps its own
 * color, which is what the surface wants. At 1 the whole pass takes the tint,
 * which is what a translucent shell wants: a shell carrying per-cell colors is
 * invisible over the surface it covers, since it is tinting each cell with a
 * shade of itself.
 */
export const LATTICE_SHADER = /* wgsl */ `
struct Uniforms {
	viewProj  : mat4x4f,
	tint      : vec4f,
	eye       : vec4f,
	colorMix : f32,
};
@group(0) @binding(0) var<uniform> u : Uniforms;

struct VertexOut {
	@builtin(position) clip   : vec4f,
	@location(0)       color : vec3f,
	@location(1)       normal : vec3f,
	@location(2)       world  : vec3f,
};

@vertex
fn vertexMain(
	@location(0) position : vec3f,
	@location(1) color   : vec3f,
) -> VertexOut {
	var out : VertexOut;
	out.clip = u.viewProj * vec4f(position, 1.0);
	out.color = mix(color, u.tint.rgb, u.colorMix);
	out.normal = normalize(position);
	out.world = position;
	return out;
}

@fragment
fn fragmentMain(in : VertexOut) -> @location(0) vec4f {
	let normal = normalize(in.normal);
	let toLight = normalize(vec3f(0.45, 0.75, 0.5));
	let lambert = clamp(dot(normal, toLight), 0.0, 1.0);
	let shade = 0.32 + 0.68 * lambert;

	// A surface seen edge-on shows more of itself along the line of sight, so a
	// shell brightens toward its rim. Squaring keeps the middle clear.
	let toEye = normalize(u.eye.xyz - in.world);
	let facing = clamp(dot(normal, toEye), 0.0, 1.0);
	let rim = (1.0 - facing) * (1.0 - facing);

	// A pass drawing its own colors is opaque and takes none of this.
	let glass = u.colorMix;
	let lit = in.color * mix(shade, 0.55 + 0.45 * lambert, glass);
	let alpha = u.tint.a * mix(1.0, 0.25 + 0.75 * rim, glass);
	return vec4f(lit + in.color * rim * glass * 0.5, alpha);
}
`;
