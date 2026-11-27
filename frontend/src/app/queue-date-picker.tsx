"use client";
import { useLocale } from "next-intl";
import { useText } from "../i18n/use-text";

import { type KeyboardEvent, useRef, useState } from "react";
import { QueueFilterPopover } from "./queue-filter-popover";
import { Icon } from "./ui-icon";

const bangkokToday = new Intl.DateTimeFormat("sv-SE", {
	timeZone: "Asia/Bangkok",
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
});
const weekdays = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

function dateKey(date: Date) {
	return date.toISOString().split("T")[0];
}

function parseDate(value: string) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000"))
		return null;
	const date = new Date(`${value}T00:00:00Z`);
	return Number.isNaN(date.getTime()) || dateKey(date) !== value ? null : date;
}

function addDays(date: Date, days: number) {
	const next = new Date(date);
	next.setUTCDate(next.getUTCDate() + days);
	return next;
}

function addMonths(date: Date, months: number) {
	const next = new Date(date);
	next.setUTCDate(1);
	next.setUTCMonth(next.getUTCMonth() + months);
	const end = new Date(next);
	end.setUTCMonth(end.getUTCMonth() + 1, 0);
	next.setUTCDate(Math.min(date.getUTCDate(), end.getUTCDate()));
	return next;
}

function selectable(date: Date) {
	return date.getUTCFullYear() >= 1 && date.getUTCFullYear() <= 9999;
}

export function QueueDatePicker({
	label,
	value,
	from,
	to,
	onChange,
}: {
	label: string;
	value: string;
	from?: string;
	to?: string;
	onChange: (value: string) => void;
}) {
	const t = useText();
	const locale = useLocale() === "en" ? "en-GB" : "th-TH";
	const dateFormat = new Intl.DateTimeFormat(locale, {
		dateStyle: "medium",
		timeZone: "UTC",
	});
	const monthFormat = new Intl.DateTimeFormat(locale, {
		month: "long",
		year: "numeric",
		timeZone: "UTC",
	});

	const [cursor, setCursor] = useState<Date | null>(null);
	const moveFocus = useRef(false);
	const selected = parseDate(value);
	const todayKey = bangkokToday.format(new Date());
	const today = new Date(`${todayKey}T00:00:00Z`);
	const active = cursor ?? selected ?? today;
	const activeKey = dateKey(active);
	const firstOfMonth = addDays(active, 1 - active.getUTCDate());
	const firstCell = addDays(firstOfMonth, -firstOfMonth.getUTCDay());

	function moveDay(event: KeyboardEvent<HTMLButtonElement>, day: Date) {
		let next: Date;
		switch (event.key) {
			case "ArrowLeft":
				next = addDays(day, -1);
				break;
			case "ArrowRight":
				next = addDays(day, 1);
				break;
			case "ArrowUp":
				next = addDays(day, -7);
				break;
			case "ArrowDown":
				next = addDays(day, 7);
				break;
			case "Home":
				next = addDays(day, -day.getUTCDay());
				break;
			case "End":
				next = addDays(day, 6 - day.getUTCDay());
				break;
			case "PageUp":
				next = addMonths(day, event.shiftKey ? -12 : -1);
				break;
			case "PageDown":
				next = addMonths(day, event.shiftKey ? 12 : 1);
				break;
			default:
				return;
		}
		event.preventDefault();
		if (!selectable(next)) return;
		moveFocus.current = true;
		setCursor(next);
	}

	return (
		<QueueFilterPopover
			label={label}
			value={selected ? dateFormat.format(selected) : t("เลือกวันที่")}
			selected={Boolean(selected)}
			calendar
			onClose={() => setCursor(null)}
		>
			{(close) => {
				function choose(key: string) {
					close();
					if (key !== value) onChange(key);
				}
				return (
					<>
						<div className="queue-calendar-heading">
							<button
								type="button"
								aria-label={t("เดือนก่อนหน้า")}
								disabled={!selectable(addMonths(active, -1))}
								onClick={() => setCursor(addMonths(active, -1))}
							>
								<Icon name="chevronLeft" />
							</button>
							<strong aria-live="polite">{monthFormat.format(active)}</strong>
							<button
								type="button"
								aria-label={t("เดือนถัดไป")}
								disabled={!selectable(addMonths(active, 1))}
								onClick={() => setCursor(addMonths(active, 1))}
							>
								<Icon name="chevronRight" />
							</button>
						</div>
						<div className="queue-calendar-grid">
							{weekdays.map((day) => (
								<span key={day} aria-hidden="true">
									{t(day)}
								</span>
							))}
							{Array.from({ length: 42 }, (_, index) => {
								const day = addDays(firstCell, index);
								const key = dateKey(day);
								const activeDay = key === activeKey;
								return (
									<button
										key={key}
										type="button"
										ref={
											activeDay
												? (button) => {
														if (button && moveFocus.current) {
															moveFocus.current = false;
															button.focus();
														}
													}
												: undefined
										}
										tabIndex={activeDay ? 0 : -1}
										data-initial-focus={activeDay ? "" : undefined}
										data-outside={day.getUTCMonth() !== active.getUTCMonth()}
										data-in-range={Boolean(
											from && to && key >= from && key <= to,
										)}
										aria-current={key === todayKey ? "date" : undefined}
										aria-pressed={key === value}
										aria-label={dateFormat.format(day)}
										disabled={!selectable(day)}
										onKeyDown={(event) => moveDay(event, day)}
										onClick={() => choose(key)}
									>
										{day.getUTCDate()}
									</button>
								);
							})}
						</div>
						<div className="queue-calendar-actions">
							<button
								type="button"
								disabled={!value}
								onClick={() => choose("")}
							>
								{" "}
								{t("ล้างวันที่")}{" "}
							</button>
							<button type="button" onClick={() => choose(todayKey)}>
								{" "}
								{t("วันนี้")}{" "}
							</button>
						</div>
					</>
				);
			}}
		</QueueFilterPopover>
	);
}
