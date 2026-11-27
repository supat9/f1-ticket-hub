"use server";
import { getText } from "../i18n/server";

import { refresh } from "next/cache";
import { fetchApi } from "./api-client";
import { readSessionToken } from "./session";

type WorkflowState = {
	message: string;
	error: boolean;
	fields?: Record<string, string>;
};

export async function saveWorkflow(
	_previous: WorkflowState | null,
	form: FormData,
): Promise<WorkflowState> {
	const t = await getText();
	const ticketId = String(form.get("ticketId") ?? "");
	const action = String(form.get("action") ?? "");
	const fields = Object.fromEntries(
		[
			"assigneeId",
			"steps",
			"impact",
			"resolution",
			"pullRequestUrl",
			"reviewNote",
			"note",
		].map((key) => [key, String(form.get(key) ?? "")]),
	);
	const token = await readSessionToken();
	if (!token)
		return { message: t("เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง"), error: true, fields };
	if (!/^[1-9]\d{0,18}$/.test(ticketId))
		return { message: t("รหัสเคสไม่ถูกต้อง"), error: true, fields };
	const note = action === "note";
	const headers = new Headers({ "Content-Type": "application/json" });
	const noteRequestId = form.get("noteRequestId");
	if (note && typeof noteRequestId === "string")
		headers.set("Idempotency-Key", noteRequestId);
	const response = await fetchApi(
		`/api/tickets/${ticketId}/${note ? "notes" : "workflow"}`,
		{
			method: note ? "POST" : "PATCH",
			headers,
			body: JSON.stringify(
				note
					? { note: fields.note }
					: { ...fields, action, version: Number(form.get("version")) },
			),
		},
		token,
	).catch(() => null);
	if (response?.ok) {
		refresh();
		return { message: t("บันทึกแล้ว"), error: false };
	}
	const result = await response?.json().catch(() => null);
	if (response?.status === 409 || response?.status === 404) refresh();
	return {
		message: result?.error ? t(result.error) : t("บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง"),
		error: true,
		fields,
	};
}
