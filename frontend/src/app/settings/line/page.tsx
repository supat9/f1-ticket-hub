import { getText } from "../../../i18n/server";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { fetchApi } from "../../api-client";
import { Brand } from "../../brand";
import { requireSessionToken } from "../../session";
import { LineConnectionForm } from "./connection-form";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getText();
	return { title: t("แจ้งเตือนผ่าน LINE | F1 Ticket Hub") };
}

export default async function LineSettingsPage() {
	const t = await getText();
	const token = await requireSessionToken();
	const response = await fetchApi("/api/line", undefined, token).catch(
		() => null,
	);
	if (response?.status === 401) redirect("/login");
	const status: {
		linked: boolean;
		enabled: boolean;
		accountId: string;
	} | null = response?.ok ? await response.json().catch(() => null) : null;

	return (
		<>
			<header className="topbar">
				<div className="topbar-inner">
					<Brand />
					<Link className="button button-secondary logout" href="/workspace">
						{" "}
						{t("กลับไปคิว")}{" "}
					</Link>
				</div>
			</header>
			<main className="workspace">
				<header className="queue-heading">
					<div>
						<h1>{t("แจ้งเตือนผ่าน LINE")}</h1>
						<p className="muted">{t("รับข้อความส่วนตัวเมื่อมีเคสใหม่มอบหมายให้คุณ")}</p>
					</div>
				</header>
				<section
					className="admin-panel line-panel"
					aria-label={t("การเชื่อมต่อ LINE")}
				>
					{status ? (
						<LineConnectionForm key={String(status.linked)} {...status} />
					) : (
						<p className="notice error" role="alert">
							{" "}
							{t("โหลดการตั้งค่า LINE ไม่สำเร็จ กรุณาลองอีกครั้ง")}{" "}
						</p>
					)}
				</section>
			</main>
		</>
	);
}
