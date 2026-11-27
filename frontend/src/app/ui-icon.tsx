const paths = {
	search: "m20 20-4.5-4.5M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0",
	clock: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0m-9-5v5l3 2",
	alert: "M12 3 2 20h20L12 3Zm0 6v5m0 3h.01",
	spark: "m12 3 2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2L12 3Z",
	reset: "M3 5v6h6M4 10a8 8 0 1 1 1 8",
	layers: "m12 3 10 5-10 5L2 8l10-5Zm-10 9 10 5 10-5M2 16l10 5 10-5",
	play: "M6 4v16l14-8L6 4Z",
	bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12a2 2 0 0 0 4 0",
	board: "M3 4h18v16H3zM9 4v16m6-16v16",
	arrow: "M5 12h14m-6-6 6 6-6 6",
	check: "m5 12 4 4L19 6",
	calendar: "M4 6h16v15H4zM4 10h16M8 3v5m8-5v5",
	chevronDown: "m6 9 6 6 6-6",
	chevronLeft: "m15 6-6 6 6 6",
	chevronRight: "m9 6 6 6-6 6",
	download: "M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4",
	clipboard:
		"M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3M9 4V2h6v4H9V4Zm-1 7h8m-8 5h5",
	inbox:
		"M4 4h16l2 10v5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-5L4 4Zm-2 10h6l2 3h4l2-3h6",
	image: "M3 4h18v16H3zM3 17l5-5 4 4 3-3 6 6M16 8h.01",
	lock: "M7 11V7a5 5 0 0 1 10 0v4m-11 0h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2Zm6 4v2",
	logout: "M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5m3-12 4 4-4 4m-4-4h12",
	plus: "M12 5v14M5 12h14",
	table: "M3 4h18v16H3zM3 9h18M3 14h18M10 9v11",
} as const;

export function Icon({ name }: { name: keyof typeof paths }) {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 24 24"
			width="20"
			height="20"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.7"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d={paths[name]} />
		</svg>
	);
}
