import messages from "./messages.json";
export type Language = "th" | "en";
export function translator(locale: string) {
	const entries: Record<string, string> =
		locale === "en" ? messages.en : messages.th;
	return (source: string, ...values: (string | number)[]) => {
		const message = Object.hasOwn(entries, source) ? entries[source] : source;
		return values.length
			? message.replace(/\{(\d+)\}/g, (_, index) =>
					String(values[Number(index)]),
				)
			: message;
	};
}
