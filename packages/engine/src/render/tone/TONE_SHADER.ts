/**
 * The last thing a frame goes through: an exposure and a roll-off.
 *
 * The scene is drawn into a floating-point image where a value over 1 is a
 * surface brighter than white, which is what the sun on snow is. The screen
 * has no such value, so something has to decide what happens to it. Clipping
 * is what happens without this pass, and clipping is why a bright hillside
 * comes out as one flat patch of white with the shape gone out of it.
 *
 * `tone.x` is the exposure, `tone.y` is where the roll-off starts.
 */
export const TONE_SHADER = /* wgsl */ `
struct Tone {
	tone : vec4f,
};
@group(0) @binding(0) var<uniform> tone : Tone;
@group(0) @binding(1) var scene : texture_2d<f32>;

struct ToneOut {
	@builtin(position) clip : vec4f,
};

/**
 * One triangle covering the screen, from the vertex index alone.
 *
 * Bigger than the screen rather than two triangles meeting across it: a seam
 * down the middle of a full-screen pass is a line of pixels whose derivatives
 * are taken across the join, and there is no reason to have one.
 */
@vertex
fn vertexMain(@builtin(vertex_index) index : u32) -> ToneOut {
	var out : ToneOut;
	let x = f32((index << 1u) & 2u) * 2.0 - 1.0;
	let y = f32(index & 2u) * 2.0 - 1.0;
	out.clip = vec4f(x, y, 0.0, 1.0);
	return out;
}

/**
 * Everything under the knee passes through untouched; above it the curve
 * bends toward 1 and never reaches it.
 *
 * Applied to each channel rather than to the brightness, so a color the
 * exposure pushed past white loses its color as it goes -- which is what
 * makes the sun on water read as a white glint rather than a saturated blue
 * one.
 */
fn rolloff(x : vec3f, knee : f32) -> vec3f {
	let over = max(x - vec3f(knee), vec3f(0.0));
	let head = 1.0 - knee;
	return min(x, vec3f(knee)) + head * over / (over + vec3f(head));
}

@fragment
fn fragmentMain(in : ToneOut) -> @location(0) vec4f {
	// One texel of the scene per pixel of the screen, so the read is by
	// coordinate and there is no sampler and nothing to filter.
	let raw = textureLoad(scene, vec2i(in.clip.xy), 0).rgb;
	return vec4f(rolloff(raw * tone.tone.x, tone.tone.y), 1.0);
}
`;
