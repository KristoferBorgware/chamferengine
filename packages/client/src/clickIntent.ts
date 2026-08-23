/** What a press on the canvas should do. */
export interface ClickIntent {
	/** Ask the browser for the mouse. */
	readonly capture: boolean;

	/** Break or place now, on the press itself. */
	readonly act: boolean;

	/** Track this pointer for a drag, and decide on release instead. */
	readonly drag: boolean;
}

/**
 * What a press on the canvas means, as one table rather than a chain of tests.
 *
 * There are only four cases and the whole of the input's behaviour is in them,
 * so they are written out where they can be read and tested rather than spread
 * through an event handler.
 *
 * **A press acts even when it is also the press that captures the mouse.** The
 * usual rule elsewhere is that the first click only captures, on the grounds
 * that clicking into a window to focus it should not fire a weapon. The cost
 * here is a click that silently does nothing, and the mouse is let go more
 * often than it looks -- `Escape`, a slider on the panel, and any move to
 * another window all drop it -- so that rule spends a real click every time the
 * player comes back, and the symptom is "nothing happened, so I clicked again".
 * Breaking one block too many is undoable; a control that ignores you is not.
 *
 * **Touch never captures.** There is no cursor to hide and no pointer to lock,
 * so a finger keeps the drag: it looks around by dragging, and a press that did
 * not travel is a click. A mouse falls back to exactly the same path when the
 * browser refuses to capture.
 */
export function clickIntent(at: {
	readonly pointerType: string;
	readonly captured: boolean;
	readonly canCapture: boolean;
}): ClickIntent {
	if (at.pointerType !== "mouse")
		return { capture: false, act: false, drag: true };
	if (at.captured) return { capture: false, act: true, drag: false };
	if (at.canCapture) return { capture: true, act: true, drag: false };
	return { capture: false, act: false, drag: true };
}
