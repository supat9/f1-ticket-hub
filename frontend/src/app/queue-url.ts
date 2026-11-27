export function queueHref(query: Record<string, string>) {
	return `/workspace?${new URLSearchParams(query)}`;
}
