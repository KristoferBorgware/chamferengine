/**
 * How much of the sky a pixel can actually see, read off the depth buffer.
 *
 * Screen-space ambient occlusion. The mesher already bakes two occlusion
 * terms into every vertex -- how much sky the *column* stands under, and how
 * many solid neighbours a corner has -- and both are facts about the block
 * grid, decided before anything is on screen. Neither can see that one hill
 * stands in front of another, or that a placed wall now shades the ground a
 * metre from it, because at the moment they are computed there is no view.
 * This is the term that can: it asks, for the surface at this pixel, how much
 * of the hemisphere over it is filled by other surfaces the camera can also
 * see.
 *
 * **It scales the ambient and never the direct sun.** A lit wall is lit
 * whatever stands beside it -- the sun either reaches it or does not, and the
 * cascades already answer that. Multiplying a whole pixel by an occlusion
 * factor is the common mistake and it draws dirt in the sunlight. So what
 * comes out of here is read inside the terrain shader and multiplied into the
 * sky's share alone.
 *
 * **The normal is reconstructed, not stored.** There is no G-buffer here and
 * the terrain shader derives its own normal the same way, from how the world
 * position changes across a pixel -- so the two agree by construction. Plain
 * derivatives smear across a silhouette, where the position jumps from a near
 * surface to a far one, so each axis takes whichever of its two neighbours is
 * closer in depth: the near surface keeps its own normal at the edge instead
 * of borrowing the sky's.
 *
 * The occlusion is noisy by nature -- a handful of samples per pixel, turned
 * a different way at each one so the pattern does not repeat -- so it is
 * blurred before anything reads it, by a second pipeline in this same file
 * that refuses to blur across a depth step.
 */
export const SCREEN_AMBIENT_SHADER = /* wgsl */ `
struct Look {
	inverseViewProj : mat4x4f,
	viewProj        : mat4x4f,
	// xyz eye, w how far the hemisphere reaches in metres
	eye             : vec4f,
	// x strength, y bias in metres, z sample count, w blur radius in texels
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

/**
 * A direction spread evenly over the hemisphere around a normal.
 *
 * The sunflower spiral: the nth of a count, lifted off the surface by the
 * square root of its share so the samples are even by area rather than by
 * angle, and turned by the pixel's own offset so neighbouring pixels never
 * sample the same set.
 */
fn hemisphere(n : f32, count : f32, normal : vec3f, turn : f32) -> vec3f {
	let up = select(
		vec3f(0.0, 0.0, 1.0), vec3f(1.0, 0.0, 0.0), abs(normal.z) > 0.9);
	let across = normalize(cross(up, normal));
	let along = cross(normal, across);
	let rise = sqrt((n + 0.5) / count);
	let angle = turn + n * 2.3999632;
	let flat = sqrt(1.0 - rise * rise);
	return across * (cos(angle) * flat)
		+ along * (sin(angle) * flat)
		+ normal * rise;
}

@fragment
fn occlusionMain(in : ScreenOut) -> @location(0) f32 {
	let at = vec2i(in.clip.xy);
	let size = vec2f(textureDimensions(sceneDepth));
	if (textureLoad(sceneDepth, at, 0) >= 1.0) { return NOTHING; }

	let here = worldAt(at, size);
	// **Each axis takes its closer neighbour.** A plain derivative straddles a
	// silhouette and returns the average of two surfaces metres apart, which
	// tilts the normal at every edge in the picture and rings it with light.
	let left = worldAt(at + vec2i(-1, 0), size);
	let right = worldAt(at + vec2i(1, 0), size);
	let down = worldAt(at + vec2i(0, -1), size);
	let up = worldAt(at + vec2i(0, 1), size);
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
	let bias = look.dial.y;
	let count = max(1.0, floor(look.dial.z));
	let turn = turnAt(in.clip.xy);
	var blocked = 0.0;
	for (var n = 0.0; n < count; n = n + 1.0) {
		// Spread along the ray as well as over the hemisphere, so the samples
		// fill a solid volume rather than a shell: an occluder halfway out
		// counts as much as one at the rim.
		let step = hemisphere(n, count, facing, turn)
			* (reach * (0.25 + 0.75 * ((n + 0.5) / count)));
		let sampleAt = here + step;
		let clip = look.viewProj * vec4f(sampleAt, 1.0);
		if (clip.w <= 0.0) { continue; }
		let ndc = clip.xyz / clip.w;
		let uv = vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
		if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { continue; }
		let onScreen = vec2i(uv * size);
		if (textureLoad(sceneDepth, onScreen, 0) >= 1.0) { continue; }

		// Whatever the camera sees along that direction, and how far in front
		// of the sample it stands. Positive means something is between the
		// sample and the eye, which is what occlusion is.
		let seen = worldAt(onScreen, size);
		let infront = length(look.eye.xyz - sampleAt)
			- length(look.eye.xyz - seen);
		// **A surface far in front occludes nothing.** It is a different part
		// of the world that happens to line up, and without this every
		// silhouette in the picture would cast a dark halo onto the ground
		// behind it. The fade is over the hemisphere's own reach, so the two
		// are one number.
		let near = clamp(reach / max(0.0001, abs(infront)), 0.0, 1.0);
		blocked = blocked + select(0.0, near, infront > bias);
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
	// which is a halo, the same artifact the range check above exists to
	// stop. The window is what the reach spans, since that is the distance
	// this term is about at all.
	let mine = textureLoad(sceneDepth, at, 0);
	if (mine >= 1.0) { return NOTHING; }
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
