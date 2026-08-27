/**
 * How much of the sky a pixel can actually see, read off the depth buffer.
 *
 * Screen-space ambient occlusion. The mesher already bakes two occlusion
 * terms into every vertex -- how much sky the *column* stands under, and how
 * many solid neighbours a corner has -- and both are facts about the block
 * grid, decided before anything is on screen. Neither can see that one hill
 * stands in front of another, or that a placed wall now shades the ground a
 * metre from it, because at the moment they are computed there is no view.
 * This is the term that can.
 *
 * **It scales the ambient and never the direct sun.** A lit wall is lit
 * whatever stands beside it -- the sun either reaches it or does not, and the
 * cascades already answer that. Multiplying a whole pixel by an occlusion
 * factor is the common mistake and it draws dirt in the sunlight. So what
 * comes out of here is read inside the terrain shader and multiplied into the
 * sky's share alone.
 *
 * **Occlusion is measured against the tangent plane, never by comparing two
 * distances from the eye.** The obvious construction -- step off into a
 * hemisphere, project the step back onto the screen, and call it blocked
 * where the surface there is nearer the eye -- self-occludes: on any surface
 * seen at an angle, a step *along* the ground lands further from the eye than
 * where it started, so it counts as blocked. How much depends on which way
 * that particular sample happened to point, and each pixel turns its samples
 * differently, so a flat hillside comes out covered in hatching that no blur
 * can remove because it is signal rather than noise. What is asked instead is
 * whether a neighbouring surface stands **above the plane this surface lies
 * in**: a neighbour on the same flat ground is in that plane and contributes
 * nothing at all, however far away it is or however the samples were turned.
 *
 * That also makes the sampling simpler. There is no hemisphere to build and
 * nothing to project: the neighbours are read straight off the screen, and
 * how far to reach across it in pixels comes from how many metres one pixel
 * covers here, which the normal reconstruction already had to work out.
 *
 * **The normal is reconstructed, not stored.** There is no G-buffer here and
 * the terrain shader derives its own normal the same way, from how the world
 * position changes across a pixel -- so the two agree by construction. Plain
 * derivatives smear across a silhouette, where the position jumps from a near
 * surface to a far one, so each axis takes whichever of its two neighbours is
 * closer in depth: the near surface keeps its own normal at the edge instead
 * of borrowing the sky's.
 *
 * What is left is blurred before anything reads it, by a second pipeline in
 * this same file that refuses to blur across a depth step.
 */
export const SSAO_SHADER = /* wgsl */ `
struct Look {
	inverseViewProj : mat4x4f,
	viewProj        : mat4x4f,
	// xyz eye, w how far the occlusion reaches in metres
	eye             : vec4f,
	// x strength, y bias, z sample count, w blur radius in texels
	dial            : vec4f,
};
@group(0) @binding(0) var<uniform> look : Look;
@group(0) @binding(1) var sceneDepth : texture_depth_2d;
@group(0) @binding(2) var occlusion : texture_2d<f32>;

struct ScreenOut {
	@builtin(position) clip : vec4f,
};

@vertex
fn vertexMain(@builtin(vertex_index) index : u32) -> ScreenOut {
	var corners = array<vec2f, 3>(
		vec2f(-1.0, -3.0), vec2f(-1.0, 1.0), vec2f(3.0, 1.0));
	var out : ScreenOut;
	out.clip = vec4f(corners[index], 1.0, 1.0);
	return out;
}

/** Nothing was drawn at this pixel, so there is no surface to occlude. */
const NOTHING = 1.0;

/** The furthest across the screen a gather will reach, in pixels. */
const WIDEST = 64.0;

/**
 * The world point a pixel's depth stands at.
 *
 * The same reconstruction the air pass runs, for the same reason: a depth and
 * a matrix are the whole of what says where a surface is, and both passes
 * have to land on the same point or the light will not sit on the geometry.
 */
fn worldAt(at : vec2i, size : vec2f) -> vec3f {
	let written = textureLoad(sceneDepth, at, 0);
	let uv = (vec2f(at) + vec2f(0.5)) / size;
	let ndc = vec2f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
	let hit = look.inverseViewProj * vec4f(ndc, written, 1.0);
	return hit.xyz / hit.w;
}

/**
 * Turn a pattern by a different angle at every pixel.
 *
 * Jimenez's interleaved gradient noise, the same one the air pass dithers its
 * march with. Three constants and two fracts, distributed nearly as well as a
 * blue-noise texture and with no file to ship.
 */
fn turnAt(pixel : vec2f) -> f32 {
	return fract(52.9829189
		* fract(dot(pixel, vec2f(0.06711056, 0.00583715)))) * 6.2831853;
}

@fragment
fn occlusionMain(in : ScreenOut) -> @location(0) f32 {
	let at = vec2i(in.clip.xy);
	let size = vec2f(textureDimensions(sceneDepth));
	let bounds = vec2i(size) - vec2i(1);
	if (textureLoad(sceneDepth, at, 0) >= 1.0) { return NOTHING; }

	let here = worldAt(at, size);
	// **Each axis takes its closer neighbour.** A plain derivative straddles a
	// silhouette and returns the average of two surfaces metres apart, which
	// tilts the normal at every edge in the picture and rings it with light.
	let left = worldAt(clamp(at + vec2i(-1, 0), vec2i(0), bounds), size);
	let right = worldAt(clamp(at + vec2i(1, 0), vec2i(0), bounds), size);
	let down = worldAt(clamp(at + vec2i(0, -1), vec2i(0), bounds), size);
	let up = worldAt(clamp(at + vec2i(0, 1), vec2i(0), bounds), size);
	let acrossX = select(here - left, right - here,
		length(right - here) < length(here - left));
	let acrossY = select(here - down, up - here,
		length(up - here) < length(here - down));
	let normal = normalize(cross(acrossX, acrossY));
	// The reconstruction says nothing about which way is out, so the normal is
	// turned to face the eye -- every surface the camera can see does.
	let toEye = normalize(look.eye.xyz - here);
	let facing = normal * select(-1.0, 1.0, dot(normal, toEye) > 0.0);

	let reach = look.eye.w;
	// **How far to look, in pixels, from how much world one pixel covers.**
	// A fixed pixel radius would reach centimetres underfoot and hundreds of
	// metres at the horizon, so the same setting would mean a different thing
	// everywhere in one picture.
	let perPixel = max(0.0001, 0.5 * (length(acrossX) + length(acrossY)));
	let widest = clamp(reach / perPixel, 2.0, WIDEST);

	let bias = look.dial.y;
	let count = max(1.0, floor(look.dial.z));
	let turn = turnAt(in.clip.xy);
	var blocked = 0.0;
	for (var n = 0.0; n < count; n = n + 1.0) {
		// A spiral of screen offsets, turned per pixel, spread by the square
		// root of its share so the samples are even by area rather than
		// bunched at the centre.
		let spread = sqrt((n + 0.5) / count);
		let angle = turn + n * 2.3999632;
		let by = vec2i(vec2f(cos(angle), sin(angle)) * (spread * widest));
		let other = at + by;
		if (other.x < 0 || other.y < 0
			|| other.x > bounds.x || other.y > bounds.y) { continue; }
		if (textureLoad(sceneDepth, other, 0) >= 1.0) { continue; }

		let there = worldAt(other, size);
		let toward = there - here;
		let apart = length(toward);
		if (apart < 0.0001 || apart > reach) { continue; }
		// **How far above this surface's own plane that neighbour stands.**
		// Zero for anything lying in the plane, which is what flat ground
		// gives however the samples were turned -- so flat ground is exactly
		// open, with nothing left for a blur to have to hide.
		let rise = dot(toward / apart, facing);
		// Fades to nothing at the edge of the reach rather than stopping
		// there, or the occlusion would step wherever a neighbour crossed it.
		let fade = 1.0 - apart / reach;
		blocked = blocked + max(0.0, rise - bias) * fade;
	}
	let open = 1.0 - (blocked / count) * look.dial.x;
	return clamp(open, 0.0, 1.0);
}

@fragment
fn blurMain(in : ScreenOut) -> @location(0) f32 {
	let at = vec2i(in.clip.xy);
	let size = vec2i(textureDimensions(occlusion));
	let radius = i32(look.dial.w);
	// **Never across a depth step.** Two surfaces a pixel apart on screen and
	// metres apart in the world have nothing to say about each other, and
	// averaging them drags one surface's occlusion over the other's edge --
	// which is a halo. The window is what the reach spans, since that is the
	// distance this term is about at all.
	if (textureLoad(sceneDepth, at, 0) >= 1.0) { return NOTHING; }
	let here = worldAt(at, vec2f(size));
	let apart = look.eye.w;

	var total = 0.0;
	var weight = 0.0;
	for (var y = -radius; y <= radius; y = y + 1) {
		for (var x = -radius; x <= radius; x = x + 1) {
			let by = at + vec2i(x, y);
			if (by.x < 0 || by.y < 0 || by.x >= size.x || by.y >= size.y) {
				continue;
			}
			if (textureLoad(sceneDepth, by, 0) >= 1.0) { continue; }
			let there = worldAt(by, vec2f(size));
			if (length(there - here) > apart) { continue; }
			total = total + textureLoad(occlusion, by, 0).r;
			weight = weight + 1.0;
		}
	}
	return select(
		textureLoad(occlusion, at, 0).r, total / weight, weight > 0.0);
}
`;
