"use server";
import { getText } from "../i18n/server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { fetchApi } from "./api-client";
import { readSessionToken, sessionCookie } from "./session";
import { isTicketCode } from "./tickets";

export async function signIn(
	_previous: string | null,
	form: FormData,
): Promise<string | null> {
	const t = await getText();
	const email = form.get("email");
	const password = form.get("password");
	if (
		typeof email !== "string" ||
		typeof password !== "string" ||
		!email.trim() ||
		!password
	) {
		return t("กรุณากรอกอีเมลและรหัสผ่าน");
	}

	try {
		const response = await fetchApi("/api/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email, password }),
		});
		if (response.status === 401) return t("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
		if (response.status === 429)
			return t("ลองเข้าสู่ระบบหลายครั้งเกินไป กรุณารอสักครู่แล้วลองอีกครั้ง");
		if (!response.ok) return t("ระบบเข้าสู่ระบบยังไม่พร้อม กรุณาลองอีกครั้ง");

		const session: { token: string; expiresAt: string } = await response.json();
		(await cookies()).set(sessionCookie, session.token, {
			httpOnly: true,
			sameSite: "lax",
			secure: process.env.SESSION_COOKIE_SECURE === "true",
			path: "/",
			expires: new Date(session.expiresAt),
		});
	} catch {
		return t("เชื่อมต่อระบบเข้าสู่ระบบไม่ได้ กรุณาลองอีกครั้ง");
	}

	const returnCode = form.get("returnCode");
	redirect(isTicketCode(returnCode) ? `/workspace?q=${returnCode}` : "/workspace");
}

export async function signOut() {
	const token = await readSessionToken();
	if (token) {
		const response = await fetchApi(
			"/api/auth/session",
			{ method: "DELETE" },
			token,
		).catch(() => null);
		if (!response?.ok) redirect("/workspace?logout=unavailable");
	}
	(await cookies()).delete(sessionCookie);
	redirect("/login");
}
