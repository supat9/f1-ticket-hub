import { fetchApi } from "../../../../api-client";
import { readSessionToken } from "../../../../session";

export async function GET(
	_request: Request,
	context: RouteContext<"/api/ticket-images/[ticketId]/[imageId]">,
) {
	const headers = { "Cache-Control": "private, no-store" };
	const { ticketId, imageId } = await context.params;
	if (![ticketId, imageId].every((id) => /^[1-9]\d{0,18}$/.test(id))) {
		return new Response(null, { status: 404, headers });
	}
	const token = await readSessionToken();
	if (!token) return new Response(null, { status: 401, headers });
	const response = await fetchApi(
		`/api/tickets/${ticketId}/images/${imageId}`,
		undefined,
		token,
	).catch(() => null);
	if (!response?.ok)
		return new Response(null, { status: response?.status ?? 503, headers });
	const type = response.headers.get("Content-Type");
	if (type !== "image/jpeg" && type !== "image/png")
		return new Response(null, { status: 502, headers });
	return new Response(response.body, {
		headers: {
			...headers,
			"Content-Type": type,
			"X-Content-Type-Options": "nosniff",
		},
	});
}
