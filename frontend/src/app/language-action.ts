"use server";
import { cookies } from "next/headers";
import type { Language } from "../i18n/text";
export async function changeLanguage(language: Language) {
	if (language !== "th" && language !== "en") return;
	(await cookies()).set("f1_language", language, {
		path: "/",
		sameSite: "lax",
		httpOnly: true,
		maxAge: 31536000,
	});
}
