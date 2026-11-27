import { useText } from "../i18n/use-text";
import Link from "next/link";
import { BoardDrag } from "./board-drag";
import {
	Deadline,
	Priority,
	StaffIdentity,
	StatusBadge,
	TicketTime,
} from "./ticket-badges";
import { TicketRow } from "./ticket-row";
import { TicketStatusForm } from "./ticket-status-form";
import {
	categories,
	products,
	queueFilters,
	statuses,
	type QueueFilter,
	type StaffMember,
	type Ticket,
	type TicketBoardPage,
	type TicketPage,
	type TicketStatus,
} from "./tickets";
import { queueHref } from "./queue-url";

type Query = Record<string, string>;
type ViewData =
	| { view: "table"; page: TicketPage }
	| { view: "kanban"; page: TicketBoardPage };
type StaffDirectory = Map<string, string>;

export function TicketQueue({
	data,
	staff,
	query,
	stage,
	filter,
	createHref,
}: {
	data: ViewData | null;
	staff: StaffMember[];
	query: Query;
	stage: TicketStatus;
	filter: QueueFilter;
	createHref?: string;
}) {
	const t = useText();
	if (!data) {
		return (
			<section className="queue-state error-state" role="alert">
				<span className="alert-mark" aria-hidden="true">
					!
				</span>
				<h2>{t("โหลดคิวไม่สำเร็จ")}</h2>
				<p className="muted">
					{t("ระบบเชื่อมต่อเซิร์ฟเวอร์ไม่ได้ชั่วคราว ลองโหลดคิวใหม่อีกครั้ง")}
				</p>
				<Link className="button button-secondary" href={queueHref(query)}>
					{" "}
					{t("ลองอีกครั้ง")}{" "}
				</Link>
			</section>
		);
	}
	const hasMatches =
		data.view === "table"
			? data.page.tickets.length > 0
			: data.page.columns.some((column) => column.total > 0);
	const activeCriteria = Boolean(
		query.priority || query.status || query.from || query.to,
	);
	if ((query.q || activeCriteria) && !hasMatches) {
		return (
			<section className="queue-state empty-state">
				<h2>{activeCriteria ? t("ไม่พบเคสตามตัวกรอง") : t("ไม่พบเคสที่ค้นหา")}</h2>
				<p className="muted">
					{activeCriteria
						? t("ลองปรับตัวกรอง แล้วค้นหาอีกครั้ง")
						: t("ลองใช้คำสั้น ๆ จากชื่อเคส หรือกรอกรหัสเต็ม เช่น F1-000123")}
				</p>
				{!activeCriteria && filter !== "all" && (
					<Link
						href={queueHref({ view: data.view, q: query.q })}
						className="button button-secondary"
					>
						{" "}
						{t("ค้นหาจากเคสทั้งหมด")}{" "}
					</Link>
				)}
			</section>
		);
	}
	const directory = new Map(staff.map((member) => [member.id, member.email]));
	if (data.view === "kanban")
		return (
			<TicketBoard
				board={data.page}
				query={query}
				stage={stage}
				directory={directory}
				createHref={createHref}
			/>
		);
	if (!data.page.tickets.length) {
		const clearFilter = queueHref({ view: "table" });
		return (
			<section className="queue-state empty-state">
				<h2>
					{filter === "all"
						? t("ยังไม่มีเคสในคิว")
						: t("ไม่มีเคสในตัวกรอง “{0}”", t(queueFilters[filter]))}
				</h2>
				<p className="muted">
					{filter === "all"
						? t("เมื่อมีการแจ้งเคส เคสจะแสดงที่นี่ เรียงจากล่าสุดก่อน")
						: t("ลองดูเคสทั้งหมด หรือเลือกตัวกรองอื่นด้านบน")}
				</p>
				{filter === "all" ? (
					createHref && (
						<Link
							href={createHref}
							scroll={false}
							className="button button-primary"
						>
							{" "}
							{t("แจ้งเคสแรก")}{" "}
						</Link>
					)
				) : (
					<Link href={clearFilter} className="button button-secondary">
						{" "}
						{t("ดูเคสทั้งหมด")}{" "}
					</Link>
				)}
			</section>
		);
	}
	return (
		<TicketTable
			page={data.page}
			query={query}
			directory={directory}
			canManage={Boolean(createHref)}
		/>
	);
}

function TicketTable({
	page,
	query,
	directory,
	canManage,
}: {
	page: TicketPage;
	query: Query;
	directory: StaffDirectory;
	canManage: boolean;
}) {
	const t = useText();
	const today = bangkokDay(new Date());
	return (
		<section className="table-panel" aria-label={t("ตาราง Ticket")}>
			<TablePagination page={page} query={query} />
			<div className="table-scroll">
				<table className="ticket-table" aria-label={t("รายการ Ticket")}>
					<thead>
						<tr>
							<th scope="col" className="ticket-id-column">
								{" "}
								{t("Job ID")}{" "}
							</th>
							<th scope="col">{t("รายละเอียด")}</th>
							<th scope="col">{t("สถานะ")}</th>
							<th scope="col">{t("ความเร่งด่วน")}</th>
							<th scope="col">{t("ผู้ได้รับมอบหมาย")}</th>
							<th scope="col">{t("วันที่รับแจ้ง")}</th>
							<th scope="col">{t("ชื่อลูกค้า")}</th>
							<th scope="col">{t("ผู้แจ้ง")}</th>
							<th scope="col">{t("ผู้รับผิดชอบ")}</th>
							<th scope="col">{t("ประเภท")}</th>
							<th scope="col">{t("สินค้า")}</th>
							<th scope="col">{t("วันที่เสร็จ")}</th>
							<th scope="col">{t("อายุงาน (วัน)")}</th>
							<th scope="col">{t("หมายเหตุ")}</th>
							<th scope="col">{t("เพิ่มรูปภาพ")}</th>
						</tr>
					</thead>
					<tbody>
						{page.tickets.map((ticket) => {
							const href = queueHref({ ...query, ticket: ticket.id });
							const created = new Date(ticket.createdAt);
							const completed =
								ticket.status === "resolved" || ticket.status === "closed";
							const age = Math.max(0, today - bangkokDay(created));
							return (
								<TicketRow key={ticket.id} href={href}>
									<th scope="row" className="ticket-id-column">
										<Link href={href} scroll={false} className="ticket-code">
											{ticket.code}
										</Link>
									</th>
									<td>
										<Link href={href} scroll={false} className="ticket-title">
											{ticket.title}
										</Link>
										<p className="ticket-cell-preview">{ticket.description}</p>
									</td>
									<td>
										<StatusBadge status={ticket.status} />
										<Deadline ticket={ticket} />
									</td>
									<td>
										<Priority priority={ticket.priority} />
									</td>
									<td>
										<StaffCell
											id={ticket.assigneeId}
											name={ticket.assigneeName}
											directory={directory}
											assignHref={canManage ? href : undefined}
											code={ticket.code}
											assignee
										/>
									</td>
									<td>
										<time dateTime={ticket.createdAt}>
											<TicketTime date={created} />
										</time>
									</td>
									<td>{ticket.customerName || "—"}</td>
									<td>
										<StaffCell id={ticket.ownerId} directory={directory} />
									</td>
									<td>
										<StaffCell id={ticket.ownerId} directory={directory} />
									</td>
									<td>
										{ticket.category ? t(categories[ticket.category]) : "—"}
									</td>
									<td>{ticket.product ? t(products[ticket.product]) : "—"}</td>
									<td>
										{ticket.completedAt ? (
											<time dateTime={ticket.completedAt}>
												<TicketTime date={new Date(ticket.completedAt)} />
											</time>
										) : (
											"—"
										)}
									</td>
									<td>{completed ? "—" : age}</td>
									<td>
										<p className="ticket-cell-preview">{ticket.notes || "—"}</p>
									</td>
									<td>
										<Link
											href={queueHref({
												...query,
												ticket: ticket.id,
												section: "images",
											})}
											scroll={false}
											className="button button-secondary ticket-image-link"
											aria-label={`${canManage ? t("เพิ่มรูป") : t("ดูรูป")} ${ticket.code}`}
										>
											{canManage ? t("เพิ่มรูป") : t("ดูรูป")}
										</Link>
									</td>
								</TicketRow>
							);
						})}
					</tbody>
				</table>
			</div>
			<ul className="mobile-table" aria-label={t("รายการ Ticket")}>
				{page.tickets.map((ticket) => (
					<li className="ticket-card" key={ticket.id}>
						<div className="ticket-top">
							<span className="ticket-code">{ticket.code}</span>
							<StatusBadge status={ticket.status} />
						</div>
						<Deadline ticket={ticket} />
						<Link
							className="ticket-title"
							href={queueHref({ ...query, ticket: ticket.id })}
							scroll={false}
						>
							{ticket.title}
						</Link>
						<div className="card-meta">
							<Priority priority={ticket.priority} />
							<TicketMeta ticket={ticket} />
						</div>
						<TicketPeople ticket={ticket} directory={directory} />
					</li>
				))}
			</ul>
		</section>
	);
}

function TablePagination({ page, query }: { page: TicketPage; query: Query }) {
	const t = useText();
	const { page: current, pageSize, tickets, total } = page;
	const last = Math.ceil(total / pageSize);
	const firstItem = (current - 1) * pageSize + 1;
	const lastItem = firstItem + tickets.length - 1;
	const range = firstItem === lastItem ? firstItem : `${firstItem}–${lastItem}`;
	const pages = [
		...new Set([
			1,
			Math.max(1, current - 1),
			current,
			Math.min(last, current + 1),
			last,
		]),
	];
	const { page: _currentPage, ...filters } = query;
	const href = (target: number) =>
		queueHref(target === 1 ? filters : { ...filters, page: String(target) });

	return (
		<header className="table-pagebar">
			<span>
				{" "}
				{t("แสดง")} {range} {t("จาก")} {total} {t("เคส")}{" "}
			</span>
			{last > 1 && (
				<nav
					className="queue-nav table-pagination"
					aria-label={t("หน้าคิวตาราง")}
				>
					{current > 1 ? (
						<Link
							className="button button-secondary"
							href={href(current - 1)}
							rel="prev"
							aria-label={t("หน้าก่อนหน้า")}
						>
							<span aria-hidden="true">‹</span>
							<span className="pagination-direction-label">{t("ก่อนหน้า")}</span>
						</Link>
					) : (
						<span className="button button-secondary" aria-disabled="true">
							<span aria-hidden="true">‹</span>
							<span className="pagination-direction-label">{t("ก่อนหน้า")}</span>
						</span>
					)}
					{pages.map((number, index) => (
						<span className="pagination-entry" key={number}>
							{index > 0 && number - pages[index - 1] > 1 && (
								<span aria-hidden="true">…</span>
							)}
							{number === current ? (
								<span className="button button-primary" aria-current="page">
									{number}
								</span>
							) : (
								<Link
									className="button button-secondary"
									href={href(number)}
									aria-label={t("หน้า {0}", number)}
								>
									{number}
								</Link>
							)}
						</span>
					))}
					<span className="pagination-position" aria-current="page">
						{" "}
						{t("หน้า")} {current}/{last}
					</span>
					{current < last ? (
						<Link
							className="button button-secondary"
							href={href(current + 1)}
							rel="next"
							aria-label={t("หน้าถัดไป")}
						>
							<span className="pagination-direction-label">{t("ถัดไป")}</span>
							<span aria-hidden="true">›</span>
						</Link>
					) : (
						<span className="button button-secondary" aria-disabled="true">
							<span className="pagination-direction-label">{t("ถัดไป")}</span>
							<span aria-hidden="true">›</span>
						</span>
					)}
				</nav>
			)}
		</header>
	);
}

const bangkokDate = new Intl.DateTimeFormat("sv-SE", {
	timeZone: "Asia/Bangkok",
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
});

function bangkokDay(date: Date) {
	return Date.parse(`${bangkokDate.format(date)}T00:00:00Z`) / 86_400_000;
}

function TicketBoard({
	board,
	query,
	stage,
	directory,
	createHref,
}: {
	board: TicketBoardPage;
	query: Query;
	stage: TicketStatus;
	directory: StaffDirectory;
	createHref?: string;
}) {
	const t = useText();
	return (
		<>
			<nav className="board-tabs" aria-label={t("คอลัมน์สถานะ")}>
				{board.columns.map((column) => (
					<Link
						className={`status-${column.status}`}
						key={column.status}
						href={queueHref({ ...query, stage: column.status })}
						aria-current={column.status === stage ? "page" : undefined}
						data-tab-stage={column.status}
						scroll={false}
					>
						<span className="status-dot" aria-hidden="true" />
						{t(statuses[column.status])}
						<span className="board-count">{column.total}</span>
					</Link>
				))}
			</nav>
			<BoardDrag>
				{board.columns.map((column) => {
					const latest = { ...query };
					delete latest[column.status];
					return (
						<section
							className={`board-column status-${column.status}`}
							key={column.status}
							data-stage={column.status}
							data-active={column.status === stage}
							aria-labelledby={`stage-${column.status}`}
						>
							<header className="board-column-header">
								<span className="status-dot" aria-hidden="true" />
								<h2 id={`stage-${column.status}`}>
									{t(statuses[column.status])}
								</h2>
								<span className="board-count">{column.total}</span>
							</header>
							{column.tickets.length ? (
								<ul className="board-cards">
									{column.tickets.map((ticket) => {
										const href = queueHref({ ...query, ticket: ticket.id });
										return (
											<li
												className="ticket-card"
												key={ticket.id}
												draggable={!ticket.guidedWorkflow}
												data-drag-ticket={
													ticket.guidedWorkflow ? undefined : ticket.id
												}
											>
												<div className="ticket-top">
													<span className="card-code">
														{!ticket.guidedWorkflow && (
															<span
																className="drag-handle"
																title={t("ลากเพื่อย้ายสถานะ")}
																aria-hidden="true"
															>
																⠿
															</span>
														)}
														<span className="ticket-code">{ticket.code}</span>
													</span>
													<Priority priority={ticket.priority} />
												</div>
												<Link
													href={href}
													scroll={false}
													draggable={false}
													className="ticket-title"
												>
													{ticket.title}
												</Link>
												<TicketPeople
													ticket={ticket}
													directory={directory}
													assignHref={createHref ? href : undefined}
												/>
												<Deadline ticket={ticket} />
												{ticket.guidedWorkflow ? (
													<Link
														href={href}
														scroll={false}
														className="workflow-card-link"
													>
														{" "}
														{t("เปิดขั้นตอนส่งงานและตรวจรับ")}{" "}
													</Link>
												) : (
													<TicketStatusForm
														key={ticket.status}
														id={ticket.id}
														status={ticket.status}
													/>
												)}
											</li>
										);
									})}
								</ul>
							) : (
								<div className="board-empty">
									<strong>{t("ยังไม่มีเคสในคอลัมน์นี้")}</strong>
									<p className="muted">{t("เคสจะแสดงที่นี่เมื่ออยู่ในสถานะนี้")}</p>
									{createHref &&
										column.status === "open" &&
										!query.filter &&
										!query.q &&
										!query.priority &&
										!query.from &&
										!query.to &&
										!query.status && (
											<Link
												className="button button-secondary"
												href={createHref}
												scroll={false}
											>
												{" "}
												{t("+ แจ้งเคสใหม่")}{" "}
											</Link>
										)}
								</div>
							)}
							{(query[column.status] || column.nextCursor) && (
								<nav
									className="queue-nav"
									aria-label={t("หน้าเคสสถานะ {0}", t(statuses[column.status]))}
								>
									{query[column.status] && (
										<Link
											className="button button-secondary"
											href={queueHref({ ...latest, stage: column.status })}
										>
											{" "}
											{t("กลับไปล่าสุด")}{" "}
										</Link>
									)}
									{column.nextCursor && (
										<Link
											className="button button-secondary"
											href={queueHref({
												...query,
												[column.status]: column.nextCursor,
												stage: column.status,
											})}
										>
											{" "}
											{t("ดูเคสก่อนหน้า")}{" "}
										</Link>
									)}
								</nav>
							)}
						</section>
					);
				})}
			</BoardDrag>
		</>
	);
}

function TicketPeople({
	ticket,
	directory,
	assignHref,
}: {
	ticket: Ticket;
	directory: StaffDirectory;
	assignHref?: string;
}) {
	const t = useText();
	return (
		<dl className="ticket-people">
			<div>
				<dt>{t("ผู้แจ้ง / ผู้รับผิดชอบ")}</dt>
				<dd>
					<StaffCell id={ticket.ownerId} directory={directory} compact />
				</dd>
			</div>
			<div>
				<dt>{t("ผู้ได้รับมอบหมาย")}</dt>
				<dd>
					<StaffCell
						id={ticket.assigneeId}
						name={ticket.assigneeName}
						directory={directory}
						assignHref={assignHref}
						code={ticket.code}
						compact
						assignee
					/>
				</dd>
			</div>
		</dl>
	);
}

function StaffCell({
	id,
	name,
	directory,
	assignHref,
	code,
	compact,
	assignee,
}: {
	id: string | null;
	name?: string;
	directory: StaffDirectory;
	assignHref?: string;
	code?: string;
	compact?: boolean;
	assignee?: boolean;
}) {
	const t = useText();
	const email = id ? directory.get(id) : undefined;
	if (name || id) {
		const identity = name ? (
			<span className="assignee-name" title={name}>
				{name}
			</span>
		) : email ? (
			<StaffIdentity email={email} compact={compact} showEmail={false} />
		) : (
			<span className="muted">{t("ไม่พบรายชื่อ")}</span>
		);
		if (!assignee) return identity;
		return (
			<span className="assignee-cell">
				{identity}
				<small className="assignee-source">
					{name ? t("พิมพ์เอง") : t("บัญชี F1")}
				</small>
			</span>
		);
	}
	if (assignHref)
		return (
			<Link
				href={assignHref}
				scroll={false}
				draggable={false}
				className="unassigned-link"
				aria-label={t("มอบหมาย {0}", code ?? "")}
			>
				{" "}
				{t("+ ยังไม่มอบหมาย")}{" "}
			</Link>
		);
	return (
		<span className="muted">
			{assignee ? t("ยังไม่มอบหมาย") : t("ยังไม่ระบุเจ้าของ")}
		</span>
	);
}

function TicketMeta({ ticket }: { ticket: Ticket }) {
	const t = useText();
	return (
		<span className="ticket-meta">
			{ticket.source === "customer" ? t("เรื่องลูกค้า") : t("เรื่องภายใน")} ·{" "}
			{ticket.product && `${t(products[ticket.product])} · `}
			{ticket.category && `${t(categories[ticket.category])} · `}
			<time dateTime={ticket.createdAt}>
				<TicketTime date={new Date(ticket.createdAt)} />
			</time>
		</span>
	);
}
