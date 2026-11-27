export function isTicketCode(value: unknown): value is string {
	return typeof value === "string" && /^F1-\d{6,19}$/.test(value);
}

export const sources = {
	customer: "เรื่องที่ CS รับจากลูกค้า",
	internal: "เรื่องภายในองค์กร",
} as const;
export const priorities = {
	urgent: "Critical",
	high: "High",
	normal: "Med",
	low: "Low",
} as const;
export const products = {
	customer_portal: "Customer Portal",
	checkout: "Checkout",
} as const;
export const maxTicketImageBytes = 5 * 1024 * 1024;
export const categories = {
	sd: "SD",
	bug: "Bug",
	adjustment: "Adjustment",
	question: "Question",
	data: "Data",
	customize: "Customize",
} as const;
export type TicketMetadata = {
	customerName: string;
	product: string;
	category: string;
	notes: string;
};
export const statuses = {
	open: "เปิดใหม่",
	in_progress: "กำลังดำเนินการ",
	resolved: "แก้ไขแล้ว",
	closed: "ปิดแล้ว",
} as const;

export type TicketStatus = keyof typeof statuses;
export type QueueView = "table" | "kanban";
export const statusOrder = Object.keys(statuses) as TicketStatus[];
export const queueFilters = {
	all: "ทั้งหมด",
	mine: "ฉันรับผิดชอบ",
	assigned: "มอบหมายให้ฉัน",
	unassigned: "ยังไม่มอบหมาย",
	triage: "รอคัดกรอง",
	review: "รอตรวจรับ",
	due_soon: "ใกล้ครบกำหนด",
	overdue: "เกินกำหนด",
} as const;
export type QueueFilter = keyof typeof queueFilters;
export type QueueSummary = Record<QueueFilter | "open", number>;

export type Ticket = {
	id: string;
	code: string;
	title: string;
	description: string;
	source: keyof typeof sources;
	priority: keyof typeof priorities;
	status: TicketStatus;
	createdAt: string;
	completedAt: string | null;
	dueAt: string;
	guidedWorkflow: boolean;
	ownerId: string | null;
	assigneeId: string | null;
	assigneeName: string;
	assignmentVersion: number;
	customerName: string;
	product: keyof typeof products | "";
	category: keyof typeof categories | "";
	notes: string;
	detailsVersion: number;
};

export type StaffMember = {
	id: string;
	email: string;
	role: "admin" | "cs" | "dev";
};

export type TicketActivity = {
	id: string;
	actor: string;
	kind:
		| "created"
		| "status"
		| "assigned"
		| "details"
		| "note"
		| "handoff"
		| "submit"
		| "close"
		| "return"
		| "automation";
	previousStatus: TicketStatus | "";
	status: TicketStatus | "";
	detail: string;
	createdAt: string;
};

export type WorkflowView = {
	steps: string;
	impact: string;
	resolution: string;
	pullRequestUrl: string;
	reviewNote: string;
	version: number;
	activity: TicketActivity[];
	nextBefore: string | null;
};
export type StaffSelection = {
	ownerId: string;
	assigneeId: string;
	assigneeName: string;
};

export type TicketPage = {
	tickets: Ticket[];
	page: number;
	pageSize: number;
	total: number;
};

export type TicketBoardPage = {
	columns: {
		status: TicketStatus;
		total: number;
		tickets: Ticket[];
		nextCursor: string | null;
	}[];
};

export type TicketFormState = {
	saved?: { id: string; code: string; uploadedImages: number };
	attempt: number;
	error?: string;
	fields?: StaffSelection &
		TicketMetadata & {
			title: string;
			description: string;
			source: string;
			priority: string;
		};
};

export type AssignmentState = {
	attempt: number;
	error?: string;
	saved?: boolean;
	conflict?: boolean;
	fields?: StaffSelection & { status: TicketStatus };
};
