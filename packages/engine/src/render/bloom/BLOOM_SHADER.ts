/**
 * Glare, as a chain of blurs at falling resolutions.
 *
 * **A bright thing on a screen is not bright; it is white.** A screen's white
 * and a cloud's white are the same pixel, so the only thing left to say "that
 * one is the sun" is what it does to everything around it -- the spill across
 * a lens and across an eye. That spill is this pass, and without it a sun
 * drawn at any brightness is a flat coin of the lightest colour available.
 *
 * The blur is wide and it is cheap, because it is taken at falling
 * resolutions rather than with a wide kernel: six halvings reach a radius no
 * single pass would pay for, and each one costs a quarter of the last. Down
 * with a thirteen-tap filter that cannot flicker, up with a three-by-three
 * tent that adds back into the level above it.
 *
 * `bloom.x` is the threshold, `bloom.y` the softness of its knee, `bloom.z`
 * how much of the result is added back, and `bloom.w` the texel size for the
 * level being read.
 */
export const BLOOM_SHADER = /* wgsl */ `
struct Bloom {
	bloom : vec4f,
};
@group(0) @binding(0) var<uniform> bloom : Bloom;
@group(0) @binding(1) var source : texture_2d<f32>;
@group(0) @binding(2) var samp : sampler;

struct BloomOut {
	@builtin(position) clip : vec4f,
	@location(0) uv : vec2f,
};

@vertex
fn vertexMain(@builtin(vertex_index) index : u32) -> BloomOut {
	var corners = array<vec2f, 3>(
		vec2f(-1.0, -3.0), vec2f(-1.0, 1.0), vec2f(3.0, 1.0));
	var out : BloomOut;
	let p = corners[index];
	out.clip = vec4f(p, 0.0, 1.0);
	// Clip space runs bottom-up and a texture runs top-down, so the vertical
	// axis is flipped once here rather than in every fragment below.
	out.uv = vec2f(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
	return out;
}

/**
 * What is bright enough to spill, with a soft shoulder at the threshold.
 *
 * A hard cut-off makes an edge crawl: a pixel wandering either side of the
 * threshold pops the whole blur on and off. The knee spends a little range
 * either side fading it in instead, which is what stops a bright rim
 * flickering as the camera moves.
 */
fn bright(color : vec3f) -> vec3f {
	let lum = max(color.r, max(color.g, color.b));
	let knee = max(1e-4, bloom.bloom.y);
	let soft = clamp((lum - bloom.bloom.x + knee) / (2.0 * knee), 0.0, 1.0);
	let over = max(lum - bloom.bloom.x, knee * soft * soft);
	return color * (over / max(1e-4, lum));
}

/**
 * Thirteen taps in a ring, averaged in four overlapping squares.
 *
 * A plain box filter halved six times turns a single very bright pixel into a
 * flickering blob, because which texel it lands in changes as the camera
 * moves. Averaging in overlapping groups spreads one bright sample across
 * four of the four-tap boxes, so the total it contributes stops depending on
 * where inside a texel it fell.
 */
@fragment
fn downsampleMain(in : BloomOut) -> @location(0) vec4f {
	let t = bloom.bloom.w;
	let uv = in.uv;

	let a = textureSampleLevel(source, samp, uv + vec2f(-2.0, -2.0) * t, 0.0).rgb;
	let b = textureSampleLevel(source, samp, uv + vec2f( 0.0, -2.0) * t, 0.0).rgb;
	let c = textureSampleLevel(source, samp, uv + vec2f( 2.0, -2.0) * t, 0.0).rgb;
	let d = textureSampleLevel(source, samp, uv + vec2f(-1.0, -1.0) * t, 0.0).rgb;
	let e = textureSampleLevel(source, samp, uv + vec2f( 1.0, -1.0) * t, 0.0).rgb;
	let f = textureSampleLevel(source, samp, uv + vec2f(-2.0,  0.0) * t, 0.0).rgb;
	let g = textureSampleLevel(source, samp, uv, 0.0).rgb;
	let h = textureSampleLevel(source, samp, uv + vec2f( 2.0,  0.0) * t, 0.0).rgb;
	let i = textureSampleLevel(source, samp, uv + vec2f(-1.0,  1.0) * t, 0.0).rgb;
	let j = textureSampleLevel(source, samp, uv + vec2f( 1.0,  1.0) * t, 0.0).rgb;
	let k = textureSampleLevel(source, samp, uv + vec2f(-2.0,  2.0) * t, 0.0).rgb;
	let l = textureSampleLevel(source, samp, uv + vec2f( 0.0,  2.0) * t, 0.0).rgb;
	let m = textureSampleLevel(source, samp, uv + vec2f( 2.0,  2.0) * t, 0.0).rgb;

	var sum = (d + e + i + j) * 0.125;
	sum += (a + b + g + f) * 0.03125;
	sum += (b + c + h + g) * 0.03125;
	sum += (f + g + l + k) * 0.03125;
	sum += (g + h + m + l) * 0.03125;
	return vec4f(sum, 1.0);
}

/** The first halving, which is also where the threshold is applied. */
@fragment
fn prefilterMain(in : BloomOut) -> @location(0) vec4f {
	let t = bloom.bloom.w;
	let uv = in.uv;
	var sum = bright(textureSampleLevel(source, samp, uv + vec2f(-1.0, -1.0) * t, 0.0).rgb);
	sum += bright(textureSampleLevel(source, samp, uv + vec2f( 1.0, -1.0) * t, 0.0).rgb);
	sum += bright(textureSampleLevel(source, samp, uv + vec2f(-1.0,  1.0) * t, 0.0).rgb);
	sum += bright(textureSampleLevel(source, samp, uv + vec2f( 1.0,  1.0) * t, 0.0).rgb);
	return vec4f(sum * 0.25, 1.0);
}

/** A three-by-three tent, added into the level above. */
@fragment
fn upsampleMain(in : BloomOut) -> @location(0) vec4f {
	let t = bloom.bloom.w;
	let uv = in.uv;
	var sum = textureSampleLevel(source, samp, uv + vec2f(-1.0, -1.0) * t, 0.0).rgb;
	sum += textureSampleLevel(source, samp, uv + vec2f( 0.0, -1.0) * t, 0.0).rgb * 2.0;
	sum += textureSampleLevel(source, samp, uv + vec2f( 1.0, -1.0) * t, 0.0).rgb;
	sum += textureSampleLevel(source, samp, uv + vec2f(-1.0,  0.0) * t, 0.0).rgb * 2.0;
	sum += textureSampleLevel(source, samp, uv, 0.0).rgb * 4.0;
	sum += textureSampleLevel(source, samp, uv + vec2f( 1.0,  0.0) * t, 0.0).rgb * 2.0;
	sum += textureSampleLevel(source, samp, uv + vec2f(-1.0,  1.0) * t, 0.0).rgb;
	sum += textureSampleLevel(source, samp, uv + vec2f( 0.0,  1.0) * t, 0.0).rgb * 2.0;
	sum += textureSampleLevel(source, samp, uv + vec2f( 1.0,  1.0) * t, 0.0).rgb;
	return vec4f(sum * (1.0 / 16.0), 1.0);
}

/** The finished glare, added back over the picture it came from. */
@fragment
fn compositeMain(in : BloomOut) -> @location(0) vec4f {
	let glare = textureSampleLevel(source, samp, in.uv, 0.0).rgb;
	return vec4f(glare * bloom.bloom.z, 1.0);
}
`;
