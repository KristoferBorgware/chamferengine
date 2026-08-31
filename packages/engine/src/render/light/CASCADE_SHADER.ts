import { ALPHA_CUT } from "../terrain/ALPHA_CUT.js";
import { PICTURE_WGSL } from "../terrain/PICTURE_WGSL.js";

/**
 * What a chunk looks like from the sun: a depth and nothing else.
 *
 * The ordinary entry has no fragment stage. The only thing a shadow map holds
 * is how far the nearest surface is along the light, and the depth attachment
 * records that on its own, so a colour that would be computed and thrown away
 * is never computed.
 *
 * **A cutout has to be a second pipeline, and the shadow is why.** A leaf
 * drawn with holes in it and shadowing as a solid cube is worse than either:
 * the tree is see-through and the ground under it is not, and a canopy of
 * separate leaves throws one flat black disc. So the second entry samples the
 * same picture the world pass does, at the same threshold, and throws away the
 * pixels the picture has no leaf at -- a fragment stage that writes nothing
 * but decides whether the depth is written.
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

@group(2) @binding(0) var blockMap : texture_2d_array<f32>;
@group(2) @binding(1) var blockSample : sampler;
${PICTURE_WGSL(2)}

/** How much of a picture has to be there for its pixel to cast a shadow. */
const ALPHA_CUT : f32 = ${ALPHA_CUT};

struct CutoutOut {
	@builtin(position) clip : vec4f,
	@location(0) uv : vec2f,
	@location(1) @interpolate(flat) layer : i32,
};

@vertex
fn cutoutVertex(
	@location(0) position : vec3f,
	@location(3) uv       : vec2f,
	@location(4) layers   : vec2f,
) -> CutoutOut {
	var out : CutoutOut;
	out.clip = light.toLight * vec4f(position + chunk.origin.xyz, 1.0);
	out.uv = uv;
	// The block's own picture. The band over a wall's brink is not read here:
	// it lies on ground that is opaque underneath it, so it can neither add a
	// shadow nor take one away.
	out.layer = i32(layers.x);
	return out;
}

@fragment
fn cutoutFragment(in : CutoutOut) {
	// Unconditionally, and clamped, for the reason the world pass gives: a
	// per-vertex layer is not uniform across the draw, and a sample picks its
	// own mip from how the coordinate changes between neighbouring pixels.
	let place = placeOf(in.layer);
	// A picture that is not stored shadows as a solid block: a flat colour has
	// no holes, so guessing it has any would light a canopy through gaps that
	// are not there.
	let sampled = samplePicture(
		blockMap, blockSample, in.uv, place, dpdx(in.uv), dpdy(in.uv));
	let there = select(1.0, sampled.a, isStored(place));
	if (in.layer >= 0 && there < ALPHA_CUT) {
		discard;
	}
}
`;
