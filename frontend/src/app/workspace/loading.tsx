import { useText } from "../../i18n/use-text";
export default function Loading() {
	const t = useText();
	return (
		<main className="workspace">
			<section className="queue-state loading-state" role="status">
				<span className="spinner" aria-hidden="true" />
				<h2>{t("กำลังโหลดคิวล่าสุด…")}</h2>
			</section>
		</main>
	);
}
