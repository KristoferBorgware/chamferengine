import { describe, expect, it } from "vitest";
import { clickIntent } from "../src/clickIntent.js";

const mouse = (captured: boolean, canCapture = true) =>
	clickIntent({ pointerType: "mouse", captured, canCapture });

describe("clickIntent", () => {
	it("acts on every mouse press, captured or not", () => {
		// The bug this table exists for: the press that captures the mouse
		// used to do nothing else, and the mouse is let go often enough --
		// Escape, a panel row, another window -- that a real click was spent
		// every time the player came back. The symptom is "nothing happened,
		// so I clicked again".
		expect(mouse(true).act).toBe(true);
		expect(mouse(false).act).toBe(true);
	});

	it("asks for the mouse only when it does not already have it", () => {
		expect(mouse(false).capture).toBe(true);
		expect(mouse(true).capture).toBe(false);
	});

	it("never drags while the mouse is captured", () => {
		// Captured, the pointer has no position on the page, so tracking one
		// would turn the view on a movement the drag has already turned it on.
		expect(mouse(true).drag).toBe(false);
		expect(mouse(false).drag).toBe(false);
	});

	it("falls back to the drag when the browser refuses to capture", () => {
		const refused = mouse(false, false);
		expect(refused).toEqual({ capture: false, act: false, drag: true });
	});

	it("leaves a finger on the drag path, with no capture and no cursor", () => {
		for (const pointerType of ["touch", "pen"]) {
			const at = clickIntent({
				pointerType,
				captured: false,
				canCapture: true,
			});
			expect(at).toEqual({ capture: false, act: false, drag: true });
		}
	});
});
