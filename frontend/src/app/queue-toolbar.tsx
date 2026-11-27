"use client";
import { useText } from "../i18n/use-text";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { QueueDatePicker } from "./queue-date-picker";
import { QueueDropdown } from "./queue-filter-popover";
import { queueHref } from "./queue-url";
import { Priority, StatusBadge } from "./ticket-badges";
import {
	priorities,
	queueFilters,
	statuses,
	type QueueFilter,
	type QueueSummary,
	type QueueView,
} from "./tickets";
import { Icon } from "./ui-icon";

type Query = Record<string, string>;

const priorityOptions = [
	{ value: "", label: "ทุกระดับ" },
	...(Object.keys(priorities) as (keyof typeof priorities)[]).map((value) => ({
		value,
		label: priorities[value],
		indicator: <Priority priority={value} />,
	})),
];
const statusOptions = [
	{ value: "", label: "ทุกสถานะ" },
	...(Object.keys(statuses) as (keyof typeof statuses)[]).map((value) => ({
		value,
		label: statuses[value],
		indicator: <StatusBadge status={value} />,
	})),
];

export function QueueToolbar({
	view,
	filter,
	criteria,
	summary,
	createHref,
	canExport,
	dialogActive,
}: {
	view: QueueView;
	filter: QueueFilter;
	criteria: Query;
	summary: QueueSummary | null;
	createHref?: string;
	canExport: boolean;
	dialogActive: boolean;
}) {
	const t = useText();
	const router = useRouter();
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
	const composing = useRef(false);
	const [pending, startTransition] = useTransition();
	const [debouncing, setDebouncing] = useState(false);
	const [filtersExpanded, setFiltersExpanded] = useState(false);
	const filterFieldsId = useId();
	const navigationKey = JSON.stringify([view, filter, criteria]);
	const [seenNavigation, setSeenNavigation] = useState(navigationKey);
	const [draft, setDraft] = useState(criteria);

	if (seenNavigation !== navigationKey && !pending && !debouncing) {
		setSeenNavigation(navigationKey);
		const next = { ...criteria };
		if (draft.q && draft.q.trim() === (criteria.q ?? "")) next.q = draft.q;
		setDraft(next);
	}

	useEffect(() => () => clearTimeout(timer.current), []);
	useEffect(() => {
		if (dialogActive || pending || debouncing) return;

		function refreshQueue() {
			const params = new URLSearchParams(window.location.search);
			if (
				document.visibilityState === "visible" &&
				!params.has("new") &&
				!params.has("ticket") &&
				!composing.current &&
				!document.querySelector(
					'dialog[open], :popover-open, [data-dragging], [data-status-draft], .board-scroll[aria-busy="true"]',
				)
			) {
				router.refresh();
			}
		}

		const interval = window.setInterval(refreshQueue, 12000);
		document.addEventListener("visibilitychange", refreshQueue);
		return () => {
			window.clearInterval(interval);
			document.removeEventListener("visibilitychange", refreshQueue);
		};
	}, [router, dialogActive, pending, debouncing]);

	const { q: keyword = "", priority, status, from, to } = draft;
	const activeCriteriaCount = [priority, status, from, to].filter(
		Boolean,
	).length;
	const appliedCriteria = Boolean(
		criteria.priority || criteria.status || criteria.from || criteria.to,
	);
	const filterQuery = (key: QueueFilter, values = draft): Query => {
		const query = key === "all" ? {} : { filter: key };
		return {
			...query,
			...Object.fromEntries(
				Object.entries(values)
					.map(([name, value]) => [name, value.trim()])
					.filter(([, value]) => value),
			),
		};
	};

	function cancelSearch() {
		clearTimeout(timer.current);
		setDebouncing(false);
	}

	function update(next: Query, delay = 0) {
		clearTimeout(timer.current);
		setDraft(next);
		setDebouncing(delay > 0);
		const navigate = () => {
			startTransition(() => {
				router.replace(queueHref({ view, ...filterQuery(filter, next) }), {
					scroll: false,
				});
			});
			setDebouncing(false);
		};
		if (delay > 0) timer.current = setTimeout(navigate, delay);
		else navigate();
	}

	function changeFilter(
		name: "priority" | "status" | "from" | "to",
		value: string,
	) {
		update({ ...draft, [name]: value });
	}

	return (
		<>
			<header className="queue-heading">
				<div>
					<h1>{t("คิว Ticket")}</h1>
					<p className="muted">
						{summary && (criteria.q || appliedCriteria)
							? t(
									"{0} {1} เคส",
									criteria.q ? t("ผลการค้นหา") : t("ผลการกรอง"),
									summary[filter],
								)
							: summary
								? t(
										"ทั้งหมด {0} เคส · เปิดใหม่ {1} · ยังไม่มอบหมาย {2} · เรียงจากเคสล่าสุด",
										summary.all,
										summary.open,
										summary.unassigned,
									)
								: t("ติดตามเคสของทีมซัพพอร์ตและทีมพัฒนา")}
					</p>
				</div>
				<div className="queue-actions">
					<Link className="button button-secondary" href="/reports">
						{" "}
						{t("รายงาน")}{" "}
					</Link>
					<nav className="view-switch" aria-label={t("มุมมองคิว")}>
						<Link
							href={queueHref({ view: "table", ...filterQuery(filter) })}
							aria-current={view === "table" ? "page" : undefined}
							onNavigate={cancelSearch}
							scroll={false}
						>
							<Icon name="table" /> {t("ตาราง")}{" "}
						</Link>
						<Link
							href={queueHref({ view: "kanban", ...filterQuery(filter) })}
							aria-current={view === "kanban" ? "page" : undefined}
							onNavigate={cancelSearch}
							scroll={false}
						>
							<Icon name="board" /> {t("Kanban")}{" "}
						</Link>
					</nav>
					{createHref && (
						<Link
							id="queue-create"
							className="button button-primary queue-create"
							href={createHref}
							onNavigate={cancelSearch}
							scroll={false}
						>
							<Icon name="plus" /> {t("แจ้งเคสใหม่")}{" "}
						</Link>
					)}
				</div>
			</header>
			<search aria-label={t("ค้นหาเคส")} aria-busy={pending || debouncing}>
				<form
					className="queue-search"
					onSubmit={(event) => {
						event.preventDefault();
						if (!composing.current && keyword.trim() !== (criteria.q ?? ""))
							update(draft);
					}}
				>
					<input
						type="search"
						name="q"
						aria-label={t("รหัสหรือชื่อเคส")}
						placeholder={t("ค้นหาด้วยรหัสหรือชื่อเคส")}
						value={keyword}
						maxLength={320}
						autoComplete="off"
						onChange={(event) => {
							const next = { ...draft, q: event.currentTarget.value };
							if (composing.current) setDraft(next);
							else update(next, 300);
						}}
						onCompositionStart={() => {
							composing.current = true;
							cancelSearch();
						}}
						onCompositionEnd={(event) => {
							composing.current = false;
							update({ ...draft, q: event.currentTarget.value }, 300);
						}}
					/>
					{keyword && (
						<button
							type="button"
							className="button button-secondary"
							aria-label={t("ล้างคำค้นหา")}
							onClick={() => update({ ...draft, q: "" })}
						>
							{" "}
							{t("ล้าง")}{" "}
						</button>
					)}
				</form>
			</search>
			<nav className="queue-filters" aria-label={t("ตัวกรองคิว")}>
				{(Object.keys(queueFilters) as QueueFilter[]).map((key) => (
					<Link
						key={key}
						href={queueHref({ view, ...filterQuery(key) })}
						aria-current={key === filter ? "page" : undefined}
						onNavigate={cancelSearch}
						scroll={false}
					>
						{t(queueFilters[key])} {summary && <span>{summary[key]}</span>}
					</Link>
				))}
			</nav>
			<form
				aria-label={t("ตัวกรองเคส")}
				className="queue-criteria"
				data-expanded={filtersExpanded}
				onSubmit={(event) => event.preventDefault()}
			>
				<button
					type="button"
					className="button button-secondary queue-criteria-toggle"
					aria-expanded={filtersExpanded}
					aria-controls={filterFieldsId}
					onClick={() => setFiltersExpanded((expanded) => !expanded)}
				>
					{" "}
					{t("ตัวกรอง")}
					{activeCriteriaCount > 0 && ` (${activeCriteriaCount})`}
					<Icon name="chevronDown" />
				</button>
				<div className="queue-criteria-fields" id={filterFieldsId}>
					<QueueDropdown
						label={t("Priority")}
						value={priority ?? ""}
						options={priorityOptions.map((o) => ({ ...o, label: t(o.label) }))}
						onChange={(value) => changeFilter("priority", value)}
					/>
					<QueueDropdown
						label={t("สถานะ")}
						value={status ?? ""}
						options={statusOptions.map((o) => ({ ...o, label: t(o.label) }))}
						onChange={(value) => changeFilter("status", value)}
					/>
					<QueueDatePicker
						label={t("วันที่สร้างตั้งแต่")}
						value={from ?? ""}
						from={from}
						to={to}
						onChange={(value) => changeFilter("from", value)}
					/>
					<QueueDatePicker
						label={t("วันที่สร้างถึง")}
						value={to ?? ""}
						from={from}
						to={to}
						onChange={(value) => changeFilter("to", value)}
					/>
					{activeCriteriaCount > 0 && (
						<button
							type="button"
							className="button button-secondary"
							onClick={() => update({ q: keyword })}
						>
							{" "}
							{t("ล้างตัวกรอง")}{" "}
						</button>
					)}
				</div>
				{canExport && (
					<a
						className="button button-secondary queue-export"
						href={`/api/tickets/export?${new URLSearchParams(filterQuery(filter, criteria))}`}
						download
						aria-disabled={pending || debouncing}
						onClick={(event) => {
							if (pending || debouncing) event.preventDefault();
						}}
					>
						<Icon name="download" /> {t("Export CSV")}{" "}
					</a>
				)}
			</form>
		</>
	);
}
