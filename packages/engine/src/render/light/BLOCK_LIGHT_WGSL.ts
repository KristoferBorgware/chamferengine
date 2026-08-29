/**
 * The light a source in the world casts, as WGSL a surface shader includes.
 *
 * It declares three bindings of group 2 and depends on nothing the including
 * shader has to hand it, so a pipeline reads it by binding a {@link LightViews}
 * and calling {@link blockLight} with a point and the normal of the face at it.
 */
export const BLOCK_LIGHT_WGSL = /* wgsl */ `
/**
 * Where the light stands and how its chart is read.
 *
 * \`rowA\`, \`rowB\` and \`rowC\` solve a direction into barycentric weights on
 * the source face's three corners, which is the same blend that turns a
 * lattice point into a position, run backwards. \`at\` is the source cell --
 * \`xyz\` its \`(i, j, layer)\` and \`w\` the subdivision \`n\` -- and \`look\` is the
 * chart's entries along one axis, the block size and the crust top radius.
 * \`tint\` is the light's color, with \`w\` its strength and \`0\` for no light.
 */
struct BlockLight {
	rowA : vec4f,
	rowB : vec4f,
	rowC : vec4f,
	at   : vec4f,
	look : vec4f,
	tint : vec4f,
};
@group(2) @binding(6) var<uniform> lamp : BlockLight;
@group(2) @binding(7) var lampMap : texture_3d<f32>;
@group(2) @binding(8) var lampSample : sampler;

/**
 * How much of the light reaches a face, as a color.
 *
 * A level belongs to a cell of air, not to the rock around it, so the read is
 * taken half a block out along the face's own normal -- into the cell the
 * light actually crossed to get here. That is also what gives a lit room its
 * shape with no direction in the light at all: a floor, a wall and a ceiling
 * of one cell read three different neighbours.
 *
 * Finding the entry is one 3x3 solve and one division. The weights of a
 * direction on the source's face give the fractional lattice coordinate
 * \`(n * w.y, n * w.z)\` directly, and subtracting the source's own leaves the
 * chart's \`(di, dj)\`; the radius gives the layer against the crust top. A
 * coordinate that leaves the face keeps counting -- a lattice point is integer
 * weights on global vertex numbers, so the face's chart extends past its own
 * edges and names the cells over there correctly.
 *
 * \`textureSampleLevel\` rather than \`textureSample\`, because the read sits
 * under a test on where the point landed and a sampler that picks its own
 * level may not.
 */
fn blockLight(world : vec3f, normal : vec3f) -> vec3f {
	if (lamp.tint.w <= 0.0) { return vec3f(0.0); }
	let block = lamp.look.y;
	let at = world + normal * (block * 0.5);
	let dir = normalize(at);
	let wa = dot(lamp.rowA.xyz, dir);
	let wb = dot(lamp.rowB.xyz, dir);
	let wc = dot(lamp.rowC.xyz, dir);
	let sum = wa + wb + wc;
	let n = lamp.at.w;
	// The layer's own centre sits half a block under the radius the layer
	// starts at, so the half turns a layer index into the coordinate a cell
	// centre stands at and the chart's entries land on whole numbers.
	let step = vec3f(
		n * wb / sum - lamp.at.x,
		n * wc / sum - lamp.at.y,
		(lamp.look.w - length(at)) / block - 0.5 - lamp.at.z,
	);
	let side = lamp.look.x;
	let uvw = (step + (side - 1.0) * 0.5 + 0.5) / side;
	let inside = all(uvw > vec3f(0.0)) && all(uvw < vec3f(1.0));
	let level = textureSampleLevel(lampMap, lampSample, uvw, 0.0).r;
	return lamp.tint.rgb * (lamp.tint.w * level * f32(inside));
}
`;
