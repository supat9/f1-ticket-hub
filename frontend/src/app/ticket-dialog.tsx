"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef } from "react";

export function TicketDialog({
	children,
	closeHref,
	labelId,
	drawer = false,
	initialFocusId = "ticket-title",
	returnFocusId,
}: {
	children: ReactNode;
	closeHref: string;
	labelId: string;
	drawer?: boolean;
	initialFocusId?: string;
	returnFocusId?: string;
}) {
	const ref = useRef<HTMLDialogElement>(null);
	const router = useRouter();

	useEffect(() => {
		const dialog = ref.current;
		if (!dialog) return;
		const opener = document.activeElement;
		dialog.showModal();
		dialog.querySelector<HTMLElement>(`#${initialFocusId}`)?.focus();
		return () => {
			dialog.close();
			window.requestAnimationFrame(() => {
				if (document.querySelector("dialog[open]")) return;
				const target =
					opener instanceof HTMLElement &&
					opener !== document.body &&
					opener.isConnected
						? opener
						: returnFocusId
							? document.getElementById(returnFocusId)
							: null;
				target?.focus({ preventScroll: true });
			});
		};
	}, [initialFocusId, returnFocusId]);

	return (
		<dialog
			ref={ref}
			className={`ticket-dialog ${drawer ? "drawer" : "create-dialog"}`}
			aria-labelledby={labelId}
			onCancel={(event) => {
				event.preventDefault();
				if (event.currentTarget.querySelector('form[aria-busy="true"]')) return;
				router.replace(closeHref, { scroll: false });
			}}
			onClickCapture={(event) => {
				if (
					event.target instanceof Element &&
					event.target.closest(".dialog-close") &&
					event.currentTarget.querySelector('form[aria-busy="true"]')
				) {
					event.preventDefault();
				}
			}}
		>
			{children}
		</dialog>
	);
}
