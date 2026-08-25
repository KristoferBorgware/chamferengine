/**
 * What the atmosphere model actually puts on screen, as numbers.
 *
 * A CPU replica of `ATMOSPHERE_SHADER`'s own march -- the same density curve,
 * the same optical depth, the same phase functions -- so a set of knobs can be
 * judged before a frame is taken. A frame says the sky looks wrong; this says
 * which channel is wrong and by how much.
 *
 * Optical depth is integrated numerically here rather than read from the baked
 * table, so what it reports is the model's converged answer and not the
 * table's resolution. The step count the shader actually runs is reported
 * alongside, to show what the discretisation costs.
 *
 *   npx vite-node tools/trial-sky.ts
 */

/** Metres. The shipped world: depth 13, 1 m blocks, radius = blockSize * 2^d / K. */
const PLANET_RADIUS = (1 * 2 ** 13) / 1.20459;

interface Knobs {
	readonly wavelengths: readonly [number, number, number];
	readonly scatteringStrength: number;
	readonly densityFalloff: number;
	readonly atmosphereScale: number;
	readonly intensity: number;
	readonly mieStrength: number;
	readonly mieDirection: number;

	/** Whether the phase functions run at all, for measuring what they buy. */
	readonly usePhase?: boolean;
}

const SHIPPED: Knobs = {
	wavelengths: [700, 530, 440],
	scatteringStrength: 21.23,
	densityFalloff: 4.3,
	atmosphereScale: 0.322,
	intensity: 1,
	mieStrength: 0,
	mieDirection: 0,
};

type V3 = [number, number, number];

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: V3) => Math.sqrt(dot(a, a));
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const norm = (a: V3): V3 => mul(a, 1 / len(a));

const FAR = 1e30;

/** Near distance and length through, matching the shader's own `raySphere`. */
function raySphere(radius: number, origin: V3, dir: V3): [number, number] {
	const b = dot(origin, dir);
	const c = dot(origin, origin) - radius * radius;
	const d = b * b - c;
	if (d < 0) return [FAR, 0];
	const s = Math.sqrt(d);
	const far = -b + s;
	if (far < 0) return [FAR, 0];
	return [Math.max(0, -b - s), far - Math.max(0, -b - s)];
}

function topRadius(k: Knobs): number {
	return PLANET_RADIUS * (1 + k.atmosphereScale);
}

/** Rayleigh's own coefficients, at their strength. */
function beta(k: Knobs): V3 {
	return k.wavelengths.map(
		(nm) => (400 / nm) ** 4 * k.scatteringStrength,
	) as unknown as V3;
}

function densityAt(point: V3, k: Knobs): number {
	const height = len(point) - PLANET_RADIUS;
	const h01 = Math.min(1, Math.max(0, height / (topRadius(k) - PLANET_RADIUS)));
	return Math.exp(-h01 * k.densityFalloff) * (1 - h01);
}

/**
 * Density integrated along a ray, in planet-radius units.
 *
 * The division by the planet's radius is what the shader's own read site does
 * after sampling the baked table: the table is honest metres, and every
 * coefficient it is multiplied against is calibrated against a unit sphere.
 */
function opticalDepth(
	origin: V3,
	dir: V3,
	rayLength: number,
	k: Knobs,
	steps: number,
): number {
	if (rayLength <= 0) return 0;
	const step = rayLength / (steps - 1);
	let sum = 0;
	let point = origin;
	for (let i = 0; i < steps; i++) {
		sum += densityAt(point, k) * step;
		point = add(point, mul(dir, step));
	}
	return sum / PLANET_RADIUS;
}

/** Normalised so its average over the whole sphere is 1, not 1 / 4pi. */
function phaseRayleigh(cosTheta: number): number {
	return 0.75 * (1 + cosTheta * cosTheta);
}

/** Henyey-Greenstein, on the same average-of-1 convention. */
function phaseMie(cosTheta: number, g: number): number {
	const gg = g * g;
	return (1 - gg) / Math.pow(Math.max(1e-4, 1 + gg - 2 * g * cosTheta), 1.5);
}

/** Whether the planet stands between a point and the sun. */
function inShadow(point: V3, sun: V3): boolean {
	return raySphere(PLANET_RADIUS, point, sun)[0] < FAR;
}

/** In-scattered light along one view ray, as the shader computes it. */
function scatter(
	eye: V3,
	dir: V3,
	sun: V3,
	k: Knobs,
	steps: number,
	depthSteps = 24,
): V3 {
	const top = topRadius(k);
	const shell = raySphere(top, eye, dir);
	const ground = raySphere(PLANET_RADIUS, eye, dir);
	const toSurface = Math.min(FAR, ground[0]);
	const through = Math.min(shell[1], toSurface - shell[0]);
	if (through <= 0) return [0, 0, 0];

	const start = add(eye, mul(dir, shell[0]));
	const step = through / steps;
	const b = beta(k);
	const mie = k.mieStrength;
	const cosTheta = dot(dir, sun);
	const phases = k.usePhase ?? true;
	const pr = phases ? phaseRayleigh(cosTheta) : 1;
	const pm = phases ? phaseMie(cosTheta, k.mieDirection) : 1;

	const acc: V3 = [0, 0, 0];
	let point = start;
	for (let s = 0; s < steps; s++) {
		if (!inShadow(point, sun)) {
			const sunLength = raySphere(top, point, sun)[1];
			const sunDepth = opticalDepth(point, sun, sunLength, k, depthSteps);
			const viewDepth = opticalDepth(start, dir, step * s, k, depthSteps);
			const density = densityAt(point, k);
			for (let c = 0; c < 3; c++) {
				const extinction = b[c]! + mie;
				const t = Math.exp(-(sunDepth + viewDepth) * extinction);
				acc[c] += density * t * (b[c]! * pr + mie * pm);
			}
		}
		point = add(point, mul(dir, step));
	}
	const scale = (k.intensity * step) / PLANET_RADIUS;
	return mul(acc, scale);
}

/** A direction at a given elevation above the horizon, in the sun's own plane. */
function look(elevationDeg: number, awayFromSun: boolean): V3 {
	const e = (elevationDeg * Math.PI) / 180;
	const side = awayFromSun ? -1 : 1;
	return norm([side * Math.cos(e), Math.sin(e), 0]);
}

/** The sun at a given elevation, in the same plane. */
function sunAt(elevationDeg: number): V3 {
	const e = (elevationDeg * Math.PI) / 180;
	return norm([Math.cos(e), Math.sin(e), 0]);
}

const EYE: V3 = [0, PLANET_RADIUS + 2, 0];

function show(v: V3): string {
	return v.map((c) => c.toFixed(3).padStart(7)).join(" ");
}

/** How blue a colour is, as blue over red. A clear zenith runs about 3 to 5. */
function blueness(v: V3): number {
	return v[2] / Math.max(1e-6, v[0]);
}

function report(name: string, k: Knobs, steps = 10): void {
	console.log(`\n=== ${name} ===`);
	console.log(
		`  strength ${k.scatteringStrength}  falloff ${k.densityFalloff}  ` +
			`scale ${k.atmosphereScale}  intensity ${k.intensity}  ` +
			`mie ${k.mieStrength} g ${k.mieDirection}`,
	);
	for (const sunEl of [60, 20, 8, 2]) {
		const sun = sunAt(sunEl);
		// Up is +y here, and the eye stands at the north pole of the model, so
		// "elevation 90" is straight up whatever the sun is doing.
		const zenith = scatter(EYE, [0, 1, 0], sun, k, steps);
		const toward = scatter(EYE, look(10, false), sun, k, steps);
		const away = scatter(EYE, look(10, true), sun, k, steps);
		console.log(
			`  sun ${String(sunEl).padStart(2)}deg  ` +
				`zenith ${show(zenith)} (B/R ${blueness(zenith).toFixed(2)})  ` +
				`toward ${show(toward)}  away ${show(away)}`,
		);
	}
}

report("shipped defaults, as the shader runs them today (no phase)", {
	...SHIPPED,
	usePhase: false,
});
report("Lague's own class defaults", {
	...SHIPPED,
	scatteringStrength: 20,
	densityFalloff: 0.25,
	atmosphereScale: 0.5,
	usePhase: false,
});

console.log("\n\n########## SWEEPS ##########");

for (const falloff of [0.25, 1, 2, 4.3, 8]) {
	const k = { ...SHIPPED, densityFalloff: falloff };
	const sun = sunAt(60);
	const zenith = scatter(EYE, [0, 1, 0], sun, k, 10);
	const horizon = scatter(EYE, look(2, true), sun, k, 10);
	console.log(
		`falloff ${String(falloff).padStart(5)}  ` +
			`zenith ${show(zenith)} B/R ${blueness(zenith).toFixed(2)}  ` +
			`horizon ${show(horizon)} B/R ${blueness(horizon).toFixed(2)}`,
	);
}

console.log("");
for (const strength of [5, 10, 20, 21.23, 40, 80]) {
	const k = { ...SHIPPED, scatteringStrength: strength };
	const sun = sunAt(60);
	const zenith = scatter(EYE, [0, 1, 0], sun, k, 10);
	console.log(
		`strength ${String(strength).padStart(6)}  ` +
			`zenith ${show(zenith)} B/R ${blueness(zenith).toFixed(2)}`,
	);
}

console.log("");
for (const scale of [0.05, 0.1, 0.2, 0.322, 0.5]) {
	const k = { ...SHIPPED, atmosphereScale: scale };
	const sun = sunAt(60);
	const zenith = scatter(EYE, [0, 1, 0], sun, k, 10);
	console.log(
		`scale ${String(scale).padStart(6)}  air ${(PLANET_RADIUS * scale).toFixed(0)} m  ` +
			`zenith ${show(zenith)} B/R ${blueness(zenith).toFixed(2)}`,
	);
}

console.log("\n\n########## CANDIDATE DEFAULTS ##########");

/**
 * Every knob that raises brightness also kills the blue, because all three of
 * strength, scale and falloff move one quantity -- how much air the light
 * crosses -- and blue extinguishes 6.4 times faster than red. So thickness is
 * chosen for the HUE and `intensity` is what makes it bright.
 */
const CANDIDATES: Record<string, Partial<Knobs>> = {
	"A thin+bright": {
		scatteringStrength: 6,
		densityFalloff: 4.3,
		atmosphereScale: 0.25,
		intensity: 4,
		mieStrength: 0.4,
		mieDirection: 0.76,
	},
	"B thinner": {
		scatteringStrength: 5,
		densityFalloff: 6,
		atmosphereScale: 0.18,
		intensity: 6,
		mieStrength: 0.3,
		mieDirection: 0.76,
	},
	"C midweight": {
		scatteringStrength: 8,
		densityFalloff: 4.3,
		atmosphereScale: 0.3,
		intensity: 3,
		mieStrength: 0.5,
		mieDirection: 0.76,
	},
	"D no mie": {
		scatteringStrength: 6,
		densityFalloff: 4.3,
		atmosphereScale: 0.25,
		intensity: 4,
		mieStrength: 0,
		mieDirection: 0.76,
	},
};

for (const [name, over] of Object.entries(CANDIDATES)) {
	report(name, { ...SHIPPED, ...over });
}

/**
 * How much of what stands behind the air still reaches the eye.
 *
 * This is what colours the sun's own disc: the disc is drawn at a flat warm
 * white and then multiplied by this, so a long path at sunset is the whole
 * reason the sun goes red rather than a colour anybody picked.
 */
function transmittanceAlong(eye: V3, dir: V3, k: Knobs, depthSteps = 48): V3 {
	const top = topRadius(k);
	const shell = raySphere(top, eye, dir);
	const ground = raySphere(PLANET_RADIUS, eye, dir);
	const through = Math.min(shell[1], Math.min(FAR, ground[0]) - shell[0]);
	if (through <= 0) return [1, 1, 1];
	const start = add(eye, mul(dir, shell[0]));
	const depth = opticalDepth(start, dir, through, k, depthSteps);
	const b = beta(k);
	return [0, 1, 2].map((c) =>
		Math.exp(-depth * (b[c]! + k.mieStrength)),
	) as unknown as V3;
}

console.log("\n\n########## SEARCH: a blue noon AND a red sunset ##########");
console.log(
	"  dayB/R = blue over red at the zenith, 60deg sun (want 4+)\n" +
		"  setR/B = red over blue looking at a 2deg sun (want 1.5+)\n" +
		"  discR/B = the sun disc's own colour there (want 3+)\n" +
		"  bright = brightest channel at the zenith at noon, after intensity",
);
{
	interface Row {
		label: string;
		dayBR: number;
		setRB: number;
		discRB: number;
		bright: number;
		intensity: number;
	}
	const rows: Row[] = [];
	for (const strength of [4, 6, 8, 12, 16]) {
		for (const falloff of [2, 4.3, 8, 14]) {
			for (const scale of [0.15, 0.25, 0.4]) {
				const base: Knobs = {
					...SHIPPED,
					scatteringStrength: strength,
					densityFalloff: falloff,
					atmosphereScale: scale,
					mieStrength: 0.4,
					mieDirection: 0.76,
					intensity: 1,
				};
				const noon = sunAt(60);
				const zen = scatter(EYE, [0, 1, 0], noon, base, 10);
				// Pick the intensity that puts the zenith at a readable level,
				// so every row is compared at the same brightness.
				const intensity = 0.85 / Math.max(1e-5, Math.max(...zen));
				const k = { ...base, intensity };
				const zenith = scatter(EYE, [0, 1, 0], noon, k, 10);
				const low = sunAt(2);
				const toward = scatter(EYE, look(2, false), low, k, 10);
				const disc = transmittanceAlong(EYE, look(2, false), k);
				rows.push({
					label:
						`str ${String(strength).padStart(2)} fall ${String(falloff).padStart(4)} ` +
						`scale ${scale.toFixed(2)}`,
					dayBR: blueness(zenith),
					setRB: toward[0] / Math.max(1e-6, toward[2]),
					discRB: disc[0] / Math.max(1e-9, disc[2]),
					bright: Math.max(...zenith),
					intensity,
				});
			}
		}
	}
	rows.sort(
		(a, b) =>
			Math.min(b.dayBR / 5, 1) * Math.min(b.setRB / 2, 1) -
			Math.min(a.dayBR / 5, 1) * Math.min(a.setRB / 2, 1),
	);
	for (const r of rows.slice(0, 14))
		console.log(
			`  ${r.label}  dayB/R ${r.dayBR.toFixed(2).padStart(5)}  ` +
				`setR/B ${r.setRB.toFixed(2).padStart(5)}  ` +
				`discR/B ${r.discRB.toFixed(1).padStart(7)}  ` +
				`intensity ${r.intensity.toFixed(2).padStart(5)}`,
		);
}

console.log("\n\n########## THE SUN'S OWN HALO (candidate A) ##########");
{
	const k: Knobs = { ...SHIPPED, ...CANDIDATES["A thin+bright"]! };
	const sun = sunAt(10);
	console.log("  angle from the sun, along the sky, at a 10 degree sun:");
	for (const off of [0, 2, 5, 10, 20, 45, 90]) {
		const dir = look(10 + off, false);
		const c = scatter(EYE, dir, sun, k, 10);
		console.log(`   +${String(off).padStart(2)}deg  ${show(c)}`);
	}
}

