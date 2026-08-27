/**
 * What a chunk looks like from somewhere: a depth and nothing else.
 *
 * Written for the sun, and the camera asks the same question -- a screen-space
 * pass needs to know where the geometry is before the world is shaded, which is
 * this shader with the view matrix in place of the light's.
 *
 * There is no fragment stage. The only thing a shadow map holds is how far
 * the nearest surface is along the light, and the depth attachment records
 * that on its own, so a colour that would be computed and thrown away is
 * never computed.
 *
 * Positions arrive chunk-relative and the origin is added here, exactly as in
 * the pass that draws the world. The light matrix has the camera folded into
 * it the same way the view matrix does, so the sum never has to represent a
 * point far from the viewer.
 */
export const CASCADE_SHADER = /* wgsl */ `
struct Light {
	toLight : mat4x4f,
};
struct Chunk {
	origin : vec4f,
};
@group(0) @binding(0) var<uniform> light : Light;
@group(1) @binding(0) var<uniform> chunk : Chunk;

@vertex
fn vertexMain(@location(0) position : vec3f) -> @builtin(position) vec4f {
	return light.toLight * vec4f(position + chunk.origin.xyz, 1.0);
}
`;
