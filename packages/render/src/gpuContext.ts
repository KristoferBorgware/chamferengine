/** A device, the canvas it draws to, and the format that canvas wants. */
export interface GpuContext {
	readonly device: GPUDevice;
	readonly context: GPUCanvasContext;
	readonly format: GPUTextureFormat;
	readonly canvas: HTMLCanvasElement;
}

/** Raised when the browser or the machine cannot supply a device. */
export class NoWebGPUError extends Error {}

/**
 * Acquire a device and configure the canvas to draw to it.
 *
 * Three separate things can be missing — the API, an adapter, and a device —
 * and each produces its own message, because "WebGPU is unavailable" sends
 * someone with a blocked driver to update a browser that is already current.
 */
export async function createGpuContext(
	canvas: HTMLCanvasElement,
): Promise<GpuContext> {
	if (!("gpu" in navigator))
		throw new NoWebGPUError(
			"This browser does not expose WebGPU. Chrome, Edge and Safari support it; on Firefox it may need enabling.",
		);

	const adapter = await navigator.gpu.requestAdapter();
	if (!adapter)
		throw new NoWebGPUError(
			"WebGPU is present but no adapter accepted the request, which usually means the graphics driver is blocked or out of date.",
		);

	const device = await adapter.requestDevice();
	const context = canvas.getContext("webgpu");
	if (!context)
		throw new NoWebGPUError(
			"The canvas would not return a WebGPU context.",
		);

	const format = navigator.gpu.getPreferredCanvasFormat();
	context.configure({ device, format, alphaMode: "opaque" });
	return { device, context, format, canvas };
}

/**
 * Match the drawing buffer to the element's size in device pixels.
 *
 * Returns true when the size changed, so the caller knows to rebuild anything
 * sized against it. The dimensions are clamped to what the device accepts, and
 * to at least one pixel: a zero-sized texture is an error rather than an empty
 * frame.
 */
export function resizeToDisplay(ctx: GpuContext): boolean {
	const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
	const max = ctx.device.limits.maxTextureDimension2D;
	const width = Math.max(
		1,
		Math.min(max, Math.floor(ctx.canvas.clientWidth * dpr)),
	);
	const height = Math.max(
		1,
		Math.min(max, Math.floor(ctx.canvas.clientHeight * dpr)),
	);
	if (ctx.canvas.width === width && ctx.canvas.height === height)
		return false;
	ctx.canvas.width = width;
	ctx.canvas.height = height;
	return true;
}
