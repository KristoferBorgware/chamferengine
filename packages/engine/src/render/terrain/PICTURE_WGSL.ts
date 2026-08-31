/**
 * Where a picture is, as the two shaders that read one both have to agree.
 *
 * **A vertex names a picture; it does not name a layer.** Those are the same
 * number while every picture has a layer to itself, and they stop being the
 * same the moment several share one -- which is what a device whose array-layer
 * limit is under the size of the set will need. Putting the question behind a
 * lookup means that change is a table the client fills differently, rather than
 * a change to the mesher, the vertex format, the pipelines or the draw calls.
 *
 * A place is `(layer, offsetU, offsetV, scale)`. Today the table is the
 * identity -- picture `n` is layer `n`, offset zero, scale one -- so the
 * arithmetic here is `uv * 1 + 0` and the frame is bit-identical to sampling
 * the layer directly.
 *
 * **The world pass and the sun's own pass must read the same table.** They
 * already share one bind group layout and one `ALPHA_CUT`, for the reason this
 * is shared too: a leaf lit through a hole its shadow does not have is what
 * happens when the two disagree about which texels a picture occupies. They
 * bind it at different group indices, which is the only thing that varies.
 */
export const PICTURE_WGSL = (group: number): string => /* wgsl */ `
@group(${group}) @binding(3) var<storage, read> places : array<vec4f>;

/** Where a picture sits, clamped because the read happens either way. */
fn placeOf(id : i32) -> vec4f {
	return places[max(id, 0)];
}

/**
 * A coordinate in a picture, moved onto the layer that picture lives on.
 *
 * **The repeat is the sampler's while a picture owns a layer, and ours when it
 * does not.** A wall merged down a column runs \`v\` past one so the block tiles
 * down it; with a layer to itself the sampler's own repeat does that, and the
 * scale is 1 so this is \`uv\` unchanged and the frame is what it always was.
 * Sharing a layer, a coordinate past one would walk into the picture stored
 * beside it, so it is folded back into its own tile first.
 */
fn onPicture(uv : vec2f, place : vec4f) -> vec2f {
	let own = select(uv, fract(uv), place.w < 1.0);
	return own * place.w + place.yz;
}

/**
 * The same, for a coordinate the sampler would have clamped rather than
 * repeated.
 *
 * **A wall has one brink and it is at the top**, which is what the band's own
 * sampler says by clamping. Clamping is to the LAYER's edge, so once several
 * pictures share a layer that reaches the picture stored below and a merged
 * wall grows a second brink. Held inside its own tile here instead.
 */
fn onBand(uv : vec2f, place : vec4f) -> vec2f {
	let own = select(uv, clamp(uv, vec2f(0.0), vec2f(1.0)), place.w < 1.0);
	return own * place.w + place.yz;
}

/** The layer a place names. */
fn layerOf(place : vec4f) -> i32 {
	return i32(place.x);
}

/**
 * A picture sampled with the gradients of its own **unwrapped** coordinate.
 *
 * **A wall merged down a column runs its coordinate past one and lets the
 * sampler tile.** That is free while a picture owns a whole layer, because the
 * sampler's own repeat does it. Once several pictures share a layer the repeat
 * has to be arithmetic -- and the derivative of a wrapped coordinate **spikes
 * at every wrap**, jumping from just under one back to zero between two
 * neighbouring pixels. A sampler choosing its own mip from that reads the jump
 * as an enormous rate of change and takes the coarsest level it has, so a
 * merged wall grows a blurred dark line along every block boundary. Gradients
 * taken before the wrap say what the rate actually is.
 *
 * **The gradients are taken by the CALLER and handed in, never worked out in
 * here.** A derivative is a difference across the pixel quad, and taking one
 * inside a called function -- of a value that arrived as a parameter -- does
 * not survive this toolchain: measured, \`dpdx\` moved in here blacks the ground
 * out entirely while the sky is untouched, and the same arithmetic at the call
 * site is bit-identical to letting the sampler work the mip out for itself,
 * \`0.00\` of 255 over 884,561 pixels. Constant gradients render correctly
 * either way, which is what says the values are what break rather than
 * \`textureSampleGrad\`. **Take a derivative where the pixel quad is, which is
 * the fragment's own body.**
 */
fn samplePicture(
	pictures : texture_2d_array<f32>,
	how : sampler,
	uv : vec2f,
	place : vec4f,
	ddx : vec2f,
	ddy : vec2f,
) -> vec4f {
	return textureSampleGrad(
		pictures,
		how,
		onPicture(uv, place),
		layerOf(place),
		ddx * place.w,
		ddy * place.w,
	);
}

/** A band sampled the same way, held inside its own tile rather than wrapped. */
fn sampleBand(
	pictures : texture_2d_array<f32>,
	how : sampler,
	uv : vec2f,
	place : vec4f,
	ddx : vec2f,
	ddy : vec2f,
) -> vec4f {
	return textureSampleGrad(
		pictures,
		how,
		onBand(uv, place),
		layerOf(place),
		ddx * place.w,
		ddy * place.w,
	);
}
`;
