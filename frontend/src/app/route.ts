import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { changeLanguage } from "./language-action";
import { statusOrder } from "./tickets";
import { demoTicketCode, sampleTickets } from "./demo/data";
import { translator } from "../i18n/text";
import homeCopy from "./promo/home-copy.json";
import { checkoutReport } from "./demo/checkout-report";

const legacyQueueKeys = new Set<string>([
	"q",
	"ticket",
	"new",
	"view",
	"filter",
	"status",
	"priority",
	"from",
	"to",
	"page",
	"stage",
	"section",
	"activityBefore",
	"created",
	"createdId",
	"logout",
	...statusOrder,
]);

export async function GET(request: Request) {
	const url = new URL(request.url);
	if (
		Array.from(url.searchParams.keys()).some((key) => legacyQueueKeys.has(key))
	) {
		redirect(`/workspace${url.search}`);
	}
	const [template, locale] = await Promise.all([
		readFile(join(process.cwd(), "src/app/promo/home.html"), "utf8"),
		getLocale(),
	]);
	const th = translator("th");
	const statusKeys = {
		open: "new",
		in_progress: "working",
		resolved: "review",
		closed: "closed",
	};
	const board = sampleTickets.map((ticket) => ({
		id: demoTicketCode(ticket.id),
		title: [th(ticket.title), ticket.title],
		status: statusKeys[ticket.status],
		owner: ticket.assignee,
		category:
			ticket.area === "Checkout"
				? "payments"
				: ticket.area === "Workspace"
					? "workspace"
					: "portal",
	}));
	const escapeHtml = (value: string) =>
		value
			.replaceAll("&", "&amp;")
			.replaceAll("<", "&lt;")
			.replaceAll(">", "&gt;")
			.replaceAll('"', "&quot;");
	const scriptData = (value: unknown) =>
		JSON.stringify(value).replaceAll("<", "\\u003c");
	const home = template
		.replace('<html lang="th">', `<html lang="${locale}">`)
		.replace(
			'data-lang="en" aria-pressed="false"',
			`data-lang="en" aria-pressed="${locale === "en"}"`,
		)
		.replace(
			'data-lang="th" aria-pressed="true"',
			`data-lang="th" aria-pressed="${locale !== "en"}"`,
		)
		.replace(/\{\{copy:(\w+)\}\}/g, (_, key: keyof typeof homeCopy) =>
			escapeHtml(homeCopy[key][locale === "en" ? 1 : 0]),
		)
		.replace('"{{checkoutReport}}"', () => scriptData(checkoutReport))
		.replace('"{{homeCopy}}"', () => scriptData(homeCopy))
		.replace('"{{boardData}}"', () => scriptData(board));
	return new Response(home, {
		headers: {
			"Content-Type": "text/html; charset=utf-8",
			"Cache-Control": "private, no-store",
		},
	});
}

export async function POST(request: Request) {
	if (request.headers.get("content-type") !== "application/json") {
		return new Response(null, { status: 415 });
	}
	const input = await request.json().catch(() => null);
	if (input?.language !== "en" && input?.language !== "th") {
		return new Response(null, { status: 400 });
	}
	await changeLanguage(input.language);
	return new Response(null, { status: 204 });
}
