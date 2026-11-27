import { getText } from "../../i18n/server";
import type { useText } from "../../i18n/use-text";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { fetchApi } from "../api-client";
import { Brand } from "../brand";
import { queueHref } from "../queue-url";
import { requireSessionToken } from "../session";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getText();
	return { title: t("รายงานคิว | F1 Ticket Hub") };
}

type Report = {
	total: number;
	backlog: number;
	overdue: number;
	dueSoon: number;
	resolved: number;
	resolvedInTime: number;
	started: number;
	medianStartHours: number | null;
	medianResolutionHours: number | null;
};

const thaiNumber = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 1 });

function metricDuration(hours: number | null, t: ReturnType<typeof useText>) {
	if (hours === null) return "—";
	if (hours < 1 / 60) return t("น้อยกว่า 1 นาที");
	return hours < 1
		? t("{0} นาที", thaiNumber.format(hours * 60))
		: t("{0} ชม.", thaiNumber.format(hours));
}

function reportDate(value: string | string[] | undefined) {
	return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
		? value
		: "";
}

export default async function Reports({
	searchParams,
}: {
	searchParams: Promise<{ from?: string | string[]; to?: string | string[] }>;
}) {
	const t = await getText();
	const [params, token] = await Promise.all([
		searchParams,
		requireSessionToken(),
	]);
	const from = reportDate(params.from);
	const to = reportDate(params.to);
	const scope = { ...(from ? { from } : {}), ...(to ? { to } : {}) };
	const response = await fetchApi(
		`/api/tickets/report?${new URLSearchParams(scope)}`,
		undefined,
		token,
	).catch(() => null);
	if (response?.status === 401) redirect("/login");
	const report: Report | null = response?.ok
		? await response.json().catch(() => null)
		: null;
	const problem =
		response?.status === 400
			? t("กรุณาตรวจสอบช่วงวันที่")
			: t("โหลดรายงานไม่ได้ กรุณาลองอีกครั้ง");
	return (
		<>
			<header className="topbar">
				<div className="topbar-inner">
					<Brand />
					<Link href="/workspace" className="button button-secondary">
						{" "}
						{t("กลับไปที่คิว")}{" "}
					</Link>
				</div>
			</header>
			<main className="workspace report-workspace">
				<header className="queue-heading">
					<div>
						<h1>{t("รายงานคิว")}</h1>
						<p className="muted">
							{t("นับจากวันที่สร้างเคสในช่วงที่เลือก ตามสิทธิ์ของบัญชีนี้")}
						</p>
					</div>
				</header>
				<form className="report-range" action="/reports" method="get">
					<label>
						{" "}
						{t("วันที่เริ่มต้น")}{" "}
						<input name="from" type="date" defaultValue={from} />
					</label>
					<label>
						{" "}
						{t("วันที่สิ้นสุด")} <input name="to" type="date" defaultValue={to} />
					</label>
					<button className="button button-primary" type="submit">
						{" "}
						{t("ดูรายงาน")}{" "}
					</button>
					{(from || to) && (
						<Link className="button button-secondary" href="/reports">
							{" "}
							{t("ทุกช่วงเวลา")}{" "}
						</Link>
					)}
				</form>
				{report ? (
					<>
						<dl className="report-grid">
							<div>
								<dt>{t("เคสทั้งหมด")}</dt>
								<dd>{report.total}</dd>
								<span>{t("ในช่วงที่เลือก")}</span>
							</div>
							<div>
								<dt>{t("งานค้าง")}</dt>
								<dd>{report.backlog}</dd>
								<span>{t("เปิดใหม่หรือกำลังดำเนินการ")}</span>
							</div>
							<div>
								<dt>{t("เกินกำหนด")}</dt>
								<dd>{report.overdue}</dd>
								<Link href={queueHref({ ...scope, filter: "overdue" })}>
									{" "}
									{t("ดูคิวเกินกำหนด →")}{" "}
								</Link>
							</div>
							<div>
								<dt>{t("ใกล้ครบกำหนด")}</dt>
								<dd>{report.dueSoon}</dd>
								<Link href={queueHref({ ...scope, filter: "due_soon" })}>
									{" "}
									{t("ดูคิวครบกำหนดใน 24 ชม. →")}{" "}
								</Link>
							</div>
							<div>
								<dt>{t("มัธยฐานเวลาเริ่มงาน")}</dt>
								<dd>{metricDuration(report.medianStartHours, t)}</dd>
								<span>
									{t("จาก")} {report.started} {t("เคสที่มีเวลาเริ่มงาน")}
								</span>
							</div>
							<div>
								<dt>{t("มัธยฐานเวลาแก้เสร็จ")}</dt>
								<dd>{metricDuration(report.medianResolutionHours, t)}</dd>
								<span>
									{t("จาก")} {report.resolved} {t("เคสที่มีเวลาแก้เสร็จ")}
								</span>
							</div>
						</dl>
						<section className="report-policy" aria-labelledby="policy-heading">
							<h2 id="policy-heading">{t("เป้าหมายเวลาแก้ไข")}</h2>
							<p>
								{report.resolved
									? t(
											"แก้เสร็จภายในเป้าหมาย {0} จาก {1} เคส",
											report.resolvedInTime,
											report.resolved,
										)
									: t("ยังไม่มีเคสที่บันทึกเวลาแก้เสร็จในช่วงนี้")}
							</p>
							{report.resolved > 0 && (
								<progress
									aria-label={t("สัดส่วนเคสที่แก้ได้ทันเวลา")}
									max={report.resolved}
									value={report.resolvedInTime}
								/>
							)}
							<p className="muted">
								{" "}
								{t(
									"นับชั่วโมงปฏิทินจากเวลาเปิดเคส · Critical 4 ชม. · High 24 ชม. · Med 72 ชม. · Low 120 ชม.",
								)}{" "}
							</p>
						</section>
					</>
				) : (
					<p className="notice error" role="alert">
						{problem}
					</p>
				)}
			</main>
		</>
	);
}
