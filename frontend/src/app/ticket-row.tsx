"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

export function TicketRow({
	href,
	children,
}: {
	href: string;
	children: ReactNode;
}) {
	const router = useRouter();

	return (
		<tr
			onClick={(event) => {
				if (
					event.defaultPrevented ||
					event.metaKey ||
					event.ctrlKey ||
					event.shiftKey ||
					event.altKey ||
					!(event.target instanceof Element) ||
					event.target.closest("a, button, input, select, textarea, label") ||
					window.getSelection()?.isCollapsed === false
				) {
					return;
				}

				router.push(href, { scroll: false });
			}}
		>
			{children}
		</tr>
	);
}
