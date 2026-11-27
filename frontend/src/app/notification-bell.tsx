"use client";
import { useText } from "../i18n/use-text";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { TicketTime } from "./ticket-badges";
import { Icon } from "./ui-icon";

type Inbox = {
	items: {
		id: string;
		ticketId: string;
		code: string;
		title: string;
		createdAt: string;
		read: boolean;
	}[];
	unread: number;
};

export function NotificationBell({ queueHref }: { queueHref: string }) {
	const t = useText();
	const panelId = useId();
	const headingId = useId();
	const panel = useRef<HTMLElement>(null);
	const inFlight = useRef<AbortController>(null);
	const [inbox, setInbox] = useState<Inbox | null>(null);
	const [unavailable, setUnavailable] = useState(false);
	const [saveError, setSaveError] = useState(false);
	const [markingAll, setMarkingAll] = useState(false);

	const refresh = useCallback(async () => {
		inFlight.current?.abort();
		const request = new AbortController();
		inFlight.current = request;
		try {
			const response = await fetch("/api/notifications", {
				cache: "no-store",
				signal: request.signal,
			});
			if (!response.ok) throw new Error("Notifications unavailable");
			const data: Inbox = await response.json();
			if (request.signal.aborted) return;
			setInbox(data);
			setUnavailable(false);
		} catch {
			if (!request.signal.aborted) setUnavailable(true);
		}
	}, []);

	useEffect(() => {
		function refreshVisible() {
			if (document.visibilityState === "visible") void refresh();
		}
		refreshVisible();
		const interval = window.setInterval(refreshVisible, 12000);
		document.addEventListener("visibilitychange", refreshVisible);
		return () => {
			window.clearInterval(interval);
			document.removeEventListener("visibilitychange", refreshVisible);
			inFlight.current?.abort();
		};
	}, [refresh]);

	async function markRead(body: { id: string } | { through: string }) {
		setSaveError(false);
		try {
			const response = await fetch("/api/notifications", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
				keepalive: true,
			});
			if (!response.ok) throw new Error("Could not mark notifications read");
			await refresh();
		} catch {
			setSaveError(true);
		}
	}

	const unread = inbox?.unread ?? 0;
	const latest = inbox?.items[0];

	return (
		<>
			<button
				type="button"
				className="button button-secondary notification-bell"
				popoverTarget={panelId}
				aria-label={
					unread ? t("แจ้งเตือน ยังไม่ได้อ่าน {0} รายการ", unread) : t("แจ้งเตือน")
				}
				onClick={() => void refresh()}
			>
				<Icon name="bell" />
				{unread > 0 && (
					<span aria-hidden="true">{unread > 99 ? "99+" : unread}</span>
				)}
			</button>
			<section
				className="notification-panel"
				id={panelId}
				ref={panel}
				popover="auto"
				aria-labelledby={headingId}
			>
				<header className="notification-heading">
					<h2 id={headingId}>{t("แจ้งเตือน")}</h2>
					{unread > 0 && latest && (
						<button
							type="button"
							className="button button-secondary"
							disabled={markingAll}
							onClick={async () => {
								setMarkingAll(true);
								await markRead({ through: latest.id });
								setMarkingAll(false);
							}}
						>
							{" "}
							{t("อ่านทั้งหมด")}{" "}
						</button>
					)}
				</header>
				{saveError && (
					<p className="notification-message" role="alert">
						{" "}
						{t("บันทึกว่าอ่านแล้วไม่สำเร็จ ลองอีกครั้งได้เลย")}{" "}
					</p>
				)}
				{unavailable && (
					<p className="notification-message" role="status">
						{" "}
						{t("โหลดแจ้งเตือนไม่สำเร็จ ระบบจะลองใหม่อีกครั้ง")}{" "}
					</p>
				)}
				{!inbox && !unavailable && (
					<p className="notification-message" role="status">
						{" "}
						{t("กำลังโหลดแจ้งเตือน…")}{" "}
					</p>
				)}
				{inbox?.items.length === 0 && !unavailable && (
					<p className="notification-message">
						{t("ยังไม่มีแจ้งเตือนการมอบหมายงาน")}
					</p>
				)}
				{!!inbox?.items.length && (
					<ul className="notification-items">
						{inbox.items.map((item) => (
							<li key={item.id}>
								<Link
									href={`${queueHref}&ticket=${item.ticketId}`}
									scroll={false}
									data-unread={!item.read}
									onClick={() => {
										panel.current?.hidePopover();
										if (!item.read) void markRead({ id: item.id });
									}}
								>
									<span className="notification-meta">
										{" "}
										{t("คุณได้รับมอบหมายเคส")} {item.code}
										{!item.read && <strong>{t("ใหม่")}</strong>}
									</span>
									<strong>{item.title}</strong>
									<time dateTime={item.createdAt}>
										<TicketTime date={new Date(item.createdAt)} />
									</time>
								</Link>
							</li>
						))}
					</ul>
				)}
				<footer className="notification-settings">
					<Link
						href="/settings/line"
						onClick={() => panel.current?.hidePopover()}
					>
						{" "}
						{t("ตั้งค่าแจ้งเตือน LINE")}{" "}
					</Link>
				</footer>
			</section>
		</>
	);
}
