import { stickVector } from "./stickVector.js";

/** What a control does when it is pressed rather than held. */
export interface TouchActions {
	/** Fly on or off. */
	readonly onFly: () => void;

	/** Stand on the ground under the camera. */
	readonly onStand: () => void;
}

/**
 * A thumbstick and two buttons, for a device with no keyboard.
 *
 * The split is between what is **held** and what is **momentary**. Looking and
 * zooming are momentary — a finger drags and lets go — so they are gestures on
 * the world itself and need nothing drawn. Moving and climbing are held, and a
 * finger holding a direction cannot also be dragging the view, so those are
 * the two things that have to become widgets. That is the whole reason this
 * class exists rather than a third and fourth gesture.
 *
 * Nothing appears until a touch actually happens. A mouse never reveals the
 * controls, and a laptop with a touch screen reveals them only if somebody
 * touches it, so no desktop loses a corner of the view to a control it will
 * never use.
 */
export class TouchControls {
	/** Forward at 1, back at -1. Read once a frame. */
	ahead = 0;

	/** Right at 1, left at -1. */
	aside = 0;

	/** Up at 1, down at -1. */
	lift = 0;

	private readonly root: HTMLDivElement;
	private readonly pad: HTMLDivElement;
	private readonly knob: HTMLDivElement;
	private shown = false;

	/** The pointer driving the stick, and where the pad's middle is. */
	private stick: number | null = null;
	private centreX = 0;
	private centreY = 0;
	private radius = 1;

	constructor(actions: TouchActions) {
		this.root = document.createElement("div");
		this.root.className = "touch hidden";

		this.pad = document.createElement("div");
		this.pad.className = "touch-pad";
		this.knob = document.createElement("div");
		this.knob.className = "touch-knob";
		this.pad.appendChild(this.knob);
		this.root.appendChild(this.pad);

		const side = document.createElement("div");
		side.className = "touch-side";
		side.appendChild(this.held("▲", 1));
		side.appendChild(this.held("▼", -1));
		side.appendChild(this.tapped("fly", actions.onFly));
		side.appendChild(this.tapped("land", actions.onStand));
		this.root.appendChild(side);

		document.body.appendChild(this.root);
		this.watchStick();
	}

	/**
	 * Show the controls, on the first touch there ever is.
	 *
	 * Idempotent, because the caller cannot easily know which touch is first.
	 */
	reveal(): void {
		if (this.shown) return;
		this.shown = true;
		this.root.classList.remove("hidden");
	}

	/** A button that means something for as long as it is held down. */
	private held(label: string, lift: number): HTMLButtonElement {
		const button = document.createElement("button");
		button.className = "touch-button";
		button.textContent = label;
		const press = (e: PointerEvent) => {
			e.preventDefault();
			button.setPointerCapture(e.pointerId);
			this.lift = lift;
		};
		const release = () => {
			// Only if this button is the one still holding it: releasing the
			// up button while down is held must not cancel down.
			if (this.lift === lift) this.lift = 0;
		};
		button.addEventListener("pointerdown", press);
		button.addEventListener("pointerup", release);
		button.addEventListener("pointercancel", release);
		return button;
	}

	/** A button that means something once, when it is let go. */
	private tapped(label: string, act: () => void): HTMLButtonElement {
		const button = document.createElement("button");
		button.className = "touch-button touch-tap";
		button.textContent = label;
		button.addEventListener("pointerdown", (e) => {
			e.preventDefault();
			act();
		});
		return button;
	}

	/** Drive the stick from whichever pointer landed on the pad. */
	private watchStick(): void {
		this.pad.addEventListener("pointerdown", (e) => {
			e.preventDefault();
			const box = this.pad.getBoundingClientRect();
			this.centreX = box.left + box.width / 2;
			this.centreY = box.top + box.height / 2;
			this.radius = box.width / 2;
			this.stick = e.pointerId;
			this.pad.setPointerCapture(e.pointerId);
			this.moveStick(e.clientX, e.clientY);
		});
		this.pad.addEventListener("pointermove", (e) => {
			if (this.stick !== e.pointerId) return;
			e.preventDefault();
			this.moveStick(e.clientX, e.clientY);
		});
		const let_go = (e: PointerEvent) => {
			if (this.stick !== e.pointerId) return;
			this.stick = null;
			this.ahead = 0;
			this.aside = 0;
			this.knob.style.transform = "";
		};
		this.pad.addEventListener("pointerup", let_go);
		this.pad.addEventListener("pointercancel", let_go);
	}

	private moveStick(x: number, y: number): void {
		const dx = x - this.centreX;
		const dy = y - this.centreY;
		const vector = stickVector(dx, dy, this.radius);
		this.ahead = vector.ahead;
		this.aside = vector.aside;
		// The knob follows the thumb but never leaves the pad.
		const distance = Math.sqrt(dx * dx + dy * dy) || 1;
		const held = Math.min(1, distance / this.radius) * this.radius * 0.6;
		this.knob.style.transform = `translate(${(dx / distance) * held}px, ${
			(dy / distance) * held
		}px)`;
	}
}
