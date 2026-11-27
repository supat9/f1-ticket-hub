"use client";
import { useText } from "../../i18n/use-text";

import { useActionState, useState } from "react";
import { signIn } from "../auth-actions";

export function LoginForm({ returnCode }: { returnCode?: string }) {
	const t = useText();
	const [error, action, pending] = useActionState(signIn, null);
	const [email, setEmail] = useState("");
	const [visible, setVisible] = useState(false);

	return (
		<form action={action} className="login-form">
			{returnCode && (
				<input type="hidden" name="returnCode" value={returnCode} />
			)}
			{error && (
				<div className="notice error" role="alert">
					<span className="alert-mark" aria-hidden="true">
						!
					</span>
					<div>
						<strong>{error}</strong>
						<p className="muted">
							{" "}
							{t("ตรวจสอบอีเมลและรหัสผ่านอีกครั้ง หากลืมรหัสผ่านติดต่อผู้ดูแลระบบ")}{" "}
						</p>
					</div>
				</div>
			)}
			<fieldset disabled={pending}>
				<div className="form-field">
					<label htmlFor="login-email">{t("อีเมลที่ทำงาน")}</label>
					<input
						id="login-email"
						name="email"
						type="email"
						placeholder="name@example.com"
						autoComplete="username"
						maxLength={254}
						value={email}
						onChange={(event) => setEmail(event.target.value)}
						required
					/>
				</div>
				<div className="form-field">
					<label htmlFor="login-password">{t("รหัสผ่าน")}</label>
					<div className="password-field">
						<input
							id="login-password"
							name="password"
							type={visible ? "text" : "password"}
							autoComplete="current-password"
							maxLength={72}
							required
						/>
						<button
							type="button"
							className="password-toggle"
							aria-label={visible ? t("ซ่อนรหัสผ่าน") : t("แสดงรหัสผ่าน")}
							aria-controls="login-password"
							onClick={() => setVisible(!visible)}
						>
							{visible ? t("ซ่อน") : t("แสดง")}
						</button>
					</div>
				</div>
				<button type="submit" className="button button-primary login-submit">
					{pending && <span className="spinner" aria-hidden="true" />}
					{pending ? t("กำลังเข้าสู่ระบบ…") : t("เข้าสู่ระบบ")}
				</button>
			</fieldset>
		</form>
	);
}
