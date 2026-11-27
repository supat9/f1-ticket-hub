"use client";
import { useText } from "../../i18n/use-text";

import { useActionState } from "react";
import type { Account } from "../session";
import {
	changeEmployeeRole,
	createEmployee,
	resetEmployeePassword,
} from "./actions";

const minPasswordLength = 6;

function Feedback({
	result,
}: {
	result: { error?: string; success?: string } | null;
}) {
	if (result?.error)
		return (
			<p className="notice error" role="alert">
				{result.error}
			</p>
		);
	if (result?.success)
		return (
			<p className="notice success" role="status">
				{result.success}
			</p>
		);
	return null;
}

export function CreateEmployeeForm() {
	const t = useText();
	const [result, action, pending] = useActionState(createEmployee, null);
	return (
		<form action={action} className="admin-create-form">
			<Feedback result={result} />
			<fieldset disabled={pending}>
				<div className="form-field">
					<label htmlFor="employee-email">{t("อีเมลที่ทำงาน")}</label>
					<input
						id="employee-email"
						name="email"
						type="email"
						maxLength={254}
						required
					/>
				</div>
				<div className="form-field">
					<label htmlFor="employee-role">{t("ทีม")}</label>
					<select id="employee-role" name="role">
						<option value="cs">{t("CS")}</option>
						<option value="dev">{t("Dev")}</option>
					</select>
				</div>
				<PasswordFields prefix="employee" />
				<button className="button button-primary" type="submit">
					{pending ? t("กำลังสร้าง…") : t("สร้างบัญชี")}
				</button>
			</fieldset>
		</form>
	);
}

function PasswordFields({
	prefix,
	reset = false,
}: {
	prefix: string;
	reset?: boolean;
}) {
	const t = useText();
	return (
		<>
			<div className="form-field">
				<label htmlFor={`${prefix}-password`}>
					{reset ? t("รหัสผ่านใหม่") : t("รหัสผ่าน")}
				</label>
				<input
					id={`${prefix}-password`}
					name="password"
					type="password"
					autoComplete="new-password"
					minLength={minPasswordLength}
					maxLength={72}
					required
				/>
				<p className="form-hint">
					{" "}
					{t("อย่างน้อย")} {minPasswordLength} {t("ตัวอักษรและไม่เกิน 72 ไบต์")}{" "}
				</p>
			</div>
			<div className="form-field">
				<label htmlFor={`${prefix}-confirmation`}>{t("ยืนยันรหัสผ่าน")}</label>
				<input
					id={`${prefix}-confirmation`}
					name="confirmation"
					type="password"
					autoComplete="new-password"
					minLength={minPasswordLength}
					maxLength={72}
					required
				/>
			</div>
		</>
	);
}

export function EmployeePasswordForm({ account }: { account: Account }) {
	const t = useText();
	const [result, action, pending] = useActionState(resetEmployeePassword, null);
	return (
		<details className="admin-password-reset">
			<summary aria-label={t("รีเซ็ตรหัสผ่านของ {0}", account.email)}>
				{" "}
				{t("รีเซ็ตรหัสผ่าน")}{" "}
			</summary>
			<form action={action}>
				<input type="hidden" name="id" value={account.id} />
				<p className="form-hint">
					{" "}
					{t("พนักงานต้องเข้าสู่ระบบใหม่ทุกอุปกรณ์")}{" "}
					{account.role === "dev" && " และออกโทเคน AI ใหม่หากเคยเชื่อมไว้"}
				</p>
				<Feedback result={result} />
				<fieldset disabled={pending}>
					<PasswordFields prefix={`reset-${account.id}`} reset />
					<button type="submit" className="button button-primary">
						{pending ? t("กำลังรีเซ็ต…") : t("บันทึกรหัสผ่านใหม่")}
					</button>
				</fieldset>
			</form>
		</details>
	);
}

export function EmployeeRoleForm({ account }: { account: Account }) {
	const t = useText();
	const [result, action, pending] = useActionState(changeEmployeeRole, null);
	return (
		<form action={action} className="admin-role-form" key={account.role}>
			<input type="hidden" name="id" value={account.id} />
			<div>
				<select
					name="role"
					aria-label={t("ทีมของ {0}", account.email)}
					defaultValue={account.role}
					disabled={pending}
				>
					<option value="cs">{t("CS")}</option>
					<option value="dev">{t("Dev")}</option>
				</select>
				<button
					className="button button-secondary"
					type="submit"
					disabled={pending}
				>
					{pending ? t("กำลังบันทึก…") : t("บันทึกทีม")}
				</button>
			</div>
			<Feedback result={result} />
		</form>
	);
}
