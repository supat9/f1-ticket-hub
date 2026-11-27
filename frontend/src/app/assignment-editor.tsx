"use client";
import { useText } from "../i18n/use-text";

import { useActionState, useState } from "react";
import { StaffFields } from "./staff-fields";
import { saveAssignment } from "./ticket-actions";
import {
	statusOrder,
	statuses,
	type AssignmentState,
	type StaffMember,
	type Ticket,
} from "./tickets";

type Assignment = Pick<
	Ticket,
	| "id"
	| "ownerId"
	| "assigneeId"
	| "assigneeName"
	| "assignmentVersion"
	| "status"
>;
const initialState: AssignmentState = { attempt: 0 };

export function AssignmentEditor({
	ticket,
	staff,
}: {
	ticket: Assignment;
	staff: StaffMember[];
}) {
	const t = useText();
	const [state, action, pending] = useActionState(saveAssignment, initialState);
	const [discard, setDiscard] = useState({ attempt: -1, count: 0 });
	const current = state.attempt === discard.attempt ? null : state;
	const reset = () =>
		setDiscard({ attempt: state.attempt, count: discard.count + 1 });

	return (
		<form
			action={action}
			className="detail-edit"
			key={`${ticket.assignmentVersion}:${ticket.status}:${state.attempt}:${discard.count}`}
		>
			<fieldset className="detail-editor" disabled={pending}>
				<input type="hidden" name="ticketId" value={ticket.id} />
				<input
					type="hidden"
					name="assignmentVersion"
					value={ticket.assignmentVersion}
				/>
				<input type="hidden" name="expectedStatus" value={ticket.status} />
				<header>
					<h3>{t("การมอบหมายและสถานะ")}</h3>
					<p className="muted">{t("แก้คนหรือสถานะได้ที่นี่ แล้วกดบันทึกครั้งเดียว")}</p>
				</header>
				{current?.error && (
					<div
						className={`notice ${current.conflict ? "conflict" : "error"}`}
						role="alert"
					>
						<p>{current.error}</p>
						{current.conflict && (
							<button
								className="button button-secondary"
								type="button"
								onClick={reset}
							>
								{" "}
								{t("ใช้ข้อมูลล่าสุด")}{" "}
							</button>
						)}
					</div>
				)}
				<StaffFields
					prefix={`edit-${ticket.id}`}
					staff={staff}
					ownerId={current?.fields?.ownerId ?? ticket.ownerId ?? ""}
					assigneeId={current?.fields?.assigneeId ?? ticket.assigneeId ?? ""}
					assigneeName={
						current?.fields?.assigneeName ?? ticket.assigneeName ?? ""
					}
				/>
				<fieldset className="choice-field">
					<legend>{t("สถานะ")}</legend>
					<div className="choice-grid status-options">
						{statusOrder.map((status) => (
							<label className={`choice status-${status}`} key={status}>
								<input
									type="radio"
									name="status"
									value={status}
									defaultChecked={
										status === (current?.fields?.status ?? ticket.status)
									}
								/>
								<span className="status-dot" aria-hidden="true" />
								{t(statuses[status])}
							</label>
						))}
					</div>
				</fieldset>
			</fieldset>
			<footer className="dialog-footer">
				{current?.saved && (
					<p className="saved-feedback" role="status">
						{" "}
						{t("บันทึกการเปลี่ยนแปลงแล้ว")}{" "}
					</p>
				)}
				<button
					className="button button-secondary"
					type="button"
					disabled={pending}
					onClick={reset}
				>
					{" "}
					{t("ยกเลิกการแก้ไข")}{" "}
				</button>
				<button
					className="button button-primary"
					type="submit"
					disabled={pending}
				>
					{pending
						? t("กำลังบันทึก…")
						: current?.conflict
							? t("บันทึกค่าของฉันทับ")
							: t("บันทึกการเปลี่ยนแปลง")}
				</button>
			</footer>
		</form>
	);
}
