/**
 * Light that reached a surface by way of another one, read off the frame.
 *
 * Screen-space global illumination. Every light in this world arrives
 * straight from something: the sun, the sky, the moon, or the floor a cave
 * is baked to. Nothing carries light from a sunlit wall onto the shaded
 * ground beside it, so a bright cliff face stands next to dark ground with no
 * sign that one is lighting the other, and an overhang is the same darkness
 * whatever it is standing over -- snow or stone.
 *
 * This is the one bounce that costs nothing to know about: the frame has
 * already been drawn, so what every visible surface *emits* is sitting in the
 * colour buffer. For each pixel, look around it, and where a neighbouring
 * surface faces this one, add a share of its colour.
 *
 * **Indirect light adds, so this needs nothing separated out.** Ambient
 * occlusion has to find the ambient term because it scales it; a bounce is
 * new light arriving, so it goes on top of a finished pixel and is the one
 * screen-space term that can honestly run after the world pass. That is also
 * why it can read the lit colour at all -- it is downstream of the shading it
 * is gathering from.
 *
 * What it cannot do is the well-known limit of the technique, and it is worth
 * being plain about: **it only knows what is on screen.** A wall out of frame
 * bounces nothing, so turning the camera changes the light. The alternative
 * is a world-space structure nothing here has, and the artifact is a gradual
 * one -- what leaves the frame was at the edge of it, contributing least.
 *
 * The gather is noisy for the same reason the occlusion is, and is blurred
 * the same way, by a second pipeline that will not cross a depth step.
 */
export const SSGI_SHADER = /* wgsl */ `
struct Look {
	inverseViewProj : mat4x4f,
	viewProj        : mat4x4f,
	// xyz eye, w how far a bounce reaches in metres
	eye             : vec4f,
	// x strength, y sample count, z blur radius, w spare
	dial            : vec4f,
	// x how far apart two pixels may be in METRES and still blur together,
	// y how far a bounce may carry in METRES. The reach above is in pixels,
	// because the gather works in the picture; both of these are in metres,
	// because how far apart two surfaces really are is a fact about the world
	// and not about how much screen they happen to fill.
	limit           : vec4f,
};
@group(0) @binding(0) var<uniform> look : Look;
@group(0) @binding(1) var sceneDepth : texture_depth_2d;
@group(0) @binding(2) var scene : texture_2d<f32>;
@group(0) @binding(3) var gathered : texture_2d<f32>;

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

fn worldAt(at : vec2i, size : vec2f) -> vec3f {
	let written = textureLoad(sceneDepth, at, 0);
	let uv = (vec2f(at) + vec2f(0.5)) / size;
	let ndc = vec2f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
	let hit = look.inverseViewProj * vec4f(ndc, written, 1.0);
	return hit.xyz / hit.w;
}

fn turnAt(pixel : vec2f) -> f32 {
	return fract(52.9829189
		* fract(dot(pixel, vec2f(0.06711056, 0.00583715)))) * 6.2831853;
}

/** The normal a pixel's depth implies, taking each axis's closer neighbour. */
fn normalAt(at : vec2i, size : vec2f, here : vec3f) -> vec3f {
	let bounds = vec2i(size) - vec2i(1);
	let left = worldAt(clamp(at + vec2i(-1, 0), vec2i(0), bounds), size);
	let right = worldAt(clamp(at + vec2i(1, 0), vec2i(0), bounds), size);
	let down = worldAt(clamp(at + vec2i(0, -1), vec2i(0), bounds), size);
	let up = worldAt(clamp(at + vec2i(0, 1), vec2i(0), bounds), size);
	let acrossX = select(here - left, right - here,
		length(right - here) < length(here - left));
	let acrossY = select(here - down, up - here,
		length(up - here) < length(here - down));
	let face = normalize(cross(acrossX, acrossY));
	let toEye = normalize(look.eye.xyz - here);
	return face * select(-1.0, 1.0, dot(face, toEye) > 0.0);
}

@fragment
fn gatherMain(in : ScreenOut) -> @location(0) vec4f {
	let at = vec2i(in.clip.xy);
	let size = vec2f(textureDimensions(sceneDepth));
	if (textureLoad(sceneDepth, at, 0) >= 1.0) {
		return vec4f(0.0, 0.0, 0.0, 1.0);
	}

	let here = worldAt(at, size);
	let normal = normalAt(at, size, here);
	let reach = look.eye.w;
	let count = max(1.0, floor(look.dial.y));
	let turn = turnAt(in.clip.xy);

	var bounced = vec3f(0.0);
	var weight = 0.0;
	var filled = 0.0;
	for (var n = 0.0; n < count; n = n + 1.0) {
		// A ring of screen offsets, spiralling out, turned per pixel. Screen
		// space rather than world space because what is being gathered lives
		// in the picture: a world-space step would have to be projected back
		// anyway, and near the camera it lands on the same texel every time.
		let spread = (n + 0.5) / count;
		let angle = turn + n * 2.3999632;
		let away = sqrt(spread) * reach;
		let by = vec2i(vec2f(cos(angle), sin(angle)) * away);
		let other = at + by;
		if (other.x < 0 || other.y < 0
			|| other.x >= i32(size.x)
			|| other.y >= i32(size.y)) { continue; }
		if (textureLoad(sceneDepth, other, 0) >= 1.0) { continue; }

		let there = worldAt(other, size);
		let toward = there - here;
		let apart = length(toward);
		if (apart < 0.001) { continue; }
		let direction = toward / apart;

		// **Both surfaces have to be facing each other.** This one has to be
		// turned toward the other for the light to land, and the other has to
		// be turned back for it to have left -- without the second test the
		// back of every wall lights the ground behind it.
		let lands = max(0.0, dot(normal, direction));
		if (lands <= 0.0) { continue; }
		let theirs = normalAt(other, size, there);
		let leaves = max(0.0, dot(theirs, -direction));
		if (leaves <= 0.0) { continue; }

		// **Beyond this it is a different place, not a neighbour.** The reach
		// above is in pixels, so at the horizon a few of them span hundreds
		// of metres, and without a limit in metres a distant hillside would
		// light the ground underfoot.
		if (apart > look.limit.y) { continue; }
		// **Linear over that limit, not inverse-square.** A physical falloff
		// belongs to a point source; every sample here is a patch of surface
		// whose area grows with distance in the same proportion, and the two
		// cancel. Inverse-square in metres left a neighbour two metres off
		// worth a fifth and one ten metres off worth a hundredth, which is
		// what made the whole term arrive as nothing.
		let fade = 1.0 - apart / look.limit.y;
		let share = lands * leaves * fade;
		bounced = bounced + textureLoad(scene, other, 0).rgb * share;
		weight = weight + share;
		filled = filled + 1.0;
	}
	if (weight <= 0.0) { return vec4f(0.0, 0.0, 0.0, 1.0); }
	// **Two factors that each mean something, rather than one tiny one.**
	// Dividing the sum by the sample count is the hemisphere average, and it
	// is correct and useless: on a voxel hillside only two or three samples in
	// sixteen find a surface turned back toward this one, so the answer landed
	// at a few percent of a colour that was itself dark, and the whole term
	// arrived as a rounding error. Divided by its own weight instead, the
	// first factor is *what colour the light bouncing in here is* -- an
	// ordinary scene colour -- and the second is *how much of the ring found
	// anything at all*. The dial then scales something with a size to it.
	let colour = bounced / weight;
	let coverage = filled / count;
	return vec4f(colour * (coverage * look.dial.x), 1.0);
}

@fragment
fn blurMain(in : ScreenOut) -> @location(0) vec4f {
	let at = vec2i(in.clip.xy);
	let size = vec2i(textureDimensions(gathered));
	let radius = i32(look.dial.z);
	if (textureLoad(sceneDepth, at, 0) >= 1.0) {
		return vec4f(0.0, 0.0, 0.0, 1.0);
	}
	let here = worldAt(at, vec2f(size));
	let apart = look.limit.x;

	var total = vec3f(0.0);
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
			total = total + textureLoad(gathered, by, 0).rgb;
			weight = weight + 1.0;
		}
	}
	let mine = textureLoad(gathered, at, 0).rgb;
	return vec4f(select(mine, total / weight, weight > 0.0), 1.0);
}

/**
 * Add the bounce to the frame.
 *
 * **Blended onto the scene rather than reading it**, because a pass cannot
 * read the image it is drawing into. The pipeline adds colour and keeps the
 * destination's alpha untouched -- that alpha is coverage, and the air pass
 * composites the sky under whatever is left of it, so a bounce that wrote its
 * own would cut every cloud out of the sky behind it.
 */
@fragment
fn addMain(in : ScreenOut) -> @location(0) vec4f {
	return vec4f(textureLoad(gathered, vec2i(in.clip.xy), 0).rgb, 0.0);
}
`;
