"use client";
import { useText } from "../i18n/use-text";

import { useActionState } from "react";
import { saveTicketMetadata, uploadTicketImage } from "./ticket-actions";
import { TicketImageField } from "./ticket-image-field";
import { TicketMetadataFields } from "./ticket-metadata-fields";
import type { Ticket } from "./tickets";

export function TicketMetadataEditor({ ticket }: { ticket: Ticket }) {
	const t = useText();
	const [state, action, pending] = useActionState(saveTicketMetadata, null);
	return (
		<details className="ticket-extra-editor">
			<summary>{t("แก้ไขข้อมูลเคส")}</summary>
			<form action={action} key={state?.attempt}>
				<input type="hidden" name="ticketId" value={ticket.id} />
				<input
					type="hidden"
					name="detailsVersion"
					value={ticket.detailsVersion}
				/>
				<fieldset disabled={pending}>
					{state?.error && (
						<p className="notice error" role="alert">
							{state.error}
						</p>
					)}
					{state && !state.error && (
						<p className="notice success" role="status">
							{" "}
							{t("บันทึกข้อมูลเคสแล้ว")}{" "}
						</p>
					)}
					<TicketMetadataFields
						prefix="edit-ticket"
						fields={state?.fields ?? ticket}
					/>
					<button type="submit" className="button button-secondary">
						{pending ? t("กำลังบันทึก…") : t("บันทึกข้อมูลเคส")}
					</button>
				</fieldset>
			</form>
		</details>
	);
}

export function TicketImageUpload({ ticketId }: { ticketId: string }) {
	const [state, action, pending] = useActionState(uploadTicketImage, null);
	return (
		<form action={action} className="ticket-image-upload">
			<input type="hidden" name="ticketId" value={ticketId} />
			<fieldset disabled={pending}>
				<TicketImageField id="existing-ticket-image" pending={pending} />
			</fieldset>
			{state && (
				<p
					className={`notice ${state.error ? "error" : "success"}`}
					role={state.error ? "alert" : "status"}
				>
					{state.message}
				</p>
			)}
		</form>
	);
}
