"use server";
import { getText } from "../../../i18n/server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { fetchApi } from "../../api-client";
import { requireSessionToken } from "../../session";

type LineActionState =
	| { command: string; minutes: number }
	| { error: string }
	| null;

export async function changeLineConnection(
	_previous: LineActionState,
	form: FormData,
): Promise<LineActionState> {
	const t = await getText();
	const operation = form.get("operation");
	if (operation !== "connect" && operation !== "disconnect") {
		return { error: t("คำขอไม่ถูกต้อง") };
	}
	const token = await requireSessionToken();
	const response = await (operation === "connect"
		? fetchApi("/api/line/pairing", { method: "POST" }, token)
		: fetchApi("/api/line", { method: "DELETE" }, token)
	).catch(() => null);
	if (response?.status === 401) redirect("/login");
	if (response?.status === 409) {
		refresh();
		return null;
	}
	if (!response?.ok) return { error: t("ทำรายการไม่สำเร็จ กรุณาลองอีกครั้ง") };
	if (operation === "disconnect") {
		refresh();
		return null;
	}
	return response
		.json()
		.catch(() => ({ error: t("สร้างรหัสไม่สำเร็จ กรุณาลองอีกครั้ง") }));
}
