/**
 * The last thing a frame goes through: an exposure and a filmic roll-off.
 *
 * The scene is drawn into a floating-point image where a value over 1 is a
 * surface brighter than white, which is what the sun on snow is. The screen
 * has no such value, so something has to decide what happens to it. Clipping
 * is what happens without this pass, and clipping is why a bright hillside
 * comes out as one flat patch of white with the shape gone out of it.
 *
 * `tone.x` is the one exposure knob, a plain multiplier with no other reading
 * of the scene behind it. The roll-off is the ACES filmic fit (Narkowicz):
 * everything bends toward white rather than being clipped to it, and nothing
 * else about the picture is guessed at -- there is no separate knee to place
 * and no auto-exposure reading the frame to decide what "dark" means.
 */
export const TONE_SHADER = /* wgsl */ `
struct Tone {
	tone : vec4f,
};
@group(0) @binding(0) var<uniform> tone : Tone;
@group(0) @binding(1) var scene : texture_2d<f32>;
@group(0) @binding(2) var samp : sampler;

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
 * The ACES filmic curve, fitted to a single rational function by Krzysztof
 * Narkowicz. Applied per channel rather than to the brightness, so a color
 * the exposure pushed past white loses its saturation as it goes -- which is
 * what makes the sun on water read as a white glint rather than a clipped
 * saturated blue one.
 */
fn aces(x : vec3f) -> vec3f {
	let a = 2.51;
	let b = 0.03;
	let c = 2.43;
	let d = 0.59;
	let e = 0.14;
	return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3f(0.0), vec3f(1.0));
}

/**
 * The scene at one output pixel, averaged over whatever it covers.
 *
 * **Supersampling is the one antialiasing a voxel world of hard edges really
 * answers to**, and it lands here because this is the pass that goes from the
 * image the world was drawn into to the canvas. A pixel covers a
 * \`scale x scale\` block of source texels; four linear taps, each at the
 * centre of a quarter of that block, average it. At a scale of exactly 2 the
 * taps land on texel centres and it is an exact four-texel box.
 *
 * At a scale of 1 the block is one texel and the read is a \`textureLoad\` --
 * exact, unfiltered, and bit-for-bit what it was before any of this existed.
 * Nothing is softened by a feature that is turned off.
 */
fn resolve(clip : vec2f) -> vec3f {
	let scale = tone.tone.y;
	if (scale <= 1.001) {
		return textureLoad(scene, vec2i(clip), 0).rgb;
	}
	let size = vec2f(textureDimensions(scene));
	let corner = floor(clip) * scale;
	let quarter = scale * 0.5;
	var sum = vec3f(0.0);
	for (var y = 0; y < 2; y++) {
		for (var x = 0; x < 2; x++) {
			let at = corner + (vec2f(f32(x), f32(y)) + 0.5) * quarter;
			sum += textureSampleLevel(scene, samp, at / size, 0.0).rgb;
		}
	}
	return sum * 0.25;
}

@fragment
fn fragmentMain(in : ToneOut) -> @location(0) vec4f {
	return vec4f(aces(resolve(in.clip.xy) * tone.tone.x), 1.0);
}
`;
