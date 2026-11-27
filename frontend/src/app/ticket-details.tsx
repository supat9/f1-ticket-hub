import { LanguageSwitch } from "./language-switch";
import { useText } from "../i18n/use-text";
import Image from "next/image";
import Link from "next/link";
import { AssignmentEditor } from "./assignment-editor";
import type { Account } from "./session";
import {
	Deadline,
	Priority,
	StaffIdentity,
	StatusBadge,
	TicketTime,
} from "./ticket-badges";
import { TicketDialog } from "./ticket-dialog";
import { TicketImageUpload, TicketMetadataEditor } from "./ticket-extra-editor";
import { TicketStatusForm } from "./ticket-status-form";
import { TicketWorkflow } from "./ticket-workflow";
import { TriagePanel } from "./triage-panel";
import {
	categories,
	products,
	sources,
	type StaffMember,
	type Ticket,
	type WorkflowView,
} from "./tickets";

export function TicketDetails({
	ticket,
	imageIds,
	workflow,
	account,
	olderActivityHref,
	latestActivityHref,
	focusImages,
	staff,
	closeHref,
	canManage,
}: {
	ticket: Ticket | null;
	imageIds: string[] | null;
	workflow: WorkflowView | null;
	account: Account | null;
	olderActivityHref?: string;
	latestActivityHref?: string;
	focusImages: boolean;
	staff: StaffMember[];
	closeHref: string;
	canManage: boolean;
}) {
	const t = useText();
	const owner = staff.find((member) => member.id === ticket?.ownerId);
	const assignee = staff.find((member) => member.id === ticket?.assigneeId);
	const canUpload = canManage && imageIds !== null && imageIds.length < 5;
	return (
		<TicketDialog
			closeHref={closeHref}
			labelId="ticket-detail-heading"
			initialFocusId={focusImages ? "ticket-image-heading" : undefined}
			drawer
		>
			<div className="dialog-header">
				<LanguageSwitch />
				{ticket && (
					<>
						<span className="ticket-code">{ticket.code}</span>
						<StatusBadge status={ticket.status} />
					</>
				)}
				<Link
					href={closeHref}
					scroll={false}
					className="dialog-close"
					aria-label={t("ปิดรายละเอียดเคส")}
				>
					×
				</Link>
			</div>
			{ticket ? (
				<div className="drawer-body">
					<div className="ticket-detail-title">
						<h2 id="ticket-detail-heading">{ticket.title}</h2>
						<div className="ticket-detail-meta">
							<Priority priority={ticket.priority} />
							<Deadline ticket={ticket} detailed />
							<span className="muted">
								{" "}
								{t("วันที่รับแจ้ง")}{" "}
								<time dateTime={ticket.createdAt}>
									<TicketTime date={new Date(ticket.createdAt)} />
								</time>
							</span>
						</div>
					</div>
					<section className="description-block">
						<h3>{t("รายละเอียด")}</h3>
						<p>{ticket.description}</p>
					</section>
					<section
						className="ticket-fact-panel"
						aria-label={t("AI ช่วยคัดกรองเคส")}
					>
						<TriagePanel
							key={JSON.stringify([
								ticket.id,
								ticket.title,
								ticket.description,
							])}
							source="ticket"
							id={ticket.id}
						/>
					</section>
					<TicketWorkflow
						ticket={ticket}
						workflow={workflow}
						staff={staff}
						account={account}
						canManage={canManage}
						olderHref={olderActivityHref}
						latestHref={latestActivityHref}
					/>
					<section
						className="ticket-fact-panel"
						aria-labelledby="ticket-info-heading"
					>
						<h3 id="ticket-info-heading">{t("ข้อมูลเคส")}</h3>
						<dl className="ticket-facts">
							<div>
								<dt>{t("สินค้า / ประเภท")}</dt>
								<dd>
									{[
										ticket.product && t(products[ticket.product]),
										ticket.category && t(categories[ticket.category]),
									]
										.filter(Boolean)
										.join(" · ") || (
										<span className="muted">{t("ยังไม่ระบุ")}</span>
									)}
								</dd>
							</div>
							<div>
								<dt>{t("ชื่อลูกค้า")}</dt>
								<dd>
									{ticket.customerName || (
										<span className="muted">{t("ยังไม่ระบุ")}</span>
									)}
								</dd>
							</div>
							<div>
								<dt>{t("แหล่งที่มา")}</dt>
								<dd>{t(sources[ticket.source])}</dd>
							</div>
							<div>
								<dt>{t("ผู้แจ้ง / ผู้รับผิดชอบ")}</dt>
								<dd>
									{owner ? (
										<StaffIdentity email={owner.email} compact />
									) : (
										<span className="muted">{t("ยังไม่ระบุ")}</span>
									)}
								</dd>
							</div>
							<div>
								<dt>{t("ผู้ได้รับมอบหมาย")}</dt>
								<dd>
									{ticket.assigneeName ? (
										<span>{ticket.assigneeName}</span>
									) : assignee ? (
										<StaffIdentity email={assignee.email} compact />
									) : (
										<span className="muted">{t("ยังไม่มอบหมาย")}</span>
									)}
								</dd>
							</div>
						</dl>
					</section>
					<section className="description-block">
						<h3>{t("หมายเหตุ")}</h3>
						<p>{ticket.notes || "—"}</p>
					</section>
					<section
						className="ticket-attachment-section"
						aria-labelledby="ticket-image-heading"
					>
						<div className="ticket-attachment-heading">
							<h3 id="ticket-image-heading" tabIndex={-1}>
								{" "}
								{t("รูปแนบ")}{" "}
							</h3>
							{imageIds && (
								<span className="ticket-attachment-count">
									{imageIds.length} {t("/ 5 รูป")}{" "}
								</span>
							)}
						</div>
						{imageIds === null ? (
							<p className="muted">{t("โหลดรายการรูปแนบไม่สำเร็จ")}</p>
						) : imageIds.length === 0 ? (
							!canUpload && <p className="muted">{t("ยังไม่มีรูปแนบ")}</p>
						) : (
							<ul className="ticket-image-list">
								{imageIds.map((id, index) => {
									const href = `/api/ticket-images/${ticket.id}/${id}`;
									return (
										<li key={id}>
											<a href={href} target="_blank" rel="noreferrer">
												<Image
													unoptimized
													src={href}
													width={240}
													height={160}
													alt={t(
														"รูปแนบ {0} ของเคส {1}",
														index + 1,
														ticket.code,
													)}
												/>
											</a>
										</li>
									);
								})}
							</ul>
						)}
						{canUpload && <TicketImageUpload ticketId={ticket.id} />}
					</section>
					{canManage && <TicketMetadataEditor ticket={ticket} />}
					{!ticket.guidedWorkflow &&
						(canManage ? (
							<AssignmentEditor
								ticket={{
									id: ticket.id,
									ownerId: ticket.ownerId,
									assigneeId: ticket.assigneeId,
									assigneeName: ticket.assigneeName,
									status: ticket.status,
									assignmentVersion: ticket.assignmentVersion,
								}}
								staff={staff}
							/>
						) : (
							<TicketStatusForm
								key={ticket.status}
								id={ticket.id}
								status={ticket.status}
							/>
						))}
				</div>
			) : (
				<div className="drawer-body">
					<h2 id="ticket-detail-heading">{t("เปิดรายละเอียดเคสไม่ได้")}</h2>
					<p className="muted">{t("กรุณากลับไปที่คิวแล้วลองเปิดเคสอีกครั้ง")}</p>
				</div>
			)}
		</TicketDialog>
	);
}
