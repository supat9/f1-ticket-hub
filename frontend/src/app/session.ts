import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const sessionCookie = "f1_session";
export const roleLabels = { admin: "Admin", cs: "CS", dev: "Dev" } as const;
export type StaffRole = keyof typeof roleLabels;
export type Account = { id: string; email: string; role: StaffRole };

export async function readSessionToken() {
	return (await cookies()).get(sessionCookie)?.value;
}

export async function requireSessionToken(loginHref = "/login") {
	const token = await readSessionToken();
	if (!token) redirect(loginHref);
	return token;
}
