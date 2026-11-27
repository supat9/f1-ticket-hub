"use client";
import { useText } from "../i18n/use-text";

import { useState } from "react";
import { StaffIdentity } from "./ticket-badges";
import type { StaffMember, StaffSelection } from "./tickets";

export function StaffFields({
	prefix,
	staff,
	ownerId,
	assigneeId,
	assigneeName,
	creating = false,
}: StaffSelection & {
	prefix: string;
	staff: StaffMember[];
	creating?: boolean;
}) {
	const t = useText();
	const [account, setAccount] = useState(assigneeId);
	const [name, setName] = useState(assigneeName);
	const [mode, setMode] = useState<"name" | "account">(
		assigneeId ? "account" : "name",
	);
	const assigneeField = `${prefix}-assignee`;
	return (
		<div className="staff-fields">
			{staff.length ? (
				<StaffPicker
					id={`${prefix}-owner`}
					name="ownerId"
					label={t("ผู้แจ้ง / ผู้รับผิดชอบ")}
					roleHint={t("เจ้าของเรื่อง")}
					value={ownerId}
					staff={staff}
					help={
						creating
							? t("ค่าเริ่มต้นคือคุณในฐานะผู้แจ้ง เปลี่ยนได้หากเจ้าของเรื่องเป็นคนอื่น")
							: undefined
					}
				/>
			) : (
				<input type="hidden" name="ownerId" value={ownerId} />
			)}
			<fieldset className="form-field assignee-field">
				<legend>{t("ผู้ได้รับมอบหมาย")}</legend>
				<div className="choice-grid assignee-modes">
					<label className="choice">
						<input
							type="radio"
							name={`${assigneeField}-mode`}
							value="name"
							checked={mode === "name"}
							onChange={() => setMode("name")}
						/>
						<span className="choice-ring" aria-hidden="true" /> {t(
							"พิมพ์ชื่อ",
						)}{" "}
					</label>
					<label className="choice">
						<input
							type="radio"
							name={`${assigneeField}-mode`}
							value="account"
							checked={mode === "account"}
							onChange={() => setMode("account")}
						/>
						<span className="choice-ring" aria-hidden="true" />{" "}
						{t("เลือกบัญชี F1")}{" "}
					</label>
				</div>
				{mode === "name" ? (
					<input
						id={`${assigneeField}-name`}
						name="assigneeName"
						aria-label={t("ชื่อผู้ได้รับมอบหมาย")}
						aria-describedby={`${assigneeField}-help`}
						placeholder={t("พิมพ์ชื่อผู้ได้รับมอบหมาย")}
						maxLength={120}
						value={name}
						onChange={(event) => setName(event.target.value)}
					/>
				) : (
					<select
						id={assigneeField}
						name="assigneeId"
						value={account}
						aria-label={t("บัญชี F1 ของผู้ได้รับมอบหมาย")}
						aria-describedby={`${assigneeField}-help`}
						onChange={(event) => setAccount(event.target.value)}
					>
						<option value="">{t("เลือกบัญชี F1 (ไม่บังคับ)")}</option>
						{assigneeId &&
							!staff.some((member) => member.id === assigneeId) && (
								<option value={assigneeId}>{t("บัญชีที่ได้รับมอบหมายอยู่")}</option>
							)}
						{staff.map((member) => (
							<option key={member.id} value={member.id}>
								{member.email}
							</option>
						))}
					</select>
				)}
				<p className="form-hint" id={`${assigneeField}-help`}>
					{mode === "name"
						? t("ชื่อจะแสดงในเคสโดยไม่ส่งแจ้งเตือน")
						: t("บัญชีที่เลือกจะได้รับแจ้งเตือนใน F1")}
				</p>
			</fieldset>
		</div>
	);
}

function StaffPicker({
	id,
	name,
	label,
	roleHint,
	value,
	staff,
	help,
}: {
	id: string;
	name: "ownerId";
	label: string;
	roleHint: string;
	value: string;
	staff: StaffMember[];
	help?: string;
}) {
	const t = useText();
	const [selected, setSelected] = useState(value);
	const person = staff.find((member) => member.id === selected);
	const isOwner = name === "ownerId";
	const emptyLabel = isOwner ? t("ยังไม่ระบุเจ้าของ") : t("ยังไม่มอบหมาย");

	return (
		<div className="form-field">
			<div className="field-label">
				<label htmlFor={id}>{label}</label>
				<span>{roleHint}</span>
			</div>
			<div className="staff-picker">
				<span className="staff-picker-display" aria-hidden="true">
					{person ? (
						<StaffIdentity email={person.email} />
					) : (
						<>
							<span className="avatar empty-avatar" />
							<span>{emptyLabel}</span>
						</>
					)}
					<span className="staff-picker-change">{t("เปลี่ยน")}</span>
				</span>
				<select
					id={id}
					name={name}
					value={selected}
					aria-describedby={help ? `${id}-help` : undefined}
					onChange={(event) => setSelected(event.target.value)}
				>
					<option value="" disabled={isOwner}>
						{emptyLabel}
					</option>
					{staff.map((member) => (
						<option key={member.id} value={member.id}>
							{member.email}
						</option>
					))}
				</select>
			</div>
			{help && (
				<p className="form-hint" id={`${id}-help`}>
					{help}
				</p>
			)}
		</div>
	);
}
