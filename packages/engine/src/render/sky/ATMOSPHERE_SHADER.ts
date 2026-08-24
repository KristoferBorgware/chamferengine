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
};
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

/** Whether the planet stands between a point and the sun. */
fn inPlanetShadow(point : vec3f, sun : vec3f) -> bool {
	let hit = raySphere(air.shape.x, point, sun);
	return hit.x < FAR;
}

/**
 * Single in-scattering along the view ray, from \`origin\` to \`through\` metres
 * further along \`dir\`.
 *
 * Samples land at the **start** of each step rather than its middle, which is
 * what the source this was ported from does -- the first sample sits exactly
 * on the edge of the atmosphere, where the sun-facing side of a planet seen
 * from outside gets its brightest rim.
 */
fn scatter(origin : vec3f, dir : vec3f, through : f32, sun : vec3f) -> vec3f {
	let steps = i32(air.look.x);
	let step = through / f32(steps);
	var inScattered = vec3f(0.0);
	var point = origin;
	for (var s = 0; s < steps; s++) {
		if (!inPlanetShadow(point, sun)) {
			let sunDepth = opticalDepthBaked(point, sun);
			let viewDepth = opticalDepthOver(origin, dir, step * f32(s));
			let transmittance = exp(-(sunDepth + viewDepth) * air.beta.xyz);
			inScattered += densityAt(point) * transmittance;
		}
		point += dir * step;
	}
	return inScattered * air.beta.xyz * step / air.shape.x;
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

/** The sun disc's own colour, bright enough to still be the sun after the tone curve. */
const SUN_DISC_COLOR = vec3f(6.2, 5.7, 4.9);

/**
 * Everything past the air: the stars, the moon, and the sun disc.
 *
 * \`skyGlow\` is the scattered light already computed for this same pixel,
 * standing in for how bright the sky already is here -- a star behind a
 * bright noon sky fades out, the same star at the edge of the atmosphere or
 * in open space does not, and nothing here needed a separate day-or-night
 * number to know which.
 */
fn celestialAt(dir : vec3f, skyGlow : f32) -> vec3f {
	var color = vec3f(starsAt(dir)) * 0.9 * (1.0 - skyGlow);

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
		color = mix(color, SUN_DISC_COLOR, smoothstep(0.0, 0.5, rim));
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
	var dimmed = vec3f(1.0);
	if (air.eye.w > 0.0) {
		let shell = raySphere(air.shape.y, origin, dir);
		let through = min(shell.y, toSurface - shell.x);
		if (through > 0.0) {
			let start = origin + dir * shell.x;
			scattered = scatter(start, dir, through, air.sun.xyz);
			let dither = (hash2(at) - 0.5) * air.look.y * 0.01;
			scattered += vec3f(dither);
			let totalDepth = opticalDepthOver(start, dir, through);
			dimmed = exp(-totalDepth * air.beta.xyz);
		}
	}

	var background = worldColor;
	if (openSpace) {
		let skyGlow = clamp(dot(scattered, vec3f(0.2126, 0.7152, 0.0722)) * 3.0, 0.0, 1.0);
		background = celestialAt(dir, skyGlow);
	}

	return vec4f(background * dimmed + scattered, 1.0);
}
`;
