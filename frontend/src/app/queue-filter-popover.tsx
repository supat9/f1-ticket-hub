"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Icon } from "./ui-icon";

export function QueueFilterPopover({
	label,
	value,
	selected,
	calendar = false,
	onClose,
	children,
}: {
	label: string;
	value: ReactNode;
	selected: boolean;
	calendar?: boolean;
	onClose?: () => void;
	children: (close: () => void) => ReactNode;
}) {
	const panelId = useId();
	const labelId = useId();
	const trigger = useRef<HTMLButtonElement>(null);
	const popup = useRef<HTMLDivElement>(null);
	const [expanded, setExpanded] = useState(false);

	function close() {
		popup.current?.hidePopover();
		trigger.current?.focus({ preventScroll: true });
	}

	useEffect(() => {
		const panel = popup.current;
		const button = trigger.current;
		if (!panel || !button) return;
		function position() {
			if (!panel?.matches(":popover-open") || !button) return;
			const anchor = button.getBoundingClientRect();
			const gap = 8;
			const spaceBelow = window.innerHeight - anchor.bottom - gap - 12;
			const spaceAbove = anchor.top - gap - 12;
			panel.style.minWidth = calendar ? "" : `${Math.ceil(anchor.width)}px`;
			const above = spaceBelow < panel.scrollHeight && spaceAbove > spaceBelow;
			panel.style.maxHeight = `${Math.max(0, above ? spaceAbove : spaceBelow)}px`;
			panel.style.left = `${Math.max(12, Math.min(anchor.left, window.innerWidth - panel.offsetWidth - 12))}px`;
			panel.style.top = `${above ? anchor.top - gap - panel.offsetHeight : anchor.bottom + gap}px`;
		}
		function open(event: Event) {
			if (!(event instanceof ToggleEvent) || event.newState !== "open") return;
			position();
			panel
				?.querySelector<HTMLElement>("[data-initial-focus]")
				?.focus({ preventScroll: true });
		}
		panel.addEventListener("toggle", open);
		window.addEventListener("resize", position);
		window.addEventListener("scroll", position);
		return () => {
			panel.removeEventListener("toggle", open);
			window.removeEventListener("resize", position);
			window.removeEventListener("scroll", position);
		};
	}, [calendar]);

	return (
		<div className="queue-criterion">
			<span id={labelId} className="queue-criterion-label">
				{label}
			</span>
			<button
				type="button"
				ref={trigger}
				className="queue-filter-trigger"
				data-selected={selected}
				popoverTarget={panelId}
				aria-expanded={expanded}
				aria-labelledby={`${labelId} ${panelId}-value`}
				aria-haspopup="dialog"
			>
				{calendar && <Icon name="calendar" />}
				<span id={`${panelId}-value`}>{value}</span>
				<Icon name="chevronDown" />
			</button>
			<div
				ref={popup}
				id={panelId}
				popover="auto"
				role="dialog"
				aria-labelledby={labelId}
				className={`queue-filter-popup ${calendar ? "queue-calendar-popup" : "queue-options-popup"}`}
				onToggle={(event) => {
					setExpanded(event.newState === "open");
					if (event.newState === "closed") onClose?.();
				}}
			>
				{children(close)}
			</div>
		</div>
	);
}

export function QueueDropdown({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: string;
	options: { value: string; label: string; indicator?: ReactNode }[];
	onChange: (value: string) => void;
}) {
	const selected =
		options.find((option) => option.value === value) ?? options[0];
	return (
		<QueueFilterPopover
			label={label}
			selected={Boolean(value)}
			value={selected.label}
		>
			{(close) => (
				<div className="queue-filter-options">
					{options.map((option, index) => (
						<button
							type="button"
							key={option.value}
							aria-pressed={option.value === selected.value}
							data-initial-focus={
								option.value === selected.value ? "" : undefined
							}
							onKeyDown={(event) => {
								const positions: Record<string, number> = {
									ArrowDown: (index + 1) % options.length,
									ArrowUp: (index + options.length - 1) % options.length,
									Home: 0,
									End: options.length - 1,
								};
								const next = positions[event.key];
								if (next === undefined) return;
								event.preventDefault();
								event.currentTarget.parentElement
									?.querySelectorAll("button")
									[next]?.focus();
							}}
							onClick={() => {
								close();
								if (option.value !== value) onChange(option.value);
							}}
						>
							{option.indicator ?? option.label}
							{option.value === selected.value && <Icon name="check" />}
						</button>
					))}
				</div>
			)}
		</QueueFilterPopover>
	);
}
