import { fetchApi } from "../../../api-client";
import { readSessionToken } from "../../../session";

export async function GET(request: Request) {
	const headers = { "Cache-Control": "private, no-store" };
	const token = await readSessionToken();
	if (!token) return new Response(null, { status: 401, headers });

	const input = new URL(request.url).searchParams;
	const query = new URLSearchParams();
	for (const key of ["q", "filter", "priority", "status", "from", "to"]) {
		const value = input.get(key);
		if (value) query.set(key, value);
	}
	const response = await fetchApi(
		`/api/tickets/export?${query}`,
		{ signal: request.signal },
		token,
		60000,
	).catch(() => null);
	if (!response?.ok)
		return new Response(null, { status: response?.status ?? 503, headers });
	const disposition = response.headers.get("Content-Disposition");
	const contentType = response.headers.get("Content-Type");
	if (!disposition || !contentType?.startsWith("text/csv")) {
		return new Response(null, { status: 502, headers });
	}
	return new Response(response.body, {
		headers: {
			...headers,
			"Content-Type": contentType,
			"Content-Disposition": disposition,
			"X-Content-Type-Options": "nosniff",
		},
	});
}
