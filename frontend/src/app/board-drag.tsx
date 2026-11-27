"use client";
import { useText } from "../i18n/use-text";

import {
	type DragEvent,
	type ReactNode,
	useRef,
	useState,
	useTransition,
} from "react";
import { saveTicketStatus } from "./ticket-actions";
import { statusOrder, type TicketStatus } from "./tickets";

export function BoardDrag({ children }: { children: ReactNode }) {
	const t = useText();
	const dragged = useRef<{ id: string; status: TicketStatus } | null>(null);
	const controlPressed = useRef(false);
	const [over, setOver] = useState<TicketStatus | null>(null);
	const [feedback, setFeedback] = useState<{
		message: string;
		error: boolean;
	} | null>(null);
	const [pending, startTransition] = useTransition();

	function targetStage(event: DragEvent<HTMLElement>) {
		const column = (event.target as HTMLElement).closest<HTMLElement>(
			"[data-stage]",
		);
		return statusOrder.find((stage) => stage === column?.dataset.stage);
	}

	return (
		<>
			{pending && (
				<p className="form-hint" role="status">
					{" "}
					{t("กำลังย้ายสถานะ…")}{" "}
				</p>
			)}
			{feedback && (
				<p
					className={`notice ${feedback.error ? "error" : "success"}`}
					role={feedback.error ? "alert" : "status"}
				>
					{feedback.message}
				</p>
			)}
			<section
				className="board-scroll"
				aria-label={t("บอร์ด Kanban")}
				aria-busy={pending || undefined}
				data-over={over ?? undefined}
				onPointerDownCapture={(event) => {
					controlPressed.current =
						event.target instanceof Element &&
						event.target.closest("input, select, button, textarea") !== null;
				}}
				onDragStart={(event) => {
					const id =
						event.target instanceof HTMLElement
							? event.target.dataset.dragTicket
							: undefined;
					const status = targetStage(event);
					if (!id || !status || pending || controlPressed.current) {
						event.preventDefault();
						return;
					}
					dragged.current = { id, status };
					event.currentTarget.dataset.dragging = "";
					event.dataTransfer.setData("text/plain", id);
					event.dataTransfer.effectAllowed = "move";
				}}
				onDragOver={(event) => {
					const target = targetStage(event);
					if (dragged.current && target && target !== dragged.current.status) {
						event.preventDefault();
						event.dataTransfer.dropEffect = "move";
						setOver(target);
					} else setOver(null);
				}}
				onDragEnd={(event) => {
					dragged.current = null;
					delete event.currentTarget.dataset.dragging;
					setOver(null);
				}}
				onDrop={(event) => {
					const ticket = dragged.current;
					const target = targetStage(event);
					if (!ticket || !target || ticket.status === target) return;
					event.preventDefault();
					dragged.current = null;
					delete event.currentTarget.dataset.dragging;
					setOver(null);
					setFeedback(null);
					const form = new FormData();
					form.set("ticketId", ticket.id);
					form.set("expectedStatus", ticket.status);
					form.set("status", target);
					startTransition(async () =>
						setFeedback(await saveTicketStatus(null, form)),
					);
				}}
			>
				{children}
			</section>
		</>
	);
}
