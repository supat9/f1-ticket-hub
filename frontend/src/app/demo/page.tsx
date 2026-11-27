import { getText } from "../../i18n/server";

import type { Metadata } from "next";
import { DemoWorkspace } from "./workspace";
import "./demo.css";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getText();
	return {
		title: t("F1 Ticket Hub — Interactive Demo"),
		description: t(
			"Try a support-to-engineering ticket workflow with fictional data, a Kanban board, and a searchable queue.",
		),
	};
}

export default function DemoPage() {
	return <DemoWorkspace />;
}
