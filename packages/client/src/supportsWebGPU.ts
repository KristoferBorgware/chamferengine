/**
 * Whether this browser exposes WebGPU and an adapter accepts a request.
 *
 * `navigator.gpu` being present is not sufficient: a browser can ship the API
 * and still fail to produce an adapter on a machine whose driver is blocked.
 * Both are checked here so a caller gets one answer.
 */
export async function supportsWebGPU(): Promise<boolean> {
	if (!("gpu" in navigator)) return false;
	try {
		const adapter = await navigator.gpu.requestAdapter();
		return adapter !== null;
	} catch {
		return false;
	}
}
