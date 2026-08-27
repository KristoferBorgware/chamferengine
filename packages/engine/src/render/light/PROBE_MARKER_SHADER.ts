/**
 * A chunk's light probes, drawn as little spheres where they actually stand.
 *
 * **A probe volume is invisible, and everything about it is a guess until it
 * is not.** Whether the grid lands where the geometry is, whether a hollow
 * fills from its opening, whether the direction a probe carries points at the
 * sky or into the rock -- none of that can be read off the lit picture,
 * because the lit picture is what it is supposed to explain. So the same
 * volume the terrain shader samples is drawn directly, at the same places,
 * from the same texture.
 *
 * **Nothing is kept on the CPU for this.** The volume is transferred to the
 * GPU and the copy on this side is gone; the markers are one instanced draw
 * per chunk, and each instance works out from its own index which probe it
 * is, where that probe stands, and what it holds. What is drawn is therefore
 * the truth rather than a copy of it -- if the mapping from a position to a
 * probe is wrong, these are wrong in exactly the same way, which is what
 * makes them worth looking at.
 *
 * An octahedron rather than a sphere: eight triangles, no seams, and at the
 * size these are drawn nobody can tell the difference.
 */
export const PROBE_MARKER_SHADER = /* wgsl */ `
struct Frame {
	viewProj : mat4x4f,
	eye      : vec4f,
	sun      : vec4f,
	fog      : vec4f,
	night    : vec4f,
	sky      : vec4f,
	moon     : vec4f,
};
struct Chunk {
	origin    : vec4f,
	probeGrid : vec4f,
	probeA    : vec4f,
	probeB    : vec4f,
	probeC    : vec4f,
	cornerA   : vec4f,
	cornerB   : vec4f,
	cornerC   : vec4f,
};
@group(0) @binding(0) var<uniform> frame : Frame;
@group(1) @binding(0) var<uniform> chunk : Chunk;
@group(1) @binding(1) var probeVolume : texture_3d<f32>;
@group(1) @binding(2) var probeSample : sampler;

struct MarkerOut {
	@builtin(position) clip  : vec4f,
	@location(0)       color : vec3f,
};

/** How much of the spacing one marker spans. */
const MARKER_SIZE = 0.22;

/** The six corners of an octahedron, as eight triangles. */
fn corner(vertex : u32) -> vec3f {
	var points = array<vec3f, 6>(
		vec3f(1.0, 0.0, 0.0), vec3f(-1.0, 0.0, 0.0),
		vec3f(0.0, 1.0, 0.0), vec3f(0.0, -1.0, 0.0),
		vec3f(0.0, 0.0, 1.0), vec3f(0.0, 0.0, -1.0),
	);
	var faces = array<u32, 24>(
		0u, 2u, 4u,  2u, 1u, 4u,  1u, 3u, 4u,  3u, 0u, 4u,
		2u, 0u, 5u,  1u, 2u, 5u,  3u, 1u, 5u,  0u, 3u, 5u,
	);
	return points[faces[vertex]];
}

@vertex
fn vertexMain(
	@builtin(vertex_index) vertex : u32,
	@builtin(instance_index) instance : u32,
) -> MarkerOut {
	var out : MarkerOut;
	let across = u32(max(1.0, chunk.probeGrid.y));
	let q = instance % across;
	let r = (instance / across) % across;
	let d = instance / (across * across);

	let spacing = max(1.0, chunk.probeGrid.x);
	let side = max(1.0, chunk.probeA.w);
	let cellQ = f32(q) * spacing;
	let cellR = f32(r) * spacing;
	let layer = chunk.probeGrid.w + f32(d) * spacing;

	// **Forward this time.** The terrain shader runs the corners backwards to
	// find a probe from a position; this runs them the way
	// \`latticePosition\` does, to put a probe where it belongs.
	let wb = cellQ / side;
	let wc = cellR / side;
	let wa = 1.0 - wb - wc;
	let dir = normalize(
		chunk.cornerA.xyz * wa + chunk.cornerB.xyz * wb + chunk.cornerC.xyz * wc);
	let radius = chunk.probeB.w - layer * chunk.probeC.w;
	let at = dir * radius;

	// Outside the triangle there is no probe, only the corner of the box the
	// texture had to be. Collapsed to a point, which draws nothing.
	if (wa < -0.001 || chunk.probeGrid.y < 0.5) {
		out.clip = vec4f(0.0, 0.0, 2.0, 1.0);
		out.color = vec3f(0.0);
		return out;
	}

	let uvw = vec3f(
		(cellQ / spacing + 0.5) / max(1.0, chunk.probeGrid.y),
		(cellR / spacing + 0.5) / max(1.0, chunk.probeGrid.y),
		((layer - chunk.probeGrid.w) / spacing + 0.5)
			/ max(1.0, chunk.probeGrid.z),
	);
	let carried = textureSampleLevel(probeVolume, probeSample, uvw, 0.0);

	let size = MARKER_SIZE * spacing * chunk.probeC.w;
	out.clip = frame.viewProj * vec4f(at + corner(vertex) * size, 1.0);
	// **Dark is a reading too.** A probe holding nothing is what a wall looks
	// like from the inside, so it is drawn rather than skipped -- deep blue
	// where no light reaches, white where all of it does. A ramp rather than
	// a brightness, or the ones that matter most would be the ones nobody can
	// see against the ground.
	out.color = mix(vec3f(0.05, 0.09, 0.35), vec3f(1.0, 0.98, 0.85), carried.a);
	return out;
}

@fragment
fn fragmentMain(in : MarkerOut) -> @location(0) vec4f {
	return vec4f(in.color, 1.0);
}
`;
