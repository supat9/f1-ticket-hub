import { useLocale } from "next-intl";

import { useText } from "../i18n/use-text";
import {
	priorities,
	statuses,
	type Ticket,
	type TicketStatus,
} from "./tickets";

export function Priority({ priority }: { priority: Ticket["priority"] }) {
	const t = useText();
	return (
		<span className={`priority priority-${priority}`}>
			<span className="priority-bars" aria-hidden="true">
				<i />
				<i />
				<i />
				<i />
			</span>
			{t(priorities[priority])}
		</span>
	);
}

export function StatusBadge({ status }: { status: TicketStatus }) {
	const t = useText();
	return (
		<span className={`status status-${status}`}>
			<span className="status-dot" aria-hidden="true" />
			{t(statuses[status])}
		</span>
	);
}

export function TicketTime({ date }: { date: Date }) {
	const locale = useLocale();
	return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "th-TH", {
		dateStyle: "medium",
		timeStyle: "short",
		timeZone: "Asia/Bangkok",
	}).format(date);
}

export function Deadline({
	ticket,
	detailed = false,
}: {
	ticket: Pick<Ticket, "dueAt" | "completedAt" | "status">;
	detailed?: boolean;
}) {
	const t = useText();
	const due = new Date(ticket.dueAt);
	if (Number.isNaN(due.getTime())) return null;
	const completed = ticket.status === "resolved" || ticket.status === "closed";
	const hoursLeft = (due.getTime() - Date.now()) / 3_600_000;
	if (completed && !detailed) return null;
	const severity = completed
		? "done"
		: hoursLeft <= 0
			? "late"
			: hoursLeft <= 24
				? "soon"
				: "normal";
	const label =
		severity === "late"
			? t("เกินกำหนด")
			: severity === "soon"
				? t("ใกล้ครบกำหนด")
				: t("กำหนดแก้ไข");
	return (
		<span className="ticket-deadline" data-severity={severity}>
			{label}{" "}
			<time dateTime={ticket.dueAt}>
				<TicketTime date={due} />
			</time>
		</span>
	);
}

export function StaffIdentity({
	email,
	compact = false,
	showEmail = !compact,
}: {
	email: string;
	compact?: boolean;
	showEmail?: boolean;
}) {
	const label = email.split("@")[0] || email;
	return (
		<span className={`staff-identity${compact ? " compact" : ""}`}>
			<span className="avatar" aria-hidden="true">
				{label.slice(0, 1).toUpperCase()}
			</span>
			<span className="staff-identity-text" title={showEmail ? email : label}>
				<span>{label}</span>
				{showEmail && <small>{email}</small>}
			</span>
		</span>
	);
}
