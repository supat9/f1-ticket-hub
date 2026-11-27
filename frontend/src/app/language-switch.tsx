"use client";
import { useLocale } from "next-intl";
import { changeLanguage } from "./language-action";
import { useTransition } from "react";
import type { Language } from "../i18n/text";
export function LanguageSwitch() {
	const locale = useLocale();

	const [pending, start] = useTransition();
	function change(language: Language) {
		start(async () => {
			await changeLanguage(language);
		});
	}
	return (
		<fieldset
			aria-label={locale === "th" ? "ภาษา" : "Language"}
			className="language-switch"
		>
			{(["th", "en"] as const).map((language) => (
				<button
					key={language}
					type="button"
					lang={language}
					disabled={pending}
					aria-pressed={language === locale}
					onClick={() => change(language)}
				>
					{language === "th" ? "ไทย" : "English"}
				</button>
			))}
		</fieldset>
	);
}
