"use server";
import { getText } from "../../i18n/server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { fetchApi } from "../api-client";
import { requireSessionToken } from "../session";

type Result = { error?: string; success?: string } | null;

async function save(
	path: string,
	method: "POST" | "PATCH",
	body: object,
	success: string,
): Promise<Result> {
	const t = await getText();
	const token = await requireSessionToken();
	const response = await fetchApi(
		path,
		{
			method,
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		},
		token,
	).catch(() => null);
	if (response?.status === 401) redirect("/login");
	if (response?.ok) {
		refresh();
		return { success };
	}
	const result = await response?.json().catch(() => null);
	return {
		error: result?.error ? t(result.error) : t("บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง"),
	};
}

export async function createEmployee(
	_previous: Result,
	form: FormData,
): Promise<Result> {
	const t = await getText();
	const email = String(form.get("email") ?? "").trim();
	const password = String(form.get("password") ?? "");
	const role = String(form.get("role") ?? "");
	if (password !== form.get("confirmation"))
		return { error: t("รหัสผ่านทั้งสองช่องไม่ตรงกัน") };
	return save(
		"/api/admin/users",
		"POST",
		{ email, password, role },
		t("สร้างบัญชี {0} แล้ว", email),
	);
}

export async function changeEmployeeRole(
	_previous: Result,
	form: FormData,
): Promise<Result> {
	const t = await getText();
	const id = String(form.get("id") ?? "");
	if (!/^[1-9]\d{0,18}$/.test(id)) return { error: t("รหัสบัญชีไม่ถูกต้อง") };
	return save(
		`/api/admin/users/${id}/role`,
		"PATCH",
		{ role: form.get("role") },
		t("บันทึกทีมแล้ว"),
	);
}

export async function resetEmployeePassword(
	_previous: Result,
	form: FormData,
): Promise<Result> {
	const t = await getText();
	const id = String(form.get("id") ?? "");
	const password = String(form.get("password") ?? "");
	if (!/^[1-9]\d{0,18}$/.test(id)) return { error: t("รหัสบัญชีไม่ถูกต้อง") };
	if (password !== form.get("confirmation"))
		return { error: t("รหัสผ่านทั้งสองช่องไม่ตรงกัน") };
	return save(
		`/api/admin/users/${id}/password`,
		"PATCH",
		{ password },
		t("ตั้งรหัสผ่านใหม่และออกจากระบบบนอุปกรณ์เดิมแล้ว"),
	);
}
