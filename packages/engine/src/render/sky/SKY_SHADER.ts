/**
 * The sky: scattered light, stars and the moon, on a full-screen triangle.
 *
 * The atmosphere is **the planet's own**, built by {@link planetAtmosphere}
 * from a height and a wanted zenith depth and handed over as a uniform, not
 * Earth's lifted onto whatever radius is under it. The camera's real position
 * goes straight in — there is no height to lift and no factor to lift it by.
 * Only the sun's direction was ever taken from the world; now the air is too.
 *
 * Everything is in **world directions**, so the sky is fixed to the world and
 * not to the view. Walking turns a player's own up by `s/R` — a full turn over
 * this planet's 10,681 m — and a sky fixed to the view would carry the stars
 * around with them.
 *
 * The moon is drawn at a distance rather than painted on. Walking to the far
 * side of the planet shifts it 1.9 degrees against the stars, which a painted
 * one cannot do.
 */
export const SKY_SHADER = /* wgsl */ `
struct Frame {
	viewProj : mat4x4f,
	eye      : vec4f,
	sun      : vec4f,
	fog      : vec4f,
	night    : vec4f,
};
struct Sky {
	inverseViewProj : mat4x4f,
	moon            : vec4f,
	// x: planet radius, y: top radius, z: Rayleigh scale height, w: Mie scale height
	air1            : vec4f,
	// x, y, z: Rayleigh coefficients (r, g, b), w: Mie coefficient
	air2            : vec4f,
	// x: how much of the Mie scattering goes forward
	air3            : vec4f,
};
@group(0) @binding(0) var<uniform> frame : Frame;
@group(1) @binding(0) var<uniform> sky : Sky;

const VIEW_STEPS  = 12;
const LIGHT_STEPS = 4;

struct SkyOut {
	@builtin(position) clip : vec4f,
	@location(0)       ndc  : vec2f,
};

@vertex
fn vertexMain(@builtin(vertex_index) index : u32) -> SkyOut {
	// One triangle covering the screen, so every pixel gets a ray.
	var corners = array<vec2f, 3>(
		vec2f(-1.0, -3.0), vec2f(-1.0, 1.0), vec2f(3.0, 1.0));
	var out : SkyOut;
	out.clip = vec4f(corners[index], 1.0, 1.0);
	out.ndc = corners[index];
	return out;
}

/** Where a ray from inside the atmosphere leaves it. */
fn topDistance(origin : vec3f, direction : vec3f) -> f32 {
	let b = dot(origin, direction);
	let c = dot(origin, origin) - sky.air1.y * sky.air1.y;
	return -b + sqrt(max(0.0, b * b - c));
}

/** Whether a ray hits the ground before it leaves the air. */
fn hitsGround(origin : vec3f, direction : vec3f) -> bool {
	let b = dot(origin, direction);
	let c = dot(origin, origin) - sky.air1.x * sky.air1.x;
	return c > 0.0 && b < 0.0 && b * b - c > 0.0;
}

/** Air along a ray, as the two densities it has. */
fn opticalDepth(origin : vec3f, direction : vec3f, far : f32) -> vec2f {
	var sum = vec2f(0.0);
	let step = far / f32(LIGHT_STEPS);
	for (var s = 0; s < LIGHT_STEPS; s++) {
		let height = length(origin + direction * (f32(s) + 0.5) * step) - sky.air1.x;
		sum += vec2f(exp(-height / sky.air1.z), exp(-height / sky.air1.w)) * step;
	}
	return sum;
}

/**
 * Single-scattered sunlight along a view ray.
 *
 * Marched rather than solved: at each step, how much air is between the sun and
 * the point, how much is back along the view, and how much of it scatters this
 * way.
 */
fn scatter(origin : vec3f, direction : vec3f, sun : vec3f) -> vec3f {
	let far = topDistance(origin, direction);
	let step = far / f32(VIEW_STEPS);
	let cosAngle = dot(direction, sun);
	let rayleighPhase = 3.0 / (16.0 * 3.14159265) * (1.0 + cosAngle * cosAngle);
	let gMie = sky.air3.x;
	let g2 = gMie * gMie;
	let miePhase = 3.0 / (8.0 * 3.14159265)
		* ((1.0 - g2) * (1.0 + cosAngle * cosAngle))
		/ ((2.0 + g2) * pow(1.0 + g2 - 2.0 * gMie * cosAngle, 1.5));

	let bRay = sky.air2.xyz;
	let bMie = sky.air2.w;
	var accumulated = vec2f(0.0);
	var rayleigh = vec3f(0.0);
	var mie = vec3f(0.0);
	for (var s = 0; s < VIEW_STEPS; s++) {
		let point = origin + direction * (f32(s) + 0.5) * step;
		let height = length(point) - sky.air1.x;
		let density = vec2f(exp(-height / sky.air1.z), exp(-height / sky.air1.w)) * step;
		accumulated += density;

		if (!hitsGround(point, sun)) {
			let toSun = opticalDepth(point, sun, topDistance(point, sun));
			let tau = bRay * (toSun.x + accumulated.x)
				+ bMie * 1.1 * (toSun.y + accumulated.y);
			let transmittance = exp(-tau);
			rayleigh += transmittance * density.x;
			mie += transmittance * density.y;
		}
	}
	return (rayleigh * bRay * rayleighPhase + mie * bMie * miePhase) * 22.0;
}

/** A field of stars, fixed in world directions. */
fn stars(direction : vec3f) -> f32 {
	let grid = floor(direction * 340.0);
	var h = u32(i32(grid.x) * 374761393 + i32(grid.y) * 668265263 + i32(grid.z) * 1274126177);
	h = (h ^ (h >> 13u)) * 1274126177u;
	let value = f32((h ^ (h >> 16u)) & 0xffffffu) / 16777216.0;
	if (value < 0.9975) { return 0.0; }
	return (value - 0.9975) / 0.0025;
}

@fragment
fn fragmentMain(in : SkyOut) -> @location(0) vec4f {
	// The ray this pixel looks along, in world directions.
	let far = sky.inverseViewProj * vec4f(in.ndc, 1.0, 1.0);
	let near = sky.inverseViewProj * vec4f(in.ndc, 0.0, 1.0);
	let direction = normalize(far.xyz / far.w - near.xyz / near.w);

	// The planet's own air, at the camera's real position -- no lift.
	let worldDirection = direction;
	let origin = frame.eye.xyz;

	var color = scatter(origin, worldDirection, frame.sun.xyz);

	// Stars and the moon show through as the air stops scattering.
	let dark = 1.0 - clamp(frame.night.x, 0.0, 1.0);
	color += vec3f(stars(worldDirection)) * dark * 0.9;

	let toMoon = dot(worldDirection, sky.moon.xyz);
	let moonEdge = cos(sky.moon.w);
	if (toMoon > moonEdge) {
		let rim = clamp((toMoon - moonEdge) / (1.0 - moonEdge), 0.0, 1.0);
		let lit = clamp(dot(sky.moon.xyz, frame.sun.xyz) * -0.5 + 0.5, 0.15, 1.0);
		color = mix(color, vec3f(0.92, 0.90, 0.84) * lit, smoothstep(0.0, 0.35, rim));
	}

	// Under water the sky is whatever the water lets through.
	color = mix(color, frame.fog.rgb, clamp(3000.0 / frame.fog.w, 0.0, 1.0) * step(frame.fog.w, 1000.0));
	return vec4f(color, 1.0);
}
`;
