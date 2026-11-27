import type { priorities, TicketStatus } from "../tickets";

export type DemoPriority = keyof typeof priorities;

export const demoStatuses: Record<TicketStatus, string> = {
	open: "Open",
	in_progress: "In progress",
	resolved: "Resolved",
	closed: "Closed",
};

export const demoPriorities: Record<DemoPriority, string> = {
	urgent: "Urgent",
	high: "High",
	normal: "Normal",
	low: "Low",
};

export const demoAssignees = [
	"Maya Chen",
	"Alex Morgan",
	"Noah Patel",
] as const;

export type DemoTicket = {
	id: number;
	title: string;
	description: string;
	status: TicketStatus;
	priority: DemoPriority;
	assignee: string;
	area: string;
};

export const demoAreas = ["Customer Portal", "Checkout", "Workspace"];

export const sampleTickets: DemoTicket[] = [
	{
		id: 108,
		title: "Checkout retries create duplicate orders",
		description:
			"A retried payment can create a second order after a timeout. Reproduce with the test gateway and confirm only one order is created.",
		status: "open",
		priority: "urgent",
		assignee: "",
		area: "Checkout",
	},
	{
		id: 107,
		title: "Password reset emails arrive late",
		description:
			"Trial users report waiting several minutes for reset emails. Compare the mail queue timestamps with the request logs.",
		status: "open",
		priority: "high",
		assignee: "Maya Chen",
		area: "Customer Portal",
	},
	{
		id: 106,
		title: "Add keyboard shortcuts to the queue",
		description:
			"Document shortcuts for searching and opening a new ticket. Make sure they do not fire while a user is typing.",
		status: "open",
		priority: "low",
		assignee: "",
		area: "Workspace",
	},
	{
		id: 105,
		title: "Keep date filters after refreshing",
		description:
			"Keep the applied date range in the URL so a linked view opens with the same filters.",
		status: "in_progress",
		priority: "normal",
		assignee: "Alex Morgan",
		area: "Workspace",
	},
	{
		id: 104,
		title: "Show clearer payment failure messages",
		description:
			"Make a declined card and an interrupted connection easy to distinguish, with an appropriate next action for each.",
		status: "in_progress",
		priority: "high",
		assignee: "Noah Patel",
		area: "Checkout",
	},
	{
		id: 103,
		title: "Fix missing rows in CSV export",
		description:
			"Verify the export includes all matching tickets even when the queue displays only the first page.",
		status: "resolved",
		priority: "normal",
		assignee: "Alex Morgan",
		area: "Workspace",
	},
	{
		id: 102,
		title: "Label form fields for screen readers",
		description:
			"Associate the form labels and inline validation errors with their inputs and review keyboard navigation.",
		status: "resolved",
		priority: "low",
		assignee: "Maya Chen",
		area: "Customer Portal",
	},
	{
		id: 101,
		title: "Restore invoice download links",
		description:
			"Fixed the download route and confirmed a customer can only retrieve their own invoices.",
		status: "closed",
		priority: "normal",
		assignee: "Noah Patel",
		area: "Customer Portal",
	},
];

export function demoTicketCode(id: number) {
	return `F1-${String(id).padStart(6, "0")}`;
}
