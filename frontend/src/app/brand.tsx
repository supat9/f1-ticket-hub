import { LanguageSwitch } from "./language-switch";
import Image from "next/image";
import logo from "./icon.png";

export function Brand({
	showLanguage = true,
}: {
	showLanguage?: boolean;
} = {}) {
	return (
		<div className="brand">
			<span className="brand-mark">
				<Image
					className="brand-logo"
					src={logo}
					alt=""
					loading="eager"
					unoptimized
				/>
			</span>
			<span className="brand-name">F1 Ticket Hub</span>
			{showLanguage && <LanguageSwitch />}
		</div>
	);
}
