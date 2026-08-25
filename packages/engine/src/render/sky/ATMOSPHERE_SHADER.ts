/**
 * The air, marched over the finished frame -- Sebastian Lague's model, ported.
 *
 * **A sky pass and an atmosphere are not the same pass.** A sky pass fills the
 * pixels nothing else covers, so air drawn in one exists only where the world
 * does not: no haze over a distant mountain, and no shell around the planet
 * seen from outside, because every pixel of the planet was drawn over the sky
 * rather than through it. This runs after the world is drawn and reads the
 * depth it left, so every pixel knows how far away its surface is and how much
 * air stands in front of it. **This pass also owns everything past the air**:
 * the stars, the moon and the sun disc are drawn here too, because a pixel
 * that hits nothing is exactly the pixel this march already has open space
 * for -- there is no second full-screen pass to fill it from behind.
 *
 * **One density function, Rayleigh alone.** `Solar-System`'s own atmosphere
 * shader carries no separate Mie term and no phase function at all -- density
 * falls off as `exp(-height01 * falloff) * (1 - height01)`, one curve, and
 * colour comes from running three wavelengths through the inverse-fourth-power
 * law real air obeys. That is this file's model, not the two-species,
 * two-phase-function one it replaces.
 *
 * **The optical depth is baked, not marched twice.** A live sun-leg march
 * inside a live view-leg march is the expensive shape of this algorithm; the
 * source this was ported from bakes a texture of *how much air stands between
 * a point and the edge of the atmosphere*, indexed by height and by the angle
 * a ray leaves at, and reads it back with two texture samples instead of a
 * second loop. \`bakeOpticalDepth\` does the baking, on the CPU, since nothing
 * here has a compute pipeline to bake it on the GPU with and the table is
 * small enough that it does not need one.
 *
 * **The blend trick.** The baked table only ever answers "how much air from
 * here to the edge, going this way" -- so the optical depth *between* two
 * points has to be built by subtracting two such answers, and naively that is
 * numerically ugly for a ray heading toward the planet rather than away from
 * it. Two estimates are blended by how much the ray is heading outward, which
 * is exactly the trick \`opticalDepthOver\` below carries over unchanged.
 *
 * **What is not carried over.** The planet's own shadow inside its own air is
 * an explicit ray test here (\`inPlanetShadow\`) -- the source this was ported
 * from has no such test, and a sun-leg sample past the terminator just keeps
 * integrating a longer and longer path with nothing that zeroes it outright,
 * which never quite goes as dark as a real planet's night side does from
 * space. And the baked table is built in the **planet's own metres**, not a
 * unit sphere the way the source bakes it -- baking against a unit sphere and
 * reading the result back with real-world heights is short by a factor of the
 * planet's own radius, silently, with nothing to catch it but tuning the
 * strength knob until it happens to look right again.
 */
export const ATMOSPHERE_SHADER = /* wgsl */ `
/**
 * What one planet's air is, and where the eye and the two lights are.
 *
 * \`eye.w\` is 1 when there is air to march at all. \`moon.w\` and \`shape.w\` are
 * the two disc's own angular radii, in radians. \`shape.xyz\` is the planet's
 * radius, the air's own top radius, and how sharply density falls with
 * height. \`beta.xyz\` is Rayleigh's own coefficients, already at their
 * strength. \`look.x\` is how many steps the view march takes and \`look.y\` is
 * how much dither is mixed into the result to break banding up.
 */
struct Air {
	inverseViewProj : mat4x4f,
	eye             : vec4f,
	sun             : vec4f,
	moon            : vec4f,
	shape           : vec4f,
	beta            : vec4f,
	look            : vec4f,
	surface         : vec4f,
};

/**
 * How much air a **surface** is seen through, against how much the sky is.
 *
 * The sky and the haze on distant ground are the same coefficients, so
 * nothing that thins one leaves the other alone. This scales the surface term
 * by itself: \`1\` is honest single scattering, and under it the distance
 * clears while the zenith keeps its colour.
 */
fn aerialPerspective() -> f32 { return air.surface.x; }

/** Grey haze: one coefficient, sharing the air's own density curve. */
fn mieStrength() -> f32 { return air.beta.w; }

/** How far forward that haze throws light. */
fn mieDirection() -> f32 { return air.look.z; }

/** What the light on the air is worth, with no say in its colour. */
fn skyIntensity() -> f32 { return air.look.w; }

/** Everything that takes light out of a ray: Rayleigh's three, plus grey haze. */
fn extinction() -> vec3f { return air.beta.xyz + vec3f(mieStrength()); }
@group(0) @binding(0) var<uniform> air : Air;
@group(0) @binding(1) var scene : texture_2d<f32>;
@group(0) @binding(2) var sceneDepth : texture_depth_2d;
@group(0) @binding(3) var opticalDepthLUT : texture_2d<f32>;
@group(0) @binding(4) var lutSampler : sampler;

/** Further than any ray goes, standing in for nothing in the way. */
const FAR = 1.0e30;

struct AirOut {
	@builtin(position) clip : vec4f,
};

@vertex
fn vertexMain(@builtin(vertex_index) index : u32) -> AirOut {
	var corners = array<vec2f, 3>(
		vec2f(-1.0, -3.0), vec2f(-1.0, 1.0), vec2f(3.0, 1.0));
	var out : AirOut;
	out.clip = vec4f(corners[index], 1.0, 1.0);
	return out;
}

/**
 * Where a ray meets a sphere around the planet's centre.
 *
 * Returns how far to the near side and how far it travels through. A ray
 * starting inside gets zero for the first, a ray that misses gets FAR and no
 * length, and a ray that has already passed the sphere gets the same -- so a
 * caller never has to test which of the three it has.
 */
fn raySphere(radius : f32, origin : vec3f, dir : vec3f) -> vec2f {
	let b = dot(origin, dir);
	let c = dot(origin, origin) - radius * radius;
	let d = b * b - c;
	if (d < 0.0) {
		return vec2f(FAR, 0.0);
	}
	let s = sqrt(d);
	let far = -b + s;
	if (far < 0.0) {
		return vec2f(FAR, 0.0);
	}
	let near = max(0.0, -b - s);
	return vec2f(near, far - near);
}

/** How thick the air is at a point, as a fraction of its value at the ground. */
fn densityAt(point : vec3f) -> f32 {
	let height = length(point) - air.shape.x;
	let height01 = clamp(height / (air.shape.y - air.shape.x), 0.0, 1.0);
	return exp(-height01 * air.shape.z) * (1.0 - height01);
}

/**
 * How much air stands between a point and the edge of the atmosphere, read
 * back from the table \`bakeOpticalDepth\` built.
 *
 * The table is indexed by height (0 at the ground, 1 at the top) and by the
 * cosine of the angle between straight up and the direction asked about,
 * laid out linearly from 1 to -1 -- which is what turns a direction into a
 * texture coordinate here.
 *
 * \`bakeOpticalDepth\` bakes in the planet's own metres, so a value here is on
 * the order of the planet's own radius -- thousands, not the order-1 values
 * Sebastian Lague's own table holds, baked as it is against a unit sphere.
 * \`beta\` is still his own scattering-strength knob, calibrated for that
 * order-1 scale, so dividing by \`air.shape.x\` here converts the real-metre
 * table back to the same planet-radius units before anything downstream
 * multiplies it against \`beta\` -- without this the exponent in \`scatter\`'s
 * transmittance term is thousands of times too large and every sample comes
 * back extinguished to black.
 */
fn opticalDepthBaked(point : vec3f, dir : vec3f) -> f32 {
	let height01 = clamp(
		(length(point) - air.shape.x) / (air.shape.y - air.shape.x),
		0.0, 1.0);
	let up = point / max(1e-6, length(point));
	let cosAngle = dot(up, dir);
	let u = 1.0 - (cosAngle * 0.5 + 0.5);
	let metres = textureSampleLevel(opticalDepthLUT, lutSampler, vec2f(u, height01), 0.0).r;
	return metres / air.shape.x;
}

/**
 * How much air stands between two points on one ray, from the baked table.
 *
 * The table only answers "from here to the edge, going this way" -- so the
 * segment between \`rayOrigin\` and a point \`rayLength\` further along it is
 * the **difference** of two such answers, which cancels badly for a ray
 * heading toward the planet rather than away from it. Blending that estimate
 * against the same difference taken from the far end, walking backward, is
 * what keeps the result stable across the whole range of ray directions a
 * view march asks about.
 */
fn opticalDepthOver(rayOrigin : vec3f, dir : vec3f, rayLength : f32) -> f32 {
	let endPoint = rayOrigin + dir * rayLength;
	let up = rayOrigin / max(1e-6, length(rayOrigin));
	let awayness = dot(dir, up);
	let w = clamp(awayness * 1.5 + 0.5, 0.0, 1.0);
	let forward = opticalDepthBaked(rayOrigin, dir) - opticalDepthBaked(endPoint, dir);
	let backward = opticalDepthBaked(endPoint, -dir) - opticalDepthBaked(rayOrigin, -dir);
	return mix(backward, forward, w);
}

/**
 * How much of the sun reaches a point, with the planet in the way or not.
 *
 * **A yes-or-no answer here draws the planet's own shadow as a staircase.**
 * The terminator inside the atmosphere is a real feature -- it is the edge of
 * the night the world casts on its own air -- but a march of ten samples
 * crossing a hard boundary gains or loses a whole sample's worth of light at
 * once, and that steps across the sky as one clean arc. Softening the edge
 * costs nothing and is better physics besides: the sun has an angular size,
 * so its shadow has a penumbra rather than an edge.
 *
 * The test itself is the closest approach of the ray to the planet's centre.
 * With the sun ahead of the point there is nothing to pass through; behind
 * it, the ray grazes at \`sqrt(|p|^2 - b^2)\` and anything under the radius is
 * blocked.
 */
fn sunReach(point : vec3f, sun : vec3f) -> f32 {
	let b = dot(point, sun);
	if (b > 0.0) { return 1.0; }
	let perpendicular = sqrt(max(0.0, dot(point, point) - b * b));
	let soft = air.shape.x * 0.02;
	return smoothstep(air.shape.x - soft, air.shape.x + soft, perpendicular);
}

/**
 * How much light a molecule throws toward the eye, by the angle it turns it.
 *
 * **Normalised so its average over the whole sphere is 1**, not the \`1/4pi\`
 * the textbook form integrates to. That keeps the phase functions a
 * redistribution of light rather than a dimming of it, so switching them on
 * does not cost a factor of \`4pi\` that some other knob then has to win back.
 *
 * Rayleigh's own: brightest straight toward the sun and straight away from
 * it, dimmest across. Without it the sky is one flat sheet of colour, which
 * is what the model this was ported from draws.
 */
fn phaseRayleigh(cosTheta : f32) -> f32 {
	return 0.75 * (1.0 + cosTheta * cosTheta);
}

/**
 * Henyey-Greenstein, on the same average-of-1 convention.
 *
 * At \`g = 0.76\` this is **30x** brighter straight at the sun than the even
 * scattering it replaces, and a fifth of it across the sky -- which is the
 * halo round a low sun and the pale band along the horizon, and the whole
 * reason a sunset reads warm rather than blue.
 */
fn phaseMie(cosTheta : f32, g : f32) -> f32 {
	let gg = g * g;
	let denom = max(1e-4, 1.0 + gg - 2.0 * g * cosTheta);
	return (1.0 - gg) / (denom * sqrt(denom));
}

/**
 * Single in-scattering along the view ray, from \`origin\` to \`through\` metres
 * further along \`dir\`.
 *
 * Samples land at the **start** of each step rather than its middle, which is
 * what the source this was ported from does -- the first sample sits exactly
 * on the edge of the atmosphere, where the sun-facing side of a planet seen
 * from outside gets its brightest rim.
 *
 * **Rayleigh and haze share one density curve and one table**, because a
 * baked optical depth is a path length and carries no colour: what separates
 * the two is the coefficient it is multiplied by and the phase function that
 * aims it. So the haze costs two multiplies a step and no second table.
 */
fn scatter(
	origin : vec3f,
	dir : vec3f,
	through : f32,
	sun : vec3f,
	jitter : f32,
) -> vec3f {
	let steps = i32(air.look.x);
	let step = through / f32(steps);
	let cosTheta = dot(dir, sun);
	// Aimed once for the whole ray: the angle between the view and the sun
	// does not change along a straight line.
	let aimed = air.beta.xyz * phaseRayleigh(cosTheta)
		+ vec3f(mieStrength() * phaseMie(cosTheta, mieDirection()));
	let outward = extinction();
	var inScattered = vec3f(0.0);
	// **The offset is what turns banding into noise.** Every pixel marching
	// from the same place samples the same heights, so wherever the sum
	// changes by one sample's worth the whole screen changes there at once,
	// and that is a band. Starting each pixel a different fraction of a step
	// along scatters the transition over neighbouring pixels instead. Noise
	// added to the *result* -- which is what the source this was ported from
	// does -- cannot do this: by then the band is already in the number.
	var point = origin + dir * (step * jitter);
	for (var s = 0; s < steps; s++) {
		let lit = sunReach(point, sun);
		if (lit > 0.0) {
			let sunDepth = opticalDepthBaked(point, sun);
			let viewDepth = opticalDepthOver(origin, dir, step * (f32(s) + jitter));
			let transmittance = exp(-(sunDepth + viewDepth) * outward);
			inScattered += densityAt(point) * transmittance * lit;
		}
		point += dir * step;
	}
	return inScattered * aimed * skyIntensity() * step / air.shape.x;
}

/** A field of stars, fixed in world directions. */
fn starsAt(direction : vec3f) -> f32 {
	let grid = floor(direction * 340.0);
	var h = u32(i32(grid.x) * 374761393 + i32(grid.y) * 668265263 + i32(grid.z) * 1274126177);
	h = (h ^ (h >> 13u)) * 1274126177u;
	let value = f32((h ^ (h >> 16u)) & 0xffffffu) / 16777216.0;
	if (value < 0.9975) { return 0.0; }
	return (value - 0.9975) / 0.0025;
}

/** What moonlight is: sunlight seen twice and cold. */
const MOON_COLOR = vec3f(0.62, 0.72, 1.0);

/**
 * The sun's own surface, far brighter than white on purpose.
 *
 * **A disc drawn near white is a sticker, and no curve can rescue it.** The
 * tone curve maps everything over white toward 1, so a sun at 6 and a cloud
 * at 1 come out at 0.95 and 0.80 -- barely apart, and both flat. At 120 it
 * clips to white with a great deal left over, and that leftover is what the
 * bloom pass spreads into the sky around it. The glare is what reads as a
 * sun; the disc is only where it starts.
 */
const SUN_DISC_COLOR = vec3f(120.0, 111.0, 96.0);

/** How quickly a star is lost in a sky brighter than it. */
const STAR_FADE = 400.0;

/**
 * Everything past the air: the stars, the moon, and the sun disc.
 *
 * \`skyLum\` is the scattered light already computed for this same pixel, so a
 * star behind a bright noon sky fades and the same star at the edge of the
 * atmosphere does not, with no separate day-or-night number to keep in step.
 * **The fade is a reciprocal and not a clamp**: a clamped subtraction has a
 * setting at which it snaps, and every knob that moves the sky's brightness
 * moved where that was -- which is why stars used to appear at midday the
 * moment the air was retuned. \`1 / (1 + lum * k)\` has no such edge, and it
 * says the physically right thing at both ends: a world given almost no
 * atmosphere shows its stars in daylight, the way an airless one does.
 */
fn celestialAt(dir : vec3f, skyLum : f32) -> vec3f {
	var color = vec3f(starsAt(dir)) * 0.55 / (1.0 + skyLum * STAR_FADE);

	let toMoon = dot(dir, air.moon.xyz);
	let moonEdge = cos(air.moon.w);
	if (toMoon > moonEdge) {
		let rim = clamp((toMoon - moonEdge) / (1.0 - moonEdge), 0.0, 1.0);
		let lit = clamp(dot(air.moon.xyz, air.sun.xyz) * -0.5 + 0.5, 0.15, 1.0);
		color = mix(color, MOON_COLOR * lit, smoothstep(0.0, 0.35, rim));
	}

	let toSun = dot(dir, air.sun.xyz);
	let sunEdge = cos(air.shape.w);
	if (toSun > sunEdge) {
		let rim = clamp((toSun - sunEdge) / (1.0 - sunEdge), 0.0, 1.0);
		// **Limb darkening**: a real sun is dimmer at its edge than at its
		// middle, because a look at the rim passes further through its own
		// cooler outer gas. Without it the disc is a flat coin, and the eye
		// reads a flat coin as a sticker however bright it is.
		let limb = 0.45 + 0.55 * sqrt(rim);
		color = SUN_DISC_COLOR * limb;
	}

	return color;
}

/** A per-pixel hash, standing in for the blue-noise texture this was ported from. */
fn hash2(p : vec2i) -> f32 {
	var h = u32(p.x * 374761393 + p.y * 668265263);
	h = (h ^ (h >> 13u)) * 1274126177u;
	return f32((h ^ (h >> 16u)) & 0xffffffu) / 16777216.0;
}

@fragment
fn fragmentMain(in : AirOut) -> @location(0) vec4f {
	let at = vec2i(in.clip.xy);
	let worldColor = textureLoad(scene, at, 0).rgb;

	let size = vec2f(textureDimensions(scene));
	let uv = in.clip.xy / size;
	let ndc = vec2f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
	let nearH = air.inverseViewProj * vec4f(ndc, 0.0, 1.0);
	let farH = air.inverseViewProj * vec4f(ndc, 1.0, 1.0);
	let dir = normalize(farH.xyz / farH.w - nearH.xyz / nearH.w);
	let origin = air.eye.xyz;

	let written = textureLoad(sceneDepth, at, 0);
	var toSurface = FAR;
	if (written < 1.0) {
		let hit = air.inverseViewProj * vec4f(ndc, written, 1.0);
		toSurface = length(hit.xyz / hit.w - origin);
	}
	// The planet itself, for the pixels where nothing was drawn: an unbuilt
	// chunk is a hole in the depth buffer, and without this the air would be
	// marched straight through the world and out the other side.
	let ground = raySphere(air.shape.x, origin, dir);
	toSurface = min(toSurface, ground.x);
	let openSpace = toSurface >= FAR;

	var scattered = vec3f(0.0);
	var depth = 0.0;
	if (air.eye.w > 0.0) {
		let shell = raySphere(air.shape.y, origin, dir);
		let through = min(shell.y, toSurface - shell.x);
		if (through > 0.0) {
			let start = origin + dir * shell.x;
			// The same hash does both jobs: it offsets where this pixel's
			// march begins, which is what breaks a band into noise, and a
			// little of it is added to the result for the fine grain a
			// ten-step integral still leaves behind.
			let noise = hash2(at);
			scattered = scatter(start, dir, through, air.sun.xyz, noise);
			scattered += vec3f((noise - 0.5) * air.look.y * 0.01);
			depth = opticalDepthOver(start, dir, through);
		}
	}

	// **Haze over ground is two terms, and a thickness knob must move both.**
	// What a look through air does is dim what is behind it *and* add the
	// light the air itself scatters in front of it. Scaling only the first
	// clears the ground and leaves the glow sitting on top of it, which reads
	// as fog that nothing controls. One factor over both is what makes this a
	// thickness rather than a contrast slider.
	//
	// **The sky itself is never scaled.** A pixel with nothing behind it is
	// the atmosphere rather than something seen through it, so it keeps the
	// honest depth -- which is also what keeps the stars, the moon and the
	// sun disc dimmed by the air they are actually seen through.
	var haze = 1.0;
	var background = worldColor;
	if (openSpace) {
		// The sky's own luminance at this very pixel, unclamped -- what the
		// stars have to compete with, and what reddens the sun below.
		let skyLum = max(0.0, dot(scattered, vec3f(0.2126, 0.7152, 0.0722)));
		background = celestialAt(dir, skyLum);
	} else {
		haze = aerialPerspective();
	}

	let dimmed = exp(-depth * extinction() * haze);
	return vec4f(background * dimmed + scattered * haze, 1.0);
}
`;
