import { useText } from "../i18n/use-text";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import type { Account } from "./session";
import { TicketTime } from "./ticket-badges";
import {
	statuses,
	type StaffMember,
	type Ticket,
	type TicketActivity,
	type WorkflowView,
} from "./tickets";
import { WorkflowForm } from "./workflow-form";

const activityLabels: Record<TicketActivity["kind"], string> = {
	created: "เปิดเคส",
	status: "เปลี่ยนสถานะ",
	assigned: "เปลี่ยนการมอบหมาย",
	details: "แก้ไขรายละเอียด",
	note: "เพิ่มบันทึกภายใน",
	handoff: "ส่งงานให้ Dev",
	submit: "ส่งผลการแก้ไขให้ตรวจรับ",
	close: "ตรวจรับและปิดเคส",
	return: "ส่งกลับให้แก้ไข",
	automation: "อัปเดตผ่าน Automation API",
};

export function TicketWorkflow({
	ticket,
	workflow,
	staff,
	account,
	canManage,
	olderHref,
	latestHref,
}: {
	ticket: Ticket;
	workflow: WorkflowView | null;
	staff: StaffMember[];
	account: Account | null;
	canManage: boolean;
	olderHref?: string;
	latestHref?: string;
}) {
	const t = useText();
	const assignedDeveloper =
		account?.role === "dev" && account.id === ticket.assigneeId;
	const handedOff = Boolean(workflow?.steps);
	return (
		<>
			<section className="ticket-fact-panel" aria-labelledby="workflow-heading">
				<h3 id="workflow-heading">{t("ส่งงานและตรวจรับ")}</h3>
				{workflow ? (
					<>
						{handedOff ? (
							<dl className="workflow-facts">
								<div>
									<dt>{t("วิธีทำซ้ำ")}</dt>
									<dd>{workflow.steps}</dd>
								</div>
								<div>
									<dt>{t("ผลกระทบ")}</dt>
									<dd>{workflow.impact}</dd>
								</div>
								{workflow.resolution && (
									<div>
										<dt>{t("ผลการแก้ไข")}</dt>
										<dd>{workflow.resolution}</dd>
									</div>
								)}
								{workflow.pullRequestUrl && (
									<div>
										<dt>{t("Pull request")}</dt>
										<dd>
											<a
												href={workflow.pullRequestUrl}
												target="_blank"
												rel="noreferrer"
											>
												{" "}
												{t("เปิด Pull request ↗")}{" "}
											</a>
										</dd>
									</div>
								)}
								{workflow.reviewNote && (
									<div>
										<dt>{t("ผลการตรวจรับล่าสุด")}</dt>
										<dd>{workflow.reviewNote}</dd>
									</div>
								)}
							</dl>
						) : (
							<p className="muted">{t("ยังไม่ได้ส่งเข้าขั้นตอนตรวจรับ")}</p>
						)}
						{assignedDeveloper && handedOff && ticket.status === "open" && (
							<WorkflowForm
								kind="start"
								ticketId={ticket.id}
								version={workflow.version}
							/>
						)}
						{assignedDeveloper &&
							handedOff &&
							ticket.status === "in_progress" && (
								<WorkflowForm
									kind="submit"
									ticketId={ticket.id}
									version={workflow.version}
									defaults={workflow}
								/>
							)}
						{canManage && handedOff && ticket.status === "resolved" && (
							<WorkflowForm
								kind="review"
								ticketId={ticket.id}
								version={workflow.version}
							/>
						)}
						{canManage &&
							(ticket.status === "open" || ticket.status === "in_progress") && (
								<details className="workflow-handoff">
									<summary>
										{handedOff
											? t("แก้ไขข้อมูลส่งงานหรือเปลี่ยน Dev")
											: t("คัดกรองและส่งงานให้ Dev")}
									</summary>
									<WorkflowForm
										kind="handoff"
										ticketId={ticket.id}
										version={workflow.version}
										defaults={workflow}
										staff={staff}
										assigneeId={ticket.assigneeId}
									/>
								</details>
							)}
					</>
				) : (
					<p className="muted">{t("โหลดขั้นตอนการทำงานไม่ได้ กรุณาลองเปิดเคสใหม่")}</p>
				)}
			</section>
			<section className="ticket-fact-panel" aria-labelledby="activity-heading">
				<h3 id="activity-heading">{t("Activity timeline")}</h3>
				{workflow && (
					<>
						{workflow.activity.length ? (
							<ol className="workflow-timeline">
								{workflow.activity.map((event) => (
									<li key={event.id}>
										<strong>{t(activityLabels[event.kind])}</strong>
										<span className="muted">
											{event.actor || t("ระบบ")} ·{" "}
											<time dateTime={event.createdAt}>
												<TicketTime date={new Date(event.createdAt)} />
											</time>
										</span>
										{event.previousStatus &&
											event.status &&
											event.previousStatus !== event.status && (
												<p>
													{t(statuses[event.previousStatus])} →{" "}
													{t(statuses[event.status])}
												</p>
											)}
										{event.detail && <p>{event.detail}</p>}
									</li>
								))}
							</ol>
						) : (
							<p className="muted">{t("ยังไม่มีรายการประวัติในหน้านี้")}</p>
						)}
						{(olderHref || latestHref) && (
							<div className="workflow-buttons">
								{latestHref && (
									<Link href={latestHref} scroll={false}>
										{" "}
										{t("กลับไปดูรายการล่าสุด")}{" "}
									</Link>
								)}
								{olderHref && (
									<Link href={olderHref} scroll={false}>
										{" "}
										{t("ดูรายการก่อนหน้า")}{" "}
									</Link>
								)}
							</div>
						)}
						{!latestHref && (
							<WorkflowForm
								kind="note"
								ticketId={ticket.id}
								noteRequestId={randomUUID()}
							/>
						)}
					</>
				)}
			</section>
		</>
	);
}
