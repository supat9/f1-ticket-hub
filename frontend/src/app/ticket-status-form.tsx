"use client";
import { useText } from "../i18n/use-text";

import { useActionState, useId, useState } from "react";
import { saveTicketStatus } from "./ticket-actions";
import { statusOrder, statuses, type TicketStatus } from "./tickets";

export function TicketStatusForm({
	id,
	status,
}: {
	id: string;
	status: TicketStatus;
}) {
	const t = useText();
	const [state, action, pending] = useActionState(saveTicketStatus, null);
	const [draft, setDraft] = useState(status);
	const labelId = useId();

	return (
		<form
			className="ticket-status-form"
			action={action}
			key={status}
			data-status-draft={draft !== status || pending ? "" : undefined}
		>
			<input type="hidden" name="ticketId" value={id} />
			<input type="hidden" name="expectedStatus" value={status} />
			<fieldset disabled={pending}>
				<label htmlFor={labelId}>{t("ย้ายสถานะ")}</label>
				<div className="status-controls">
					<select
						id={labelId}
						name="status"
						value={draft}
						onChange={(event) => setDraft(event.target.value as TicketStatus)}
					>
						{statusOrder.map((value) => (
							<option key={value} value={value}>
								{t(statuses[value])}
							</option>
						))}
					</select>
					<button
						className="button button-primary"
						type="submit"
						disabled={draft === status || pending}
					>
						{pending ? t("กำลังย้าย…") : t("ย้าย")}
					</button>
				</div>
			</fieldset>
			{state && (
				<p
					className={`status-feedback ${state.error ? "status-error" : ""}`}
					role={state.error ? "alert" : "status"}
				>
					{state.message}
				</p>
			)}
		</form>
	);
}
