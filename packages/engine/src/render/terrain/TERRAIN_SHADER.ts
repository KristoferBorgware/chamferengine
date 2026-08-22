/**
 * The terrain shader: a sun, a sky, and water fog.
 *
 * Vertex positions arrive relative to their own chunk's origin, which is what
 * keeps them inside the part of `float32` that resolves 122 micrometres. The
 * origin is added here, in `float32` as well, because the camera is subtracted
 * from it in the same instruction: the view matrix already has the eye position
 * folded in, so the sum never has to represent a point far from the viewer.
 *
 * Color carries the block, how much sky its column stands under, and how
 * boxed-in its corner is, all baked by the mesher. **Which way a face points is
 * not baked**: it is read here, from how the position changes across one pixel.
 *
 * `fog.w` is the distance the view fades over. Above water it is set far past
 * the horizon, which leaves the same expression doing nothing.
 *
 * `night.x` is how far the sun is over this place's horizon, `night.y` is what
 * is left of the light when it is not, and `night.z` is how much of the light
 * comes from the sun rather than from the sky. `sky.rgb` is what the sky is
 * doing, which is the color of everything the sun does not reach directly.
 */
export const TERRAIN_SHADER = /* wgsl */ `
struct Frame {
	viewProj : mat4x4f,
	eye      : vec4f,
	sun      : vec4f,
	fog      : vec4f,
	night    : vec4f,
	sky      : vec4f,
};
struct Chunk {
	origin : vec4f,
};
@group(0) @binding(0) var<uniform> frame : Frame;
@group(1) @binding(0) var<uniform> chunk : Chunk;

struct VertexOut {
	@builtin(position) clip  : vec4f,
	@location(0)       color : vec3f,
	@location(1)       local : vec3f,
	@location(2)       up    : vec3f,
	@location(3)       depth : f32,
};

@vertex
fn vertexMain(
	@location(0) position : vec3f,
	@location(1) color    : vec3f,
) -> VertexOut {
	let world = position + chunk.origin.xyz;
	var out : VertexOut;
	out.clip = frame.viewProj * vec4f(world, 1.0);
	out.color = color;
	// The chunk-relative position, not the world one, and the difference is
	// the whole reason a normal can be read off it. A world position on this
	// planet is a number near 6,800, where \`float32\` steps by a millimetre,
	// and the change across one pixel of a surface underfoot is a few
	// millimetres -- so the difference between two of them is two or three
	// representable steps and the normal it gives is noise. Chunk-relative
	// keeps the magnitude under a few hundred, where the step is 60
	// micrometres, and the difference is exact enough to normalise.
	out.local = position;
	out.up = normalize(world);
	out.depth = length(world - frame.eye.xyz);
	return out;
}

/**
 * Which way this face points, from how its position moves across one pixel.
 *
 * Two neighbouring pixels of a flat triangle differ by a step along that
 * triangle's plane, so the cross product of the two steps is the plane's
 * normal, exactly. Every face in this world is flat -- a cell's cap and the
 * wall between two cells are both planar polygons -- so there is nothing a
 * stored normal would say that this does not, and a stored one would cost
 * three floats a vertex and a change to what the mesher writes.
 *
 * The sign comes from the viewer rather than from the winding. Back faces are
 * culled, so a face that is drawn at all is one the camera is looking at the
 * front of, and turning the normal to face the eye is right for a cap, a wall
 * and a floor alike.
 */
fn faceNormal(local : vec3f, toEye : vec3f) -> vec3f {
	let n = normalize(cross(dpdx(local), dpdy(local)));
	return select(-n, n, dot(n, toEye) > 0.0);
}

/**
 * The color of direct sunlight, which reddens as the sun goes down.
 *
 * A low sun is seen through more air, and air scatters blue out of it first.
 * The height is measured against the place's own up, so the color turns as a
 * player walks around the planet as well as as the day runs.
 */
fn sunColor(up : vec3f) -> vec3f {
	let height = clamp(dot(up, frame.sun.xyz), 0.0, 1.0);
	return mix(
		vec3f(1.0, 0.52, 0.26),
		vec3f(1.0, 0.98, 0.94),
		smoothstep(0.0, 0.30, height)
	);
}

/**
 * How much light reaches a face, as a color rather than a number.
 *
 * Two terms. **The sun** is one dot product against the face's own normal --
 * which is what makes a slope facing the morning sun bright and the slope
 * behind it dark, and what a normal read from the position rather than from
 * the planet's centre buys. It is switched off by \`day\` when the sun is under
 * this place's horizon.
 *
 * **The sky** is the light with no single direction: a face looking straight
 * up sees all of it, one looking sideways sees half, and one looking down sees
 * only what the ground throws back. That is a dot product against the place's
 * own up, and it is what stops a shaded wall being black. It carries the sky's
 * own color, so shade is blue under a blue sky and orange under a burning one.
 *
 * \`ambient\` and \`direct\` are what the two are worth to a surface facing
 * straight at them, and they sum to 1 so flat ground at noon is unchanged.
 */
fn lightOn(
	normal : vec3f,
	up : vec3f,
	ambient : f32,
	direct : f32,
) -> vec3f {
	let day = frame.night.x;
	let lambert = max(dot(normal, frame.sun.xyz), 0.0);
	// How much of the sky this face can see, from all of it to the fraction a
	// downward face gets back off the ground.
	let openness = mix(0.42, 1.0, 0.5 + 0.5 * dot(normal, up));
	// **The sky's hue, not its brightness.** The color the pass clears to
	// already fades from day to night, so taking it whole would dim the
	// ambient twice over -- once by that fade and once by \`day\` below --
	// and would also make a dark blue sky a dark light rather than a blue
	// one. Dividing out its own luminance leaves a tint of 1, and half of
	// that tint is enough to read as sky without turning grey stone blue.
	let lum = max(0.001, dot(frame.sky.rgb, vec3f(0.2126, 0.7152, 0.0722)));
	let tint = mix(vec3f(1.0), frame.sky.rgb / lum, 0.5);
	let skyLight = tint * (ambient * openness * day);
	let sunLight = sunColor(up) * (direct * lambert * day);
	// After dark the sky is what is left, and a face still sees more of it
	// looking up than looking down.
	let night = vec3f(frame.night.y * openness);
	return max(night, skyLight + sunLight);
}

@fragment
fn fragmentMain(in : VertexOut) -> @location(0) vec4f {
	let world = in.local + chunk.origin.xyz;
	let normal = faceNormal(in.local, frame.eye.xyz - world);
	// The two shares sum to 1, so flat ground under a noon sun reads the same
	// whatever the balance is and only what stands at an angle to the sun
	// moves.
	let direct = frame.night.z;
	let lit = in.color * lightOn(normal, normalize(in.up), 1.0 - direct, direct);

	// Under water the view fades toward the water's own color over the distance
	// in fog.w. Above the surface that distance is set far past the horizon,
	// so the same expression leaves the color alone.
	let murk = clamp(in.depth / frame.fog.w, 0.0, 1.0);
	return vec4f(mix(lit, frame.fog.rgb, murk), 1.0);
}

@fragment
fn waterMain(in : VertexOut) -> @location(0) vec4f {
	let world = in.local + chunk.origin.xyz;
	let normal = faceNormal(in.local, frame.eye.xyz - world);
	// Water takes less of its light from the sun than stone does: a look
	// reaches through it to whatever is under, and that is lit from the sky.
	let direct = frame.night.z * 0.78;
	let lit = in.color * lightOn(normal, normalize(in.up), 1.0 - direct, direct);
	let murk = clamp(in.depth / frame.fog.w, 0.0, 1.0);
	return vec4f(mix(lit, frame.fog.rgb, murk), 0.62);
}
`;
