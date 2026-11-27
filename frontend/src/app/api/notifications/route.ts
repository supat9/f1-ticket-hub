import { fetchApi } from "../../api-client";
import { readSessionToken } from "../../session";

const headers = { "Cache-Control": "private, no-store" };

async function notifications(init?: RequestInit) {
	const token = await readSessionToken();
	if (!token) return new Response(null, { status: 401, headers });

	const response = await fetchApi("/api/notifications", init, token).catch(
		() => null,
	);
	if (!response?.ok || response.status === 204) {
		return new Response(null, { status: response?.status ?? 503, headers });
	}
	return new Response(response.body, {
		headers: { ...headers, "Content-Type": "application/json" },
	});
}

export function GET() {
	return notifications();
}

export async function PATCH(request: Request) {
	const body = await request.json().catch(() => null);
	if (!body) return new Response(null, { status: 400, headers });
	return notifications({
		method: "PATCH",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}
