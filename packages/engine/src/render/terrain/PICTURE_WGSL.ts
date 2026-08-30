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
`;
