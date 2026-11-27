"use server";
import { getText } from "../i18n/server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { fetchApi } from "./api-client";
import { readSessionToken, requireSessionToken } from "./session";
import {
	maxTicketImageBytes,
	statusOrder,
	type AssignmentState,
	type Ticket,
	type TicketFormState,
	type TicketMetadata,
	type TicketStatus,
} from "./tickets";

const expiredDraftSession = "เซสชันหมดอายุ กรุณาเข้าสู่ระบบในอีกแท็บ แล้วกลับมาบันทึกอีกครั้ง";

export async function submitTicket(
	previous: TicketFormState,
	form: FormData,
): Promise<TicketFormState> {
	const t = await getText();
	const fields = {
		title: String(form.get("title") ?? ""),
		description: String(form.get("description") ?? ""),
		source: String(form.get("source") ?? ""),
		priority: String(form.get("priority") ?? ""),
		...readTicketMetadata(form),
		...readStaffSelection(form),
	};
	const failure = { attempt: previous.attempt + 1, fields };
	const token = await readSessionToken();
	if (!token) return { ...failure, error: t(expiredDraftSession) };
	const requestId = form.get("requestId");
	if (typeof requestId !== "string" || !requestId) {
		return { ...failure, error: t("กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง") };
	}
	const response = await fetchApi(
		"/api/tickets",
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Idempotency-Key": requestId,
			},
			body: JSON.stringify(fields),
		},
		token,
	).catch(() => null);
	if (response?.status === 401)
		return { ...failure, error: t(expiredDraftSession) };
	const result = await response?.json().catch(() => null);
	if (!response || !result) {
		return { ...failure, error: t("ยืนยันการบันทึกไม่ได้ กรุณาลองส่งข้อมูลเดิมอีกครั้ง") };
	}

	if (!response.ok) return { ...failure, error: t(result.error) };

	const created: Ticket = result;
	return {
		...failure,
		saved: { id: created.id, code: created.code, uploadedImages: 0 },
	};
}

function readTicketMetadata(form: FormData): TicketMetadata {
	return {
		customerName: String(form.get("customerName") ?? ""),
		product: String(form.get("product") ?? ""),
		category: String(form.get("category") ?? ""),
		notes: String(form.get("notes") ?? ""),
	};
}

async function readTicketImage(form: FormData) {
	const t = await getText();
	const file = form.get("image");
	if (!(file instanceof File) || file.size === 0) return { encoded: "" };
	if (file.size > maxTicketImageBytes) {
		return { error: t("รูปภาพต้องมีขนาดไม่เกิน 5 MB") };
	}
	return { encoded: Buffer.from(await file.arrayBuffer()).toString("base64") };
}

type DetailEditState = {
	attempt: number;
	fields?: TicketMetadata;
	error?: string;
};

export async function saveTicketMetadata(
	previous: DetailEditState | null,
	form: FormData,
): Promise<DetailEditState> {
	const t = await getText();
	const token = await requireSessionToken();
	const attempt = (previous?.attempt ?? 0) + 1;
	const fields = readTicketMetadata(form);
	const id = String(form.get("ticketId") ?? "");
	const version = String(form.get("detailsVersion") ?? "");
	if (!/^[1-9]\d{0,18}$/.test(id) || !/^\d{1,10}$/.test(version)) {
		return { attempt, fields, error: t("กรุณาโหลดรายละเอียดเคสใหม่") };
	}
	const response = await fetchApi(
		`/api/tickets/${id}/details`,
		{
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ ...fields, detailsVersion: Number(version) }),
		},
		token,
	).catch(() => null);
	if (response?.status === 401) redirect("/login");
	if (response?.ok) {
		refresh();
		return { attempt };
	}
	const result = await response?.json().catch(() => null);
	return {
		attempt,
		fields,
		error: result?.error ? t(result.error) : t("บันทึกรายละเอียดไม่สำเร็จ"),
	};
}

export async function uploadTicketImage(
	_previous: { message: string; error: boolean } | null,
	form: FormData,
): Promise<{ message: string; error: boolean }> {
	const result = await appendTicketImage(form);
	if (!result.error) refresh();
	return result;
}

export async function appendTicketImage(
	form: FormData,
): Promise<{ message: string; error: boolean }> {
	const t = await getText();
	const token = await readSessionToken();
	if (!token) return { message: expiredDraftSession, error: true };
	const id = String(form.get("ticketId") ?? "");
	if (!/^[1-9]\d{0,18}$/.test(id))
		return { message: t("รหัสเคสไม่ถูกต้อง"), error: true };
	const image = await readTicketImage(form);
	if (!image.encoded)
		return { message: image.error ?? t("กรุณาเลือกรูปภาพ"), error: true };
	const response = await fetchApi(
		`/api/tickets/${id}/images`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ image: image.encoded }),
		},
		token,
	).catch(() => null);
	if (response?.status === 401)
		return { message: expiredDraftSession, error: true };
	if (response?.ok) {
		return { message: t("บันทึกรูปแนบแล้ว"), error: false };
	}
	const result = await response?.json().catch(() => null);
	return {
		message: result?.error ? t(result.error) : t("บันทึกรูปแนบไม่สำเร็จ"),
		error: true,
	};
}

export async function saveAssignment(
	previous: AssignmentState,
	form: FormData,
): Promise<AssignmentState> {
	const t = await getText();
	const token = await requireSessionToken();
	const attempt = previous.attempt + 1;
	const status = String(form.get("status") ?? "") as TicketStatus;
	const expectedStatus = String(
		form.get("expectedStatus") ?? "",
	) as TicketStatus;
	const fields = { ...readStaffSelection(form), status };
	const ticketId = String(form.get("ticketId") ?? "");
	const version = String(form.get("assignmentVersion") ?? "");
	if (
		!/^[1-9]\d{0,18}$/.test(ticketId) ||
		!/^\d{1,10}$/.test(version) ||
		!statusOrder.includes(status) ||
		!statusOrder.includes(expectedStatus)
	) {
		return { attempt, fields, error: t("กรุณาโหลดคิวใหม่แล้วลองอีกครั้ง") };
	}

	const response = await fetchApi(
		`/api/tickets/${ticketId}/assignment`,
		{
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				...fields,
				expectedStatus,
				assignmentVersion: Number(version),
			}),
		},
		token,
	).catch(() => null);

	if (response?.status === 401) redirect("/login");
	if (response?.ok) {
		refresh();
		return { attempt, saved: true };
	}

	const result = await response?.json().catch(() => null);
	const error = result?.error
		? t(result.error)
		: t("บันทึกการมอบหมายไม่สำเร็จ กรุณาลองอีกครั้ง");
	if (response?.status === 409) {
		refresh();
		return { attempt, error, fields, conflict: true };
	}
	if (response?.status === 404) {
		refresh();
		return { attempt, error };
	}
	return { attempt, fields, error };
}

function readStaffSelection(form: FormData) {
	return {
		ownerId: String(form.get("ownerId") ?? ""),
		assigneeId: String(form.get("assigneeId") ?? ""),
		assigneeName: String(form.get("assigneeName") ?? ""),
	};
}

export async function saveTicketStatus(
	_previous: { message: string; error: boolean } | null,
	form: FormData,
): Promise<{ message: string; error: boolean }> {
	const t = await getText();
	const token = await requireSessionToken();
	const id = String(form.get("ticketId") ?? "");
	if (!/^[1-9]\d{0,18}$/.test(id)) {
		return { message: t("กรุณาโหลดคิวใหม่แล้วลองอีกครั้ง"), error: true };
	}

	const response = await fetchApi(
		`/api/tickets/${id}/status`,
		{
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				status: form.get("status"),
				expectedStatus: form.get("expectedStatus"),
			}),
		},
		token,
	).catch(() => null);

	if (response?.status === 401) redirect("/login");
	if (response?.ok) {
		refresh();
		return { message: t("เปลี่ยนสถานะแล้ว"), error: false };
	}
	if (response?.status === 409 || response?.status === 404) refresh();
	const result = await response?.json().catch(() => null);
	return {
		message: result?.error
			? t(result.error)
			: t("เปลี่ยนสถานะไม่สำเร็จ กรุณาลองอีกครั้ง"),
		error: true,
	};
}
