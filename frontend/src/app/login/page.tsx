import { getText } from "../../i18n/server";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { fetchApi } from "../api-client";
import { Brand } from "../brand";
import { readSessionToken } from "../session";
import { isTicketCode } from "../tickets";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getText();
	return { title: t("เข้าสู่ระบบ | F1 Ticket Hub") };
}

export default async function LoginPage({
	searchParams,
}: {
	searchParams: Promise<{ q?: string | string[] }>;
}) {
	const t = await getText();
	const { q } = await searchParams;
	const returnCode = isTicketCode(q) ? q : undefined;
	const token = await readSessionToken();
	if (token) {
		const response = await fetchApi(
			"/api/auth/session",
			undefined,
			token,
		).catch(() => null);
		if (response?.ok) redirect(returnCode ? `/workspace?q=${returnCode}` : "/workspace");
	}

	return (
		<main className="login-shell">
			<div className="login-stack">
				<Brand />
				<section className="login-card" aria-labelledby="login-heading">
					<div className="login-heading">
						<h1 id="login-heading">{t("เข้าสู่ระบบ")}</h1>
					</div>
					<LoginForm returnCode={returnCode} />
					<p className="login-help">{t("ยังไม่มีบัญชีหรือลืมรหัสผ่าน ติดต่อผู้ดูแลระบบ")}</p>
				</section>
				<Link className="button button-secondary login-demo" href="/demo">
					{" "}
					{t("Explore the interactive demo →")}{" "}
				</Link>
			</div>
		</main>
	);
}
