import { WIND_AXIS } from "../../sky/WIND_AXIS.js";

const axis = WIND_AXIS;

/**
 * A cloud puff seen from the sun, writing how much of it is in the way.
 *
 * **Coverage, not depth.** A shadow map records how far the nearest surface
 * is, which is the right question for a wall and the wrong one for a cloud: a
 * cloud is translucent, two of them stacked are darker than one, and the edge
 * of one is thinner than its middle. So this pass accumulates *how much cloud*
 * a sunbeam passes through, and nothing is ever tested for being nearest.
 *
 * The puff is turned to face the **sun** rather than the eye. A billboard has
 * no thickness, so the one thing it must not do is turn edge-on to whatever is
 * looking at it -- and here that is the sun.
 *
 * The wind is the same one uniform the drawn clouds turn on, so a puff's
 * shadow is under the puff and stays there as both drift.
 */
export const CLOUD_SHADOW_SHADER = /* wgsl */ `
struct SunBox {
	toLight : mat4x4f,
};
struct Wind {
	time : f32,
};
@group(0) @binding(0) var<uniform> sunBox : SunBox;
@group(1) @binding(0) var<uniform> wind : Wind;

const WIND_AXIS = vec3f(${axis.x}, ${axis.y}, ${axis.z});

/** What a puff is drawn at, so what it shadows at. */
const PUFF_OPACITY = 0.85;

fn rotateAboutWind(p : vec3f, angle : f32) -> vec3f {
	let c = cos(angle);
	let s = sin(angle);
	return p * c + cross(WIND_AXIS, p) * s + WIND_AXIS * dot(WIND_AXIS, p) * (1.0 - c);
}

struct BoxOut {
	@builtin(position) clip  : vec4f,
	@location(0)       cover : f32,
};

@vertex
fn vertexMain(
	@location(0) direction : vec3f,
	@location(1) corner    : vec2f,
	@location(2) size      : f32,
	@location(3) cover     : f32,
	@location(4) radius    : f32,
	@location(5) windRate  : f32,
	@location(6) shade     : f32,
) -> BoxOut {
	let turned = rotateAboutWind(direction, wind.time * windRate);
	let center = turned * radius;

	// **The box's own two lateral axes, taken straight out of its matrix.**
	// A billboard has no thickness, so the one thing it must not do is turn
	// edge-on to whatever is looking at it -- and here that is the sun. The
	// first two rows of the matrix are exactly the plane across the sun, each
	// scaled by one over the box's half-width, so normalising them gives the
	// facing frame with no cross product to go degenerate when the sun passes
	// whichever axis the cross was taken against.
	let right = normalize(vec3f(
		sunBox.toLight[0][0],
		sunBox.toLight[1][0],
		sunBox.toLight[2][0]
	));
	let up = normalize(vec3f(
		sunBox.toLight[0][1],
		sunBox.toLight[1][1],
		sunBox.toLight[2][1]
	));
	let position = center + right * (corner.x * size) + up * (corner.y * size);

	var out : BoxOut;
	out.clip = sunBox.toLight * vec4f(position, 1.0);
	out.cover = cover;
	// The shade a puff carries is how high it sits inside its own formation,
	// which says nothing about how much light it stops.
	_ = shade;
	return out;
}

@fragment
fn fragmentMain(in : BoxOut) -> @location(0) vec4f {
	// The same opacity the drawn puff has, so a cloud's shadow is as solid as
	// the cloud looks. The blend composites one puff over the last, so two
	// overlapping puffs stop more light than one and the total saturates at
	// all of it rather than running past.
	let opacity = clamp(in.cover, 0.0, 1.0) * PUFF_OPACITY;
	return vec4f(opacity, 0.0, 0.0, opacity);
}
`;
