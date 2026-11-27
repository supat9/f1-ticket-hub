"use client";
import { useText } from "../../../i18n/use-text";

import { useRouter } from "next/navigation";
import { useActionState, useTransition } from "react";
import { changeLineConnection } from "./actions";

export function LineConnectionForm({
	linked,
	enabled,
	accountId,
}: {
	linked: boolean;
	enabled: boolean;
	accountId: string;
}) {
	const t = useText();
	const router = useRouter();
	const [state, action, pending] = useActionState(changeLineConnection, null);
	const [checking, startCheck] = useTransition();
	const pairing =
		!linked && enabled && state && "command" in state ? state : null;
	const lineId = encodeURIComponent(accountId);

	return (
		<div className="line-connection">
			<p>
				<strong>{t("สถานะ")}</strong>{" "}
				{linked ? t("เชื่อมต่อแล้ว") : t("ยังไม่ได้เชื่อมต่อ")}
			</p>
			{!enabled && (
				<p className="notice" role="status">
					{" "}
					{t("องค์กรยังไม่ได้เปิดใช้การแจ้งเตือน LINE ติดต่อผู้ดูแลระบบ")}{" "}
				</p>
			)}
			{enabled && !linked && (
				<p className="muted">
					{" "}
					{t(
						"เพิ่ม LINE Official Account ขององค์กรเป็นเพื่อน แล้วสร้างรหัสเพื่อผูกบัญชีของคุณ",
					)}{" "}
				</p>
			)}
			{state && "error" in state && (
				<p className="notice error" role="alert">
					{state.error}
				</p>
			)}
			{pairing && (
				<div className="line-pairing" aria-live="polite">
					<p>
						{" "}
						{t("ส่งข้อความนี้ในแชทส่วนตัวกับ")} {accountId} {t("ภายใน")}{" "}
						{pairing.minutes} {t("นาที")}{" "}
					</p>
					<code>{pairing.command}</code>
					<a
						className="button button-secondary"
						href={`https://line.me/R/oaMessage/${lineId}/?${encodeURIComponent(pairing.command)}`}
						target="_blank"
						rel="noreferrer"
					>
						{" "}
						{t("เปิดแชทพร้อมรหัส")}{" "}
					</a>
					<button
						type="button"
						className="button button-secondary"
						disabled={checking}
						onClick={() => startCheck(() => router.refresh())}
					>
						{checking ? t("กำลังตรวจสอบ…") : t("ตรวจสอบการเชื่อมต่อ")}
					</button>
				</div>
			)}
			<div className="line-actions">
				{enabled && !linked && (
					<a
						className="button button-secondary"
						href={`https://line.me/R/ti/p/${lineId}`}
						target="_blank"
						rel="noreferrer"
					>
						{" "}
						{t("เพิ่มเพื่อน")} {accountId}
					</a>
				)}
				{(enabled || linked) && (
					<form action={action}>
						<input
							type="hidden"
							name="operation"
							value={linked ? "disconnect" : "connect"}
						/>
						<button
							type="submit"
							className={
								linked ? "button button-secondary" : "button button-primary"
							}
							disabled={pending}
						>
							{pending
								? t("กำลังทำรายการ…")
								: linked
									? t("ยกเลิกการเชื่อมต่อ")
									: pairing
										? t("สร้างรหัสใหม่")
										: t("สร้างรหัสเชื่อมต่อ")}
						</button>
					</form>
				)}
			</div>
		</div>
	);
}
