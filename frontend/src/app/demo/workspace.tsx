"use client";
import Link from "next/link";
import { Brand } from "../brand";
import { LanguageSwitch } from "../language-switch";
import { useText } from "../../i18n/use-text";

import {
	type FormEvent,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { statusOrder, type TicketStatus } from "../tickets";
import { Icon } from "../ui-icon";
import {
	demoAreas,
	demoAssignees,
	demoPriorities,
	demoStatuses,
	demoTicketCode,
	sampleTickets,
	type DemoPriority,
	type DemoTicket,
} from "./data";
import { DemoGuide, guideSteps } from "./guide";
import { DemoTriage } from "./triage";

const deadlines = { urgent: 4, high: 24, normal: 72, low: 120 };
const sampleAgeHours: Record<number, number> = {
	108: 6,
	107: 12,
	106: 8,
	105: 63,
	104: 27,
};
const serviceQueues = {
	all: "All tickets",
	triage: "Needs triage",
	due: "Due within 24h",
	overdue: "Overdue",
} as const;
type ServiceQueue = keyof typeof serviceQueues;

const queueIcons = {
	all: "layers",
	triage: "inbox",
	due: "clock",
	overdue: "alert",
} as const;
const toolViews = {
	"ai-triage": "AI triage brief",
	walkthrough: "Guided walkthrough",
} as const;
function readView() {
	const hash = window.location.hash.slice(1);
	return hash === "ai-triage" ||
		hash === "walkthrough" ||
		Object.hasOwn(serviceQueues, hash)
		? hash
		: "all";
}
function subscribeView(onChange: () => void) {
	window.addEventListener("hashchange", onChange);
	return () => window.removeEventListener("hashchange", onChange);
}

function inServiceQueue(
	ticket: DemoTicket,
	queue: ServiceQueue,
	guidedId: number | null,
	guideStep: number,
) {
	if (queue === "all") return true;
	if (queue === "triage")
		return (
			ticket.status === "open" && (ticket.id !== guidedId || guideStep < 2)
		);
	if (ticket.status === "resolved" || ticket.status === "closed") return false;
	const hoursLeft =
		deadlines[ticket.priority] - (sampleAgeHours[ticket.id] ?? 0);
	return queue === "overdue"
		? hoursLeft <= 0
		: hoursLeft > 0 && hoursLeft <= 24;
}

function PriorityLabel({ priority }: { priority: DemoPriority }) {
	const t = useText();
	return (
		<span className="demo-priority" data-priority={priority}>
			{t(demoPriorities[priority])}
		</span>
	);
}

function Assignee({ name }: { name: string }) {
	const t = useText();
	if (!name) return <span className="demo-unassigned">{t("Unassigned")}</span>;
	const initials = name
		.split(" ")
		.map((part) => part[0])
		.join("");
	return (
		<span className="demo-assignee">
			<span className="demo-avatar" data-initials={initials} aria-hidden="true">
				{initials}
			</span>
			{name}
		</span>
	);
}

export function DemoWorkspace() {
	const t = useText();
	const [tickets, setTickets] = useState(sampleTickets);
	const [query, setQuery] = useState("");
	const [priority, setPriority] = useState("");
	const [view, setView] = useState<"board" | "table">("board");
	const [editor, setEditor] = useState<number | "new" | null>(null);
	const [announcement, setAnnouncement] = useState("");
	const [draggedId, setDraggedId] = useState<number | null>(null);
	const [dropTarget, setDropTarget] = useState<TicketStatus | null>(null);
	const activeView = useSyncExternalStore(subscribeView, readView, () => "all");
	const toolsOpen = activeView === "ai-triage" || activeView === "walkthrough";
	const serviceQueue = toolsOpen ? "all" : (activeView as ServiceQueue);
	const heading = t(
		toolsOpen ? toolViews[activeView] : serviceQueues[serviceQueue],
	);
	const searchField = useRef<HTMLInputElement>(null);
	useEffect(() => {
		function focusSearch(event: KeyboardEvent) {
			const target = event.target;
			if (
				!toolsOpen &&
				editor === null &&
				event.key === "/" &&
				!event.altKey &&
				!event.ctrlKey &&
				!event.metaKey &&
				!(
					target instanceof Element &&
					target.closest("input,textarea,select,[contenteditable=true]")
				)
			) {
				event.preventDefault();
				searchField.current?.focus();
			}
		}
		window.addEventListener("keydown", focusSearch);
		return () => window.removeEventListener("keydown", focusSearch);
	}, [toolsOpen, editor]);
	const [guideStep, setGuideStep] = useState(0);
	const [demoReset, setDemoReset] = useState(0);
	const [guidedId, setGuidedId] = useState<number | null>(null);
	const search = query.trim().toLowerCase();
	const matching = tickets.filter(
		(ticket) =>
			inServiceQueue(ticket, serviceQueue, guidedId, guideStep) &&
			(!priority || ticket.priority === priority) &&
			[
				demoTicketCode(ticket.id),
				ticket.title,
				ticket.area,
				t(ticket.title),
				t(ticket.area),
				ticket.assignee,
			].some((value) => value.toLowerCase().includes(search)),
	);
	const stages = statusOrder.map((status) => ({
		status,

		matches: matching.filter((ticket) => ticket.status === status),
	}));
	const editing = tickets.find((ticket) => ticket.id === editor);

	function advanceGuide() {
		const step = guideSteps[guideStep];
		if (!step) return;
		if (guidedId === null) {
			const id = Math.max(...tickets.map((ticket) => ticket.id)) + 1;
			setGuidedId(id);
			setTickets((current) => [
				{
					id,
					title: "Order duplicated after payment retry",
					description: step.detail,
					status: step.status,
					priority: "urgent",
					assignee: "",
					area: "Checkout",
				},
				...current,
			]);
		} else {
			setTickets((current) =>
				current.map((ticket) =>
					ticket.id === guidedId
						? { ...ticket, status: step.status, assignee: "Alex Morgan" }
						: ticket,
				),
			);
		}
		setQuery("");
		setPriority("");

		setGuideStep(guideStep + 1);
		setAnnouncement(step.event);
	}

	function saveTicket(fields: Omit<DemoTicket, "id">) {
		const id =
			editing?.id ?? Math.max(...tickets.map((ticket) => ticket.id)) + 1;
		const updated = { ...fields, id };
		if (editing) {
			setTickets((current) =>
				current.map((ticket) => (ticket.id === id ? updated : ticket)),
			);
		} else {
			setTickets((current) => [updated, ...current]);
			setQuery("");
			setPriority("");
			window.location.hash = "all";
		}
		setAnnouncement(
			t("{0} {1}.", demoTicketCode(id), editing ? t("updated") : t("created")),
		);
	}

	function clearDrag() {
		setDraggedId(null);
		setDropTarget(null);
	}

	function moveTicket(status: TicketStatus) {
		const ticket = tickets.find((item) => item.id === draggedId);
		clearDrag();
		if (!ticket || ticket.status === status) return;
		setTickets((current) =>
			current.map((item) =>
				item.id === ticket.id ? { ...item, status } : item,
			),
		);
		setAnnouncement(
			t(
				"{0} moved to {1}.",
				demoTicketCode(ticket.id),
				t(demoStatuses[status]),
			),
		);
	}

	function resetDemo() {
		setTickets(sampleTickets);
		setQuery("");
		setPriority("");
		window.location.hash = "all";
		setGuideStep(0);
		setDemoReset((count) => count + 1);
		setGuidedId(null);
		setView("board");
		setAnnouncement(t("Demo reset to the original sample tickets."));
	}

	const done = tickets.filter(
		(ticket) => ticket.status === "resolved" || ticket.status === "closed",
	).length;
	return (
		<div className="demo-page">
			<aside className="demo-sidebar" aria-label={t("Demo navigation")}>
				<Link href="/" className="demo-sidebar-brand">
					<Brand showLanguage={false} />
				</Link>
				<select
					className="demo-mobile-nav"
					value={activeView}
					aria-label={t("Demo navigation")}
					onChange={(e) => {
						window.location.hash = e.target.value;
					}}
				>
					<optgroup label={t("Service queues")}>
						{Object.entries(serviceQueues).map(([key, label]) => (
							<option key={key} value={key}>
								{t(label)}
							</option>
						))}
					</optgroup>
					<optgroup label={t("Workspace tools")}>
						{Object.entries(toolViews).map(([key, label]) => (
							<option key={key} value={key}>
								{t(label)}
							</option>
						))}
					</optgroup>
				</select>
				<nav className="demo-side-nav" aria-label={t("Service queues")}>
					<h2>{t("Service queues")}</h2>
					{(Object.keys(serviceQueues) as ServiceQueue[]).map((queue) => (
						<a
							key={queue}
							href={`#${queue}`}
							aria-current={activeView === queue ? "page" : undefined}
						>
							<Icon name={queueIcons[queue]} />
							<span>{t(serviceQueues[queue])}</span>
							<small>
								{
									tickets.filter((ticket) =>
										inServiceQueue(ticket, queue, guidedId, guideStep),
									).length
								}
							</small>
						</a>
					))}
					<h2>{t("Workspace tools")}</h2>
					{(Object.keys(toolViews) as (keyof typeof toolViews)[]).map((key) => (
						<a
							key={key}
							href={`#${key}`}
							aria-current={activeView === key ? "page" : undefined}
						>
							<Icon name={key === "ai-triage" ? "spark" : "play"} />
							<span>{t(toolViews[key])}</span>
						</a>
					))}
				</nav>
				<div className="demo-side-bottom">
					<div className="demo-progress">
						<span>{t("Resolution progress")}</span>
						<strong>
							{Math.round((100 * done) / tickets.length)}
							<small>%</small>
						</strong>
						<progress
							aria-label={t("Resolution progress")}
							max={tickets.length}
							value={done}
						/>
						<small>
							{t("{0} of {1} resolved or closed", done, tickets.length)}
						</small>
					</div>
					<button type="button" onClick={resetDemo}>
						<Icon name="reset" />
						{t("Reset demo")}
					</button>
				</div>
			</aside>
			<div className="demo-content">
				<header className="demo-topbar">
					<div className="demo-crumb">
						<Icon name="layers" />
						<span>{t("Ticket workspace")}</span>
						<Icon name="chevronRight" />
						<strong>{heading}</strong>
					</div>
					<div className="demo-account">
						<LanguageSwitch />
						<Link href="/login">
							{t("Sign in")} <Icon name="arrow" />
						</Link>
					</div>
				</header>
				<main className="demo-workspace" aria-labelledby="workspace-heading">
					<header className="demo-workspace-heading">
						<div>
							<h1 id="workspace-heading">{heading}</h1>
							<p>{t("Sample data · Changes last until you reload")}</p>
						</div>
						{!toolsOpen && (
							<button
								type="button"
								className="button button-primary demo-new"
								onClick={() => setEditor("new")}
							>
								<Icon name="plus" />
								{t("New ticket")}
							</button>
						)}
					</header>
					<div hidden={activeView !== "walkthrough"}>
						<DemoGuide
							step={guideStep}
							ticketId={guidedId}
							onAdvance={advanceGuide}
						/>
					</div>
					<div hidden={activeView !== "ai-triage"}>
						<DemoTriage key={demoReset} />
					</div>
					{!toolsOpen && (
						<>
							<div className="demo-toolbar">
								<fieldset
									className="demo-view-switch"
									aria-label={t("Ticket view")}
								>
									<button
										type="button"
										aria-pressed={view === "board"}
										onClick={() => setView("board")}
									>
										<Icon name="board" /> {t("Board")}{" "}
									</button>
									<button
										type="button"
										aria-pressed={view === "table"}
										onClick={() => setView("table")}
									>
										<Icon name="table" /> {t("Table")}{" "}
									</button>
								</fieldset>
								<div className="demo-search">
									<Icon name="search" />
									<input
										aria-keyshortcuts="/"
										ref={searchField}
										type="search"
										aria-label={t("Search tickets")}
										placeholder={t("Search tickets…")}
										value={query}
										onChange={(event) => setQuery(event.target.value)}
									/>
									<kbd>/</kbd>
								</div>
								<select
									aria-label={t("Filter by priority")}
									value={priority}
									onChange={(event) => setPriority(event.target.value)}
								>
									<option value="">{t("All priorities")}</option>
									{Object.entries(demoPriorities).map(([value, label]) => (
										<option key={value} value={value}>
											{t(label)}
										</option>
									))}
								</select>
							</div>
							<div className="demo-results">
								<p>
									{matching.length}{" "}
									{matching.length === 1 ? t("ticket") : t("tickets")}
								</p>
								<p role="status">{t(announcement)}</p>
							</div>
							{matching.length === 0 ? (
								<div className="demo-empty">
									<p>{t("No tickets match your filters.")}</p>
									<button
										type="button"
										className="button button-secondary"
										onClick={() => {
											setQuery("");
											setPriority("");
											window.location.hash = "all";
										}}
									>
										{" "}
										{t("Clear filters")}{" "}
									</button>
								</div>
							) : view === "board" ? (
								<div className="demo-board">
									{stages.map(({ status, matches }) => (
										<section
											className="demo-column"
											data-stage={status}
											data-drop-target={dropTarget === status}
											key={status}
											aria-labelledby={`demo-${status}`}
											onDragOver={(event) => {
												if (draggedId === null) return;
												event.preventDefault();
												event.dataTransfer.dropEffect = "move";
												setDropTarget(status);
											}}
											onDrop={(event) => {
												if (draggedId === null) return;
												event.preventDefault();
												moveTicket(status);
											}}
										>
											<header>
												<h3 id={`demo-${status}`}>
													<span className="demo-stage-dot" />
													{t(demoStatuses[status])}
												</h3>
												<span>{matches.length}</span>
											</header>
											{matches.length === 0 ? (
												<p className="demo-column-empty">{t("No tickets")}</p>
											) : (
												matches.map((ticket) => (
													<button
														className="demo-ticket"
														type="button"
														key={ticket.id}
														draggable={ticket.id !== guidedId}
														onClick={() => setEditor(ticket.id)}
														onDragStart={(event) => {
															if (ticket.id === guidedId) return;
															event.dataTransfer.effectAllowed = "move";
															event.dataTransfer.setData(
																"text/plain",
																demoTicketCode(ticket.id),
															);
															setDraggedId(ticket.id);
														}}
														onDragEnd={clearDrag}
													>
														<span className="demo-ticket-top">
															<span className="demo-code">
																{demoTicketCode(ticket.id)}
															</span>
															<PriorityLabel priority={ticket.priority} />
														</span>
														<strong>{t(ticket.title)}</strong>
														<span className="demo-area" data-area={ticket.area}>
															{t(ticket.area)}
														</span>
														<Assignee name={ticket.assignee} />
													</button>
												))
											)}
										</section>
									))}
								</div>
							) : (
								<div className="demo-table-wrap">
									<table className="demo-table" aria-label={t("Tickets")}>
										<thead>
											<tr>
												<th scope="col">{t("Ticket")}</th>
												<th scope="col">{t("Status")}</th>
												<th scope="col">{t("Priority")}</th>
												<th scope="col">{t("Assignee")}</th>
											</tr>
										</thead>
										<tbody>
											{matching.map((ticket) => (
												<tr key={ticket.id}>
													<td>
														<button
															type="button"
															className="demo-table-ticket"
															onClick={() => setEditor(ticket.id)}
														>
															<span className="demo-code">
																{demoTicketCode(ticket.id)}
															</span>
															<strong>{t(ticket.title)}</strong>
															<span
																className="demo-area"
																data-area={ticket.area}
															>
																{t(ticket.area)}
															</span>
														</button>
													</td>
													<td data-stage={ticket.status}>
														<span className="demo-stage-dot" />
														{t(demoStatuses[ticket.status])}
													</td>
													<td>
														<PriorityLabel priority={ticket.priority} />
													</td>
													<td>
														<Assignee name={ticket.assignee} />
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							)}
						</>
					)}
					{editor !== null && (
						<TicketEditor
							ticket={editing}
							guided={typeof editor === "number" && editor === guidedId}
							onSave={saveTicket}
							onClose={() => setEditor(null)}
						/>
					)}
				</main>
			</div>
		</div>
	);
}

function TicketEditor({
	ticket,
	guided,
	onSave,
	onClose,
}: {
	ticket?: DemoTicket;
	guided: boolean;
	onSave: (fields: Omit<DemoTicket, "id">) => void;
	onClose: () => void;
}) {
	const t = useText();
	const dialog = useRef<HTMLDialogElement>(null);
	const titleField = useRef<HTMLInputElement>(null);
	const [error, setError] = useState("");
	useEffect(() => {
		if (!dialog.current?.open) {
			dialog.current?.showModal();
			titleField.current?.focus();
		}
	}, []);

	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const fields = new FormData(event.currentTarget);
		const title = String(fields.get("title")).trim();
		if (title.length < 3) {
			setError(t("Enter a title with at least 3 characters."));
			return;
		}
		const description = String(fields.get("description")).trim();
		onSave({
			title: ticket && title === t(ticket.title) ? ticket.title : title,
			description:
				ticket && description === t(ticket.description)
					? ticket.description
					: description,
			status: fields.get("status") as TicketStatus,
			priority: fields.get("priority") as DemoPriority,
			assignee: String(fields.get("assignee")),
			area: String(fields.get("area")),
		});
		dialog.current?.close();
	}

	return (
		<dialog
			className="demo-editor"
			ref={dialog}
			onClose={onClose}
			aria-labelledby="demo-editor-heading"
		>
			<header>
				<LanguageSwitch />
				<h2 id="demo-editor-heading">
					{ticket ? t("Edit {0}", demoTicketCode(ticket.id)) : t("New ticket")}
				</h2>
				<button
					type="button"
					className="button button-secondary"
					aria-label={t("Close ticket editor")}
					onClick={() => dialog.current?.close()}
				>
					×
				</button>
			</header>
			{guided ? (
				<p className="demo-guided-notice">
					{ticket && t(ticket.description)}{" "}
					{t(
						"Advance this case from the guided walkthrough to see its handoff and review history.",
					)}{" "}
				</p>
			) : (
				<form onSubmit={submit}>
					<label>
						{" "}
						{t("Title")}{" "}
						<input
							ref={titleField}
							name="title"
							required
							maxLength={120}
							defaultValue={ticket && t(ticket.title)}
						/>
					</label>
					<label>
						{" "}
						{t("Description")}{" "}
						<textarea
							name="description"
							rows={3}
							maxLength={1000}
							defaultValue={ticket && t(ticket.description)}
						/>
					</label>
					<div className="demo-editor-fields">
						<label>
							{" "}
							{t("Status")}{" "}
							<select name="status" defaultValue={ticket?.status ?? "open"}>
								{Object.entries(demoStatuses).map(([value, label]) => (
									<option key={value} value={value}>
										{t(label)}
									</option>
								))}
							</select>
						</label>
						<label>
							{" "}
							{t("Priority")}{" "}
							<select
								name="priority"
								defaultValue={ticket?.priority ?? "normal"}
							>
								{Object.entries(demoPriorities).map(([value, label]) => (
									<option key={value} value={value}>
										{t(label)}
									</option>
								))}
							</select>
						</label>
						<label>
							{" "}
							{t("Assignee")}{" "}
							<select name="assignee" defaultValue={ticket?.assignee ?? ""}>
								<option value="">{t("Unassigned")}</option>
								{demoAssignees.map((name) => (
									<option key={name}>{name}</option>
								))}
							</select>
						</label>
						<label>
							{" "}
							{t("Area")}{" "}
							<select name="area" defaultValue={ticket?.area ?? "Workspace"}>
								{demoAreas.map((area) => (
									<option key={area} value={area}>
										{t(area)}
									</option>
								))}
							</select>
						</label>
					</div>
					{error && (
						<p role="alert" className="notice error">
							{error}
						</p>
					)}
					<footer>
						<button
							type="button"
							className="button button-secondary"
							onClick={() => dialog.current?.close()}
						>
							{" "}
							{t("Cancel")}{" "}
						</button>
						<button type="submit" className="button button-primary">
							{ticket ? t("Save changes") : t("Create ticket")}
						</button>
					</footer>
				</form>
			)}
		</dialog>
	);
}
