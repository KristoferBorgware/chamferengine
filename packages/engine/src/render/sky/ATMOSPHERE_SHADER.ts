/**
 * The air, marched over the finished frame rather than drawn behind it.
 *
 * **This is the whole difference between a sky and an atmosphere.** A sky pass
 * fills the pixels nothing else covers, so the air exists only where the world
 * does not: there is no haze over a distant mountain, and from outside there is
 * no planet wrapped in anything, because every pixel of the planet was drawn
 * over the sky rather than through it. This pass runs after the world is drawn
 * and reads the depth it left, so every pixel knows how far away its surface
 * is and how much air stands in front of it. The same march then answers both
 * questions with one model: looking up from the ground it is the sky, looking
 * at the planet from outside it is the shell around it, and looking at a
 * mountain twenty kilometres off it is the haze that makes it blue.
 *
 * Single scattering, two species. Rayleigh is the molecular term, three
 * coefficients so blue scatters more than red; Mie is the haze, one
 * coefficient and a strong forward bias, which is the glare around the sun.
 * Each has its own exponential density profile, so the two thin out at
 * different rates and a sunset reddens while the zenith stays blue.
 *
 * Both legs of the light path are paid for. The **sun leg** is marched from
 * each sample toward the sun and is what makes the terminator: a sample whose
 * sun ray passes through the planet is not lit at all, so the shadow the planet
 * casts into its own air is a ray test rather than a fade. The **view leg** is
 * accumulated as the march runs, and it does two jobs -- it dims the light
 * scattered toward the eye from far samples, and it is what the surface colour
 * behind the air is multiplied by, which is the haze.
 *
 * The march is bounded by three things, and taking the nearest of them is what
 * keeps it correct from every distance: where the ray leaves the air, where it
 * meets the planet, and where the depth buffer says a surface already is. The
 * third is what stops the air being drawn in front of ground it is behind.
 */
export const ATMOSPHERE_SHADER = /* wgsl */ `
/**
 * What one planet's air is, and where the eye is looking from.
 *
 * shape.x is the planet's radius, shape.y the radius the air stops at, and
 * shape.zw the two scale heights. sun.w is what the sunlight is worth, look.x
 * is how much of the Mie scattering goes forward, and look.yz are how many
 * steps the two marches take.
 */
struct Air {
	inverseViewProj : mat4x4f,
	eye             : vec4f,
	sun             : vec4f,
	shape           : vec4f,
	beta            : vec4f,
	look            : vec4f,
};
@group(0) @binding(0) var<uniform> air : Air;
@group(0) @binding(1) var scene : texture_2d<f32>;
@group(0) @binding(2) var sceneDepth : texture_depth_2d;

/** Further than any ray goes, standing in for nothing in the way. */
const FAR = 1.0e30;

/**
 * How much more of the Mie term is absorbed than is scattered.
 *
 * Haze takes light out of a beam by more than it puts back into it, and the
 * usual allowance is a tenth. Without it the sun's own glare never dims with
 * distance and the horizon washes out white.
 */
const MIE_EXTINCTION = 1.1;

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

/** The two densities at a point, each thinning at its own rate. */
fn densityAt(point : vec3f) -> vec2f {
	let height = length(point) - air.shape.x;
	return vec2f(exp(-height / air.shape.z), exp(-height / air.shape.w));
}

/**
 * Air along a ray, as the two densities it has, out to where it leaves.
 *
 * This is the sun leg, and it is the expensive half: it runs once per sample
 * of the view march. Few steps are enough because it is an integral of a
 * smooth function that the transmittance then puts inside an exponential --
 * an error here moves a colour slightly, where an error in the view march
 * moves a band across the sky.
 */
fn opticalDepth(origin : vec3f, dir : vec3f, far : f32) -> vec2f {
	let steps = i32(air.look.z);
	let step = far / f32(steps);
	var sum = vec2f(0.0);
	for (var s = 0; s < steps; s++) {
		sum += densityAt(origin + dir * ((f32(s) + 0.5) * step)) * step;
	}
	return sum;
}

/** Whether the planet stands between a point and the sun. */
fn inPlanetShadow(point : vec3f, sun : vec3f) -> bool {
	let hit = raySphere(air.shape.x, point, sun);
	return hit.x < FAR;
}

@fragment
fn fragmentMain(in : AirOut) -> @location(0) vec4f {
	let at = vec2i(in.clip.xy);
	let color = textureLoad(scene, at, 0).rgb;
	if (air.eye.w <= 0.0) {
		return vec4f(color, 1.0);
	}

	// The ray this pixel looks along, and how far along it the world already
	// is. A depth of exactly 1 is the cleared buffer, which is nothing at all
	// rather than a surface at the far plane.
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

	let shell = raySphere(air.shape.y, origin, dir);
	let through = min(shell.y, toSurface - shell.x);
	if (through <= 0.0) {
		return vec4f(color, 1.0);
	}

	let start = origin + dir * shell.x;
	let steps = i32(air.look.y);
	let step = through / f32(steps);

	let cosAngle = dot(dir, air.sun.xyz);
	let rayleighPhase = 3.0 / (16.0 * 3.14159265) * (1.0 + cosAngle * cosAngle);
	let g = air.look.x;
	let g2 = g * g;
	let miePhase = 3.0 / (8.0 * 3.14159265)
		* ((1.0 - g2) * (1.0 + cosAngle * cosAngle))
		/ ((2.0 + g2) * pow(max(1e-4, 1.0 + g2 - 2.0 * g * cosAngle), 1.5));

	let betaRay = air.beta.xyz;
	let betaMie = air.beta.w;
	var viewDepth = vec2f(0.0);
	var rayleigh = vec3f(0.0);
	var mie = vec3f(0.0);
	for (var s = 0; s < steps; s++) {
		let point = start + dir * ((f32(s) + 0.5) * step);
		let density = densityAt(point) * step;
		viewDepth += density;
		if (inPlanetShadow(point, air.sun.xyz)) {
			continue;
		}
		let sunShell = raySphere(air.shape.y, point, air.sun.xyz);
		let toSun = opticalDepth(point, air.sun.xyz, sunShell.y);
		let tau = betaRay * (toSun.x + viewDepth.x)
			+ betaMie * MIE_EXTINCTION * (toSun.y + viewDepth.y);
		let transmittance = exp(-tau);
		rayleigh += transmittance * density.x;
		mie += transmittance * density.y;
	}

	let scattered = (rayleigh * betaRay * rayleighPhase
		+ mie * betaMie * miePhase) * air.sun.w;

	// **What is behind the air is dimmed by the air.** This is the same
	// optical depth the march accumulated, and it is the whole of the haze:
	// ground twenty kilometres off loses its own colour by exactly what the
	// air between took out of it, and gains the blue the same air scattered in.
	let dimmed = exp(-(betaRay * viewDepth.x
		+ betaMie * MIE_EXTINCTION * viewDepth.y));
	return vec4f(color * dimmed + scattered, 1.0);
}
`;
