import type { CoarseField, CoarseMap } from "chamfer/generation";
import { coarseFieldOf } from "chamfer/generation";
import { positionToCell } from "chamfer/addressing";
import { Vec3 } from "chamfer/math";
import { rampColor } from "./rampColor.js";

/** Icosahedron corners, the same twelve the engine builds every world from. */
const T = (1 + Math.sqrt(5)) / 2;
const norm = (v: number[]): number[] => {
	const l = Math.sqrt(v[0]! * v[0]! + v[1]! * v[1]! + v[2]! * v[2]!);
	return [v[0]! / l, v[1]! / l, v[2]! / l];
};
const CORNERS = [
	[-1, T, 0],
	[1, T, 0],
	[-1, -T, 0],
	[1, -T, 0],
	[0, -1, T],
	[0, 1, T],
	[0, -1, -T],
	[0, 1, -T],
	[T, 0, -1],
	[T, 0, 1],
	[-T, 0, -1],
	[-T, 0, 1],
].map(norm);
const FACES = [
	[0, 11, 5],
	[0, 5, 1],
	[0, 1, 7],
	[0, 7, 10],
	[0, 10, 11],
	[1, 5, 9],
	[5, 11, 4],
	[11, 10, 2],
	[10, 7, 6],
	[7, 1, 8],
	[3, 9, 4],
	[3, 4, 2],
	[3, 2, 6],
	[3, 6, 8],
	[3, 8, 9],
	[4, 9, 5],
	[2, 4, 11],
	[6, 2, 10],
	[8, 6, 7],
	[9, 8, 1],
];

/** How finely the ball is cut. Level 5 is 20,480 triangles. */
const LEVEL = 5;

/** How long a finger is held still before it picks, in milliseconds. */
const HOLD_MS = 450;

/** How far it may wander in that time, in pixels, and still count as held. */
const HOLD_SLOP = 10;

/**
 * The same field, wrapped back onto a ball, turned by dragging.
 *
 * The flat picture is the one that shows the whole planet at once, and it is
 * the one that lies about shape: a landmass near a pole is drawn many times
 * wider than it is. This is the same values on a ball, so the two together say
 * what the map holds and what it looks like.
 *
 * It is drawn on a plain 2D canvas rather than through the renderer. The ball
 * is a fixed 20,480 triangles whatever the map's level, each one filled with
 * the field's color at its own middle, and the far side is dropped by its
 * facing rather than sorted.
 */
export class SphereView {
	private readonly canvas: HTMLCanvasElement;
	private readonly context: CanvasRenderingContext2D;

	/** Three corner directions per triangle, and the middle of each. */
	private readonly corners: Float64Array;
	private readonly middles: Float64Array;
	private readonly count: number;

	/** Told where a right-click landed, as a direction on the ball. */
	private onPick: (at: [number, number, number]) => void = () => {};

	private yaw = 0.6;
	private pitch = 0.35;
	private map: CoarseMap | null = null;
	private field: CoarseField | null = null;
	private marker: { x: number; y: number; z: number } | null = null;

	/** The ball as last filled, so moving the mark does not fill it again. */
	private filled: ImageData | null = null;

	/**
	 * Whether the canvas is on screen.
	 *
	 * A caller that keeps the ball hidden still calls {@link show} on every
	 * map rebuild step and {@link setMarker} on every player move, so both
	 * take the new state without drawing it -- 20,480 triangles is not worth
	 * paying for a canvas nobody can see. Turning this on catches up in one
	 * draw from whatever was last handed over.
	 */
	private visible = true;

	constructor(canvas: HTMLCanvasElement) {
		this.canvas = canvas;
		this.context = canvas.getContext("2d")!;

		const n = 1 << LEVEL;
		this.count = 20 * n * n;
		this.corners = new Float64Array(this.count * 9);
		this.middles = new Float64Array(this.count * 3);
		let at = 0;
		for (const face of FACES) {
			const [A, B, C] = face.map((k) => CORNERS[k]!);
			const point = (i: number, j: number): number[] => {
				const a = (n - i) / n,
					b = (i - j) / n,
					c = j / n;
				return norm([
					A![0]! * a + B![0]! * b + C![0]! * c,
					A![1]! * a + B![1]! * b + C![1]! * c,
					A![2]! * a + B![2]! * b + C![2]! * c,
				]);
			};
			for (let i = 0; i < n; i++)
				for (let j = 0; j <= i; j++) {
					this.put(
						at++,
						point(i, j),
						point(i + 1, j),
						point(i + 1, j + 1),
					);
					if (j < i)
						this.put(
							at++,
							point(i, j),
							point(i + 1, j + 1),
							point(i, j + 1),
						);
				}
		}

		let dragging = false;
		let lastX = 0,
			lastY = 0;

		// A finger has no second button, so a press held still picks instead.
		// Held still is the whole of it: any movement past the slop cancels,
		// which is what keeps a slow drag from teleporting somebody.
		let mouse = true;
		let holding: ReturnType<typeof setTimeout> | null = null;
		const drop = () => {
			if (holding !== null) clearTimeout(holding);
			holding = null;
		};

		const down = (x: number, y: number) => {
			dragging = true;
			lastX = x;
			lastY = y;
		};
		const move = (x: number, y: number) => {
			if (!dragging) return;
			this.yaw += (x - lastX) * 0.01;
			this.pitch = Math.max(
				-1.5,
				Math.min(1.5, this.pitch + (y - lastY) * 0.01),
			);
			lastX = x;
			lastY = y;
			this.draw();
		};

		/** Point at a place on the ball, in canvas pixels. */
		const pick = (x: number, y: number) => {
			const at = this.directionAt(x, y);
			if (at) this.onPick(at);
		};

		// Right-click picks rather than turns. The ball is the only place on
		// screen showing the whole planet at once, so it is the only place a
		// person can point at somewhere they cannot see.
		canvas.oncontextmenu = (e) => {
			// Always swallowed, so a long press on a touch screen does not
			// raise the browser's own menu over the ball.
			e.preventDefault();
			if (mouse) pick(e.offsetX, e.offsetY);
		};
		canvas.onpointerdown = (e) => {
			canvas.setPointerCapture(e.pointerId);
			mouse = e.pointerType === "mouse";
			down(e.clientX, e.clientY);
			if (mouse) return;
			const [ox, oy, sx, sy] = [
				e.offsetX,
				e.offsetY,
				e.clientX,
				e.clientY,
			];
			drop();
			holding = setTimeout(() => {
				holding = null;
				dragging = false;
				pick(ox, oy);
			}, HOLD_MS);
			// Held still is measured from here, so the slop check below has
			// somewhere to measure from.
			lastX = sx;
			lastY = sy;
			startX = sx;
			startY = sy;
		};
		let startX = 0,
			startY = 0;
		canvas.onpointermove = (e) => {
			if (
				holding !== null &&
				Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) >
					HOLD_SLOP
			)
				drop();
			move(e.clientX, e.clientY);
		};
		canvas.onpointerup = () => {
			drop();
			dragging = false;
		};
		canvas.onpointercancel = () => {
			drop();
			dragging = false;
		};
	}

	private put(at: number, a: number[], b: number[], c: number[]): void {
		const base = at * 9;
		for (let k = 0; k < 3; k++) {
			this.corners[base + k] = a[k]!;
			this.corners[base + 3 + k] = b[k]!;
			this.corners[base + 6 + k] = c[k]!;
			this.middles[at * 3 + k] = (a[k]! + b[k]! + c[k]!) / 3;
		}
	}

	/** What to do when somebody right-clicks, or holds a finger on, the ball. */
	picked(handler: (at: [number, number, number]) => void): void {
		this.onPick = handler;
	}

	/**
	 * The direction under a point on the canvas, or nothing if it missed.
	 *
	 * The ball is drawn straight down the z axis, so a screen point gives two
	 * of the three components and the sphere gives the third. The near face is
	 * the one with negative z, which is the half being drawn, and undoing the
	 * two turns in the opposite order puts the answer back in world directions.
	 */
	private directionAt(
		sx: number,
		sy: number,
	): [number, number, number] | null {
		const { width, height } = this.canvas;
		// The canvas is laid out at a different size from its pixel grid, so a
		// click has to be scaled into it before anything else.
		const rect = this.canvas.getBoundingClientRect();
		const px =
			(sx * (rect.width ? width / rect.width : 1) - width / 2) /
			(Math.min(width, height) * 0.46);
		const py =
			(height / 2 - sy * (rect.height ? height / rect.height : 1)) /
			(Math.min(width, height) * 0.46);
		const flat = px * px + py * py;
		if (flat > 1) return null;
		const pz = -Math.sqrt(1 - flat);

		const cy = Math.cos(this.yaw),
			sy2 = Math.sin(this.yaw);
		const cp = Math.cos(this.pitch),
			sp = Math.sin(this.pitch);
		// Undo the pitch, then the yaw.
		const y = py * cp + pz * sp;
		const z1 = -py * sp + pz * cp;
		const x = px * cy + z1 * sy2;
		const z = -px * sy2 + z1 * cy;
		return [x, y, z];
	}

	show(map: CoarseMap, field: CoarseField): void {
		this.map = map;
		this.field = field;
		if (this.visible) this.draw();
	}

	/** Whether the canvas is on screen, so drawing can stop while it is not. */
	setVisible(visible: boolean): void {
		this.visible = visible;
		if (visible) this.draw();
	}

	/** Put the filled ball back and draw the mark on it. */
	private markOnly(): void {
		if (!this.filled) {
			this.draw();
			return;
		}
		this.context.putImageData(this.filled, 0, 0);
		this.drawMarker();
	}

	/** Where the player stands, as a direction, or nothing to drop the mark. */
	setMarker(at: { x: number; y: number; z: number } | null): void {
		this.marker = at;
		if (!this.visible) return;
		// The ball is 20,480 triangles and the mark is one ring. Putting the
		// filled ball back and drawing the ring on it costs neither the
		// triangles nor a sample of the map per triangle.
		this.markOnly();
	}

	private draw(): void {
		const { width, height } = this.canvas;
		const ctx = this.context;
		ctx.clearRect(0, 0, width, height);
		if (!this.map || !this.field) return;

		const values = coarseFieldOf(this.map, this.field);
		const n = 1 << this.map.level;
		const cy = Math.cos(this.yaw),
			sy = Math.sin(this.yaw);
		const cp = Math.cos(this.pitch),
			sp = Math.sin(this.pitch);
		const radius = Math.min(width, height) * 0.46;
		const ox = width / 2,
			oy = height / 2;

		// Yaw about the vertical, then pitch about the horizontal. The viewer is
		// down the z axis, so a point with positive z after both is facing away.
		const turn = (
			x: number,
			y: number,
			z: number,
		): [number, number, number] => {
			const x1 = x * cy - z * sy;
			const z1 = x * sy + z * cy;
			const y2 = y * cp - z1 * sp;
			const z2 = y * sp + z1 * cp;
			return [x1, y2, z2];
		};

		for (let t = 0; t < this.count; t++) {
			const mx = this.middles[t * 3]!,
				my = this.middles[t * 3 + 1]!,
				mz = this.middles[t * 3 + 2]!;
			const [, , mzz] = turn(mx, my, mz);
			if (mzz > 0) continue; // the far side

			const cell = positionToCell(new Vec3(mx, my, mz), n);
			const value =
				values[this.map.index.indexOf(cell.face, cell.i, cell.j)] ?? 0;
			const [r, g, b] = rampColor(value, this.field);

			// A little shading, so the ball reads as one and not as a disc.
			const shade = 0.55 + 0.45 * Math.min(1, -mzz);
			ctx.fillStyle = `rgb(${r * shade} ${g * shade} ${b * shade})`;
			ctx.beginPath();
			for (let k = 0; k < 3; k++) {
				const base = t * 9 + k * 3;
				const [px, py] = turn(
					this.corners[base]!,
					this.corners[base + 1]!,
					this.corners[base + 2]!,
				);
				const sx = ox + px * radius;
				const sy2 = oy - py * radius;
				if (k === 0) ctx.moveTo(sx, sy2);
				else ctx.lineTo(sx, sy2);
			}
			ctx.closePath();
			ctx.fill();
		}

		this.filled = ctx.getImageData(0, 0, width, height);
		this.turned = turn;
		this.drawMarker();
	}

	/** How a direction reached the screen the last time the ball was filled. */
	private turned:
		| ((x: number, y: number, z: number) => [number, number, number])
		| null = null;

	/** The mark alone, over a ball that is already on the canvas. */
	private drawMarker(): void {
		if (!this.marker || !this.turned) return;
		const { width, height } = this.canvas;
		const radius = Math.min(width, height) * 0.46;
		const [px, py, pz] = this.turned(
			this.marker.x,
			this.marker.y,
			this.marker.z,
		);
		if (pz > 0) return; // round the far side
		const ctx = this.context;
		for (const [color, stroke] of [
			["#000", 4],
			["#fff", 1.8],
		] as const) {
			ctx.strokeStyle = color;
			ctx.lineWidth = stroke;
			ctx.beginPath();
			ctx.arc(
				width / 2 + px * radius,
				height / 2 - py * radius,
				5,
				0,
				2 * Math.PI,
			);
			ctx.stroke();
		}
	}
}
