"use client";
import { useText } from "../i18n/use-text";

import { useActionState } from "react";
import type { StaffMember, WorkflowView } from "./tickets";
import { saveWorkflow } from "./workflow-actions";

export function WorkflowForm({
	kind,
	ticketId,
	version,
	defaults,
	staff = [],
	assigneeId,
	noteRequestId,
}: {
	kind: "handoff" | "start" | "submit" | "review" | "note";
	ticketId: string;
	version?: number;
	defaults?: WorkflowView;
	staff?: StaffMember[];
	assigneeId?: string | null;
	noteRequestId?: string;
}) {
	const t = useText();
	const [state, action, pending] = useActionState(saveWorkflow, null);
	const canSend =
		kind !== "handoff" || staff.some((member) => member.role === "dev");
	const fields = state?.fields;
	return (
		<form action={action} className="workflow-form">
			<input name="ticketId" value={ticketId} type="hidden" />
			<input name="version" value={version ?? 0} type="hidden" />
			{noteRequestId && (
				<input name="noteRequestId" value={noteRequestId} type="hidden" />
			)}
			<fieldset disabled={pending || !canSend}>
				{kind === "handoff" && (
					<>
						<label>
							{" "}
							{t("ผู้รับงาน Dev")}{" "}
							<select
								name="assigneeId"
								required
								defaultValue={fields?.assigneeId ?? assigneeId ?? ""}
							>
								<option value="">{t("เลือกบัญชี Dev")}</option>
								{staff
									.filter((member) => member.role === "dev")
									.map((member) => (
										<option key={member.id} value={member.id}>
											{member.email}
										</option>
									))}
							</select>
						</label>
						<label>
							{" "}
							{t("วิธีทำซ้ำ")}{" "}
							<textarea
								name="steps"
								required
								maxLength={2000}
								rows={3}
								defaultValue={fields?.steps ?? defaults?.steps}
							/>
						</label>
						<label>
							{" "}
							{t("ผลกระทบ")}{" "}
							<textarea
								name="impact"
								required
								maxLength={1200}
								rows={2}
								defaultValue={fields?.impact ?? defaults?.impact}
							/>
						</label>
					</>
				)}
				{kind === "submit" && (
					<>
						<label>
							{" "}
							{t("ผลการแก้ไขหรือหลักฐานทดสอบ")}{" "}
							<textarea
								name="resolution"
								required
								maxLength={2000}
								rows={3}
								defaultValue={fields?.resolution ?? defaults?.resolution}
							/>
						</label>
						<label>
							{" "}
							{t("ลิงก์ Pull request (ถ้ามี)")}{" "}
							<input
								name="pullRequestUrl"
								type="url"
								maxLength={500}
								placeholder="https://…"
								defaultValue={
									fields?.pullRequestUrl ?? defaults?.pullRequestUrl
								}
							/>
						</label>
					</>
				)}
				{kind === "review" && (
					<label>
						{" "}
						{t("ผลการตรวจรับ")}{" "}
						<textarea
							name="reviewNote"
							required
							maxLength={2000}
							rows={3}
							defaultValue={fields?.reviewNote}
						/>
					</label>
				)}
				{kind === "note" && (
					<label>
						{" "}
						{t("บันทึกภายใน")}{" "}
						<textarea
							name="note"
							required
							maxLength={2000}
							rows={2}
							defaultValue={fields?.note}
						/>
					</label>
				)}
				<div className="workflow-buttons">
					<button
						className="button button-primary"
						name="action"
						value={kind === "review" ? "close" : kind}
						type="submit"
					>
						{kind === "handoff"
							? t("ส่งงานให้ Dev")
							: kind === "start"
								? t("เริ่มงาน")
								: kind === "submit"
									? t("ส่งให้ Support ตรวจรับ")
									: kind === "review"
										? t("ตรวจผ่านและปิดเคส")
										: t("เพิ่มบันทึก")}
					</button>
					{kind === "review" && (
						<button
							className="button button-secondary"
							name="action"
							value="return"
							type="submit"
						>
							{" "}
							{t("ส่งกลับให้แก้ไข")}{" "}
						</button>
					)}
				</div>
			</fieldset>
			{!canSend && (
				<p className="muted">{t("เพิ่มบัญชีทีม Dev ในหน้า Admin ก่อนส่งงาน")}</p>
			)}
			{state && (
				<p
					role={state.error ? "alert" : "status"}
					className={state.error ? "notice error" : "muted"}
				>
					{state.message}
				</p>
			)}
		</form>
	);
}
