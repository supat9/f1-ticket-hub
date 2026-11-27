import { getText } from "../../i18n/server";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { fetchApi } from "../api-client";
import { Brand } from "../brand";
import { type Account, requireSessionToken, roleLabels } from "../session";
import {
	CreateEmployeeForm,
	EmployeePasswordForm,
	EmployeeRoleForm,
} from "./forms";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getText();
	return { title: t("Admin | F1 Ticket Hub") };
}

export default async function AdminPage() {
	const t = await getText();
	const token = await requireSessionToken();
	const response = await fetchApi("/api/admin/users", undefined, token).catch(
		() => null,
	);
	if (response?.status === 401) redirect("/login");
	const data: { users: Account[] } | null = response?.ok
		? await response.json().catch(() => null)
		: null;
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
			<main className="workspace admin-workspace">
				<header className="queue-heading">
					<div>
						<h1>{t("จัดการบัญชีพนักงาน")}</h1>
						<p className="muted">
							{" "}
							{t("สร้างบัญชี กำหนดทีม และรีเซ็ตรหัสผ่านให้พนักงาน CS หรือ Dev")}{" "}
						</p>
					</div>
				</header>
				{!data ? (
					<p className="notice error" role="alert">
						{response?.status === 403
							? t("หน้านี้สำหรับผู้ดูแลระบบเท่านั้น")
							: t("โหลดรายชื่อบัญชีไม่ได้ กรุณาลองอีกครั้ง")}
					</p>
				) : (
					<div className="admin-grid">
						<section
							className="admin-panel"
							aria-labelledby="create-employee-heading"
						>
							<h2 id="create-employee-heading">{t("สร้างบัญชีพนักงาน")}</h2>
							<CreateEmployeeForm />
						</section>
						<section
							className="admin-panel"
							aria-labelledby="employees-heading"
						>
							<h2 id="employees-heading">
								{" "}
								{t("บัญชีพนักงาน")}{" "}
								<span className="muted">
									· {data.users.length} {t("บัญชี")}
								</span>
							</h2>
							<ul className="admin-users">
								{data.users.map((account) => (
									<li key={account.id}>
										<div>
											<strong>{account.email}</strong>
											<p className="muted">{t(roleLabels[account.role])}</p>
										</div>
										{account.role !== "admin" && (
											<>
												<EmployeeRoleForm account={account} />
												<EmployeePasswordForm account={account} />
											</>
										)}
									</li>
								))}
							</ul>
						</section>
					</div>
				)}
			</main>
		</>
	);
}
