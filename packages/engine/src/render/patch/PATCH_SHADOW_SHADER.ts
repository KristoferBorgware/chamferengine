/**
 * The depth pass the landscape bench's shadows are read from.
 *
 * **Position and nothing else.** A shadow map records how far the nearest
 * surface is along the light, so every other channel a patch vertex carries --
 * the colour, the four layers, the speckle -- is work the pass would do and
 * throw away. There is no fragment stage at all: the depth attachment is the
 * whole output.
 *
 * The same vertex buffer the world pass draws, at the same stride, so nothing
 * is uploaded twice and the two can never describe different geometry.
 */
export const PATCH_SHADOW_SHADER = /* wgsl */ `
@group(0) @binding(0) var<uniform> lightViewProj : mat4x4f;

@vertex
fn vertexMain(@location(0) position : vec3f) -> @builtin(position) vec4f {
	return lightViewProj * vec4f(position, 1.0);
}
`;
