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

/** A coordinate in a picture, moved onto the layer that picture lives on. */
fn onPicture(uv : vec2f, place : vec4f) -> vec2f {
	return uv * place.w + place.yz;
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
 * at every wrap**, because it jumps from just under one back to zero between
 * two neighbouring pixels. A sampler choosing its own mip from that reads the
 * jump as a huge rate of change and picks the coarsest level it has, so a
 * merged wall grows a blurred dark line along every block boundary.
 *
 * Gradients taken before the wrap say what the rate actually is, so the mip is
 * the one the surface deserves. **Exact today and needed later**: the transform
 * is the identity, so these are the same numbers the sampler would have worked
 * out for itself.
 */
fn samplePicture(
	pictures : texture_2d_array<f32>,
	how : sampler,
	uv : vec2f,
	place : vec4f,
) -> vec4f {
	return textureSampleGrad(
		pictures,
		how,
		onPicture(uv, place),
		layerOf(place),
		dpdx(uv) * place.w,
		dpdy(uv) * place.w,
	);
}
`;
