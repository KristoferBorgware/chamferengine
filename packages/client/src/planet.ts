import { Mat4 } from "chamfer/math";
import {
	LatticeRenderer,
	NoWebGPUError,
	buildLatticeGeometry,
	createGpuContext,
	resizeToDisplay,
} from "chamfer/render";

const RADIUS = 1700;
const DEPTH = 4;

const canvas = document.querySelector<HTMLCanvasElement>("#viewport")!;
const status = document.querySelector<HTMLDivElement>("#status")!;

const params = new URLSearchParams(location.search);
const seed = params.get("seed") ?? "chamfer";

// The shell is a test object rather than part of the world: a plain
// see-through sphere that answers whether the blend path works before any
// water exists to depend on it. Off unless asked for.
const showShell = params.get("shell") === "1";

function report(lines: string[]): void {
	status.textContent = lines.join("\n");
}

async function main(): Promise<void> {
	const ctx = await createGpuContext(canvas);
	const renderer = new LatticeRenderer(ctx);

	const surface = buildLatticeGeometry(DEPTH, RADIUS);
	renderer.addPass(surface, [1, 1, 1, 1]);

	if (showShell) {
		// One flat color for the whole pass. A shell carrying the surface's own
		// per-cell colors tints each cell with a shade of itself and disappears
		// against everything except the background beyond the planet's edge.
		const shell = buildLatticeGeometry(DEPTH, RADIUS * 1.03);
		renderer.addPass(shell, [0.42, 0.72, 1, 0.42], 1);
	}

	report([
		`seed "${seed}"`,
		`level ${DEPTH} · ${surface.cellCount.toLocaleString("en-GB")} cells · ${surface.triangleCount.toLocaleString("en-GB")} triangles`,
		"drag to turn · scroll to zoom",
		showShell
			? "translucent shell on"
			: "add ?shell=1 for the translucent shell",
	]);

	let yaw = 0.6;
	let pitch = 0.35;
	let distance = RADIUS * 3.1;
	let dragging = false;
	let lastX = 0;
	let lastY = 0;
	let spinning = true;

	canvas.addEventListener("pointerdown", (e) => {
		dragging = true;
		spinning = false;
		lastX = e.clientX;
		lastY = e.clientY;
		canvas.setPointerCapture(e.pointerId);
	});
	canvas.addEventListener("pointerup", (e) => {
		dragging = false;
		canvas.releasePointerCapture(e.pointerId);
	});
	canvas.addEventListener("pointermove", (e) => {
		if (!dragging) return;
		yaw -= (e.clientX - lastX) * 0.005;
		pitch = Math.max(
			-1.45,
			Math.min(1.45, pitch - (e.clientY - lastY) * 0.005),
		);
		lastX = e.clientX;
		lastY = e.clientY;
	});
	canvas.addEventListener(
		"wheel",
		(e) => {
			e.preventDefault();
			distance = Math.max(
				RADIUS * 1.25,
				Math.min(RADIUS * 9, distance * (1 + e.deltaY * 0.001)),
			);
		},
		{ passive: false },
	);

	let previous = 0;
	const draw = (now: number) => {
		const dt = previous ? (now - previous) / 1000 : 0;
		previous = now;
		if (spinning) yaw += dt * 0.18;

		resizeToDisplay(ctx);
		const eye: [number, number, number] = [
			Math.cos(pitch) * Math.sin(yaw) * distance,
			Math.sin(pitch) * distance,
			Math.cos(pitch) * Math.cos(yaw) * distance,
		];
		const view = Mat4.lookAt(eye, [0, 0, 0], [0, 1, 0]);
		const projection = Mat4.perspective(
			(50 * Math.PI) / 180,
			canvas.width / canvas.height,
			RADIUS * 0.05,
			RADIUS * 20,
		);
		renderer.render({ viewProj: projection.multiply(view), eye });
		requestAnimationFrame(draw);
	};
	requestAnimationFrame(draw);
}

main().catch((err: unknown) => {
	if (err instanceof NoWebGPUError) report([err.message]);
	else report(["Something went wrong starting the renderer.", String(err)]);
});
