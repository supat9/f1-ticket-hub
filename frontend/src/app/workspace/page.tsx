import { getText } from "../../i18n/server";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { fetchApi } from "../api-client";
import { signOut } from "../auth-actions";
import { Brand } from "../brand";
import { NotificationBell } from "../notification-bell";
import { QueueToolbar } from "../queue-toolbar";
import { queueHref } from "../queue-url";
import { type Account, requireSessionToken } from "../session";
import { StaffIdentity } from "../ticket-badges";
import { TicketDetails } from "../ticket-details";
import { TicketDialog } from "../ticket-dialog";
import { TicketForm } from "../ticket-form";
import { TicketQueue } from "../ticket-views";
import {
	isTicketCode,
	priorities,
	queueFilters,
	statusOrder,
	type QueueFilter,
	type QueueSummary,
	type QueueView,
	type StaffMember,
	type Ticket,
	type TicketBoardPage,
	type TicketPage,
	type WorkflowView,
} from "../tickets";

const maxTicketId = BigInt("9223372036854775807");

function ticketId(value: string | string[] | undefined) {
	return typeof value === "string" &&
		/^[1-9]\d{0,18}$/.test(value) &&
		BigInt(value) <= maxTicketId
		? value
		: undefined;
}

function isQueueDate(value: string) {
	if (value === "") return true;
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000"))
		return false;
	const date = new Date(`${value}T00:00:00Z`);
	return (
		!Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
	);
}

export default async function Home({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const t = await getText();
	const params = await searchParams;
	const view: QueueView = params.view === "kanban" ? "kanban" : "table";
	const filter =
		typeof params.filter === "string" &&
		Object.hasOwn(queueFilters, params.filter)
			? (params.filter as QueueFilter)
			: "all";
	const requestedStage = statusOrder.find((value) => value === params.stage);
	const status = statusOrder.find((value) => value === params.status);
	const priority = Object.keys(priorities).find(
		(value) => value === params.priority,
	);
	const keyword = typeof params.q === "string" ? params.q.trim() : "";
	const from = typeof params.from === "string" ? params.from : "";
	const to = typeof params.to === "string" ? params.to : "";
	let dateError = "";
	if (!isQueueDate(from) || !isQueueDate(to)) {
		dateError = t("กรุณาเลือกวันที่สร้างเคสให้ถูกต้อง");
	} else if (from && to && from > to) {
		dateError = t("วันเริ่มต้นต้องไม่อยู่หลังวันสิ้นสุด");
	}
	const loginHref = isTicketCode(keyword) ? `/login?q=${keyword}` : "/login";
	const token = await requireSessionToken(loginHref);
	const selectedId = ticketId(params.ticket);
	const activityBefore = ticketId(params.activityBefore);
	const showCreate = params.new === "1" && !selectedId;
	const criteria: Record<string, string> = {
		...(keyword ? { q: keyword } : {}),
		...(priority ? { priority } : {}),
		...(status ? { status } : {}),
		...(from ? { from } : {}),
		...(to ? { to } : {}),
	};
	const filters: Record<string, string> = { ...criteria };
	if (filter !== "all") filters.filter = filter;
	if (view === "kanban") {
		for (const key of statusOrder) {
			const value = ticketId(params[key]);
			if (value) filters[key] = value;
		}
	}

	const requestedPage = ticketId(params.page) ?? "1";
	const queuePath = view === "kanban" ? "/api/tickets/board" : "/api/tickets";
	const search = new URLSearchParams(
		view === "table" ? { ...filters, page: requestedPage } : filters,
	).toString();
	const summarySearch = new URLSearchParams(criteria).toString();
	const read = (path: string) =>
		fetchApi(path, undefined, token).catch(() => null);
	const responses = await Promise.all([
		dateError ? null : read(search ? `${queuePath}?${search}` : queuePath),
		read("/api/auth/session"),
		read("/api/staff"),
		dateError
			? null
			: read(
					summarySearch
						? `/api/tickets/summary?${summarySearch}`
						: "/api/tickets/summary",
				),
		selectedId ? read(`/api/tickets/${selectedId}`) : null,
		selectedId ? read(`/api/tickets/${selectedId}/images`) : null,
		selectedId
			? read(
					`/api/tickets/${selectedId}/workflow${activityBefore ? `?before=${activityBefore}` : ""}`,
				)
			: null,
	]);
	if (responses.some((response) => response?.status === 401))
		redirect(loginHref);
	const [page, account, directory, summary, selected, images, workflow] =
		(await Promise.all(
			responses.map((response) =>
				response?.ok ? response.json().catch(() => null) : null,
			),
		)) as [
			TicketPage | TicketBoardPage | null,
			Account | null,
			{ staff: StaffMember[] } | null,
			QueueSummary | null,
			Ticket | null,
			{ imageIds: string[] } | null,
			WorkflowView | null,
		];
	const tablePage =
		page && !("columns" in page) ? String(page.page) : requestedPage;
	const queueQuery = {
		view,
		...filters,
		...(view === "table" && tablePage !== "1" ? { page: tablePage } : {}),
		...(view === "kanban" && requestedStage ? { stage: requestedStage } : {}),
	};
	const closeHref = queueHref(queueQuery);
	const canManage = account?.role === "admin" || account?.role === "cs";
	const createHref = canManage
		? queueHref({ ...queueQuery, new: "1" })
		: undefined;
	const data =
		page &&
		("columns" in page
			? { view: "kanban" as const, page }
			: { view: "table" as const, page });
	const matchingStage =
		keyword && data?.view === "kanban"
			? data.page.columns.find((column) => column.total > 0)?.status
			: undefined;
	const stage = requestedStage ?? status ?? matchingStage ?? "open";
	const staff = directory?.staff ?? [];
	const createdCode = isTicketCode(params.created) ? params.created : undefined;
	const createdId = ticketId(params.createdId);

	return (
		<>
			<a href="#ticket-list" className="button button-primary queue-skip-link">
				{" "}
				{t("ข้ามไปยังรายการเคส")}{" "}
			</a>
			<header className="topbar">
				<div className="topbar-inner">
					<Brand />
					<div className="account">
						{account && (
							<span className="account-identity">
								<StaffIdentity email={account.email} />
							</span>
						)}
						{account && (
							<NotificationBell key={account.id} queueHref={closeHref} />
						)}
						{account?.role === "admin" && (
							<Link
								className="button button-secondary logout admin-nav"
								href="/admin"
							>
								{" "}
								{t("Admin")}{" "}
							</Link>
						)}
						<form action={signOut}>
							<button className="button button-secondary logout" type="submit">
								{" "}
								{t("ออกจากระบบ")}{" "}
							</button>
						</form>
					</div>
				</div>
			</header>
			<main className="workspace">
				<QueueToolbar
					view={view}
					filter={filter}
					criteria={criteria}
					summary={summary}
					createHref={createHref}
					canExport={canManage && !dateError}
					dialogActive={showCreate || Boolean(selectedId)}
				/>
				{params.logout === "unavailable" && (
					<p className="notice error" role="alert">
						{" "}
						{t("ออกจากระบบไม่สำเร็จ กรุณาลองอีกครั้ง")}{" "}
					</p>
				)}
				<section
					id="ticket-list"
					className="queue-results"
					tabIndex={-1}
					aria-label={t("รายการเคส")}
				>
					{dateError ? (
						<p className="notice error" role="alert">
							{dateError}
						</p>
					) : (
						<TicketQueue
							data={data}
							staff={staff}
							query={queueQuery}
							stage={stage}
							filter={filter}
							createHref={createHref}
						/>
					)}
				</section>
			</main>
			{showCreate && canManage && (
				<TicketDialog
					closeHref={closeHref}
					labelId="create-heading"
					returnFocusId="queue-create"
				>
					<header className="dialog-header">
						<div>
							<h2 id="create-heading">{t("แจ้งเคสใหม่")}</h2>
							<p className="muted">
								{" "}
								{t("เคสใหม่เริ่มที่สถานะ “เปิดใหม่” ระบบออกรหัสเคสให้หลังบันทึก")}{" "}
							</p>
						</div>
						<Link
							className="dialog-close"
							href={closeHref}
							scroll={false}
							aria-label={t("ปิดฟอร์มแจ้งเคส")}
						>
							×
						</Link>
					</header>
					<TicketForm
						requestId={randomUUID()}
						staff={staff}
						currentUserId={account?.id ?? ""}
						view={view}
						closeHref={closeHref}
						imageLimitMB={process.env.VERCEL === "1" ? 3 : 5}
					/>
				</TicketDialog>
			)}
			{selectedId && (
				<TicketDetails
					key={selectedId}
					ticket={selected}
					imageIds={images?.imageIds ?? null}
					workflow={workflow}
					account={account}
					olderActivityHref={
						workflow?.nextBefore
							? queueHref({
									...queueQuery,
									ticket: selectedId,
									activityBefore: workflow.nextBefore,
								})
							: undefined
					}
					latestActivityHref={
						activityBefore
							? queueHref({ ...queueQuery, ticket: selectedId })
							: undefined
					}
					focusImages={params.section === "images"}
					staff={staff}
					closeHref={closeHref}
					canManage={canManage}
				/>
			)}
			{canManage && createdCode && !showCreate && !selectedId && (
				<div className="queue-toast" role="status">
					<span className="toast-check" aria-hidden="true">
						✓
					</span>
					<div>
						<strong>{t("แจ้งเคสสำเร็จ")}</strong>
						<p>
							{t("รหัสเคส")} {createdCode} {t("· อยู่บนสุดของคิว")}
						</p>
					</div>
					{createdId && (
						<Link
							href={queueHref({ ...queueQuery, ticket: createdId })}
							scroll={false}
						>
							{" "}
							{t("เปิดดูเคส")}{" "}
						</Link>
					)}
					<Link href={closeHref} scroll={false} aria-label={t("ปิดข้อความ")}>
						×
					</Link>
				</div>
			)}
		</>
	);
}
