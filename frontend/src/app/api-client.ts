export async function fetchApi(
	path: string,
	init?: RequestInit,
	token?: string,
	timeoutMs = 5000,
) {
	const apiUrl =
		process.env.F1_BACKEND_URL ??
		process.env.API_BASE_URL ??
		"http://127.0.0.1:8080";
	const headers = new Headers(init?.headers);
	if (token) headers.set("Authorization", `Bearer ${token}`);

	const timeout = AbortSignal.timeout(timeoutMs);
	return fetch(new URL(path, apiUrl), {
		...init,
		headers,
		cache: "no-store",
		redirect: "error",
		signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
	});
}
