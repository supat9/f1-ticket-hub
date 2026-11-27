import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
export default getRequestConfig(async () => ({
	locale: (await cookies()).get("f1_language")?.value === "en" ? "en" : "th",
	timeZone: "Asia/Bangkok",
	messages: {},
}));
