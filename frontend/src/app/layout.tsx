import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@fontsource/sarabun/400.css";
import "@fontsource/sarabun/500.css";
import "@fontsource/sarabun/600.css";
import "@fontsource/sarabun/700.css";
import "@fontsource/ibm-plex-mono/latin-600.css";
import "./globals.css";

export const metadata: Metadata = {
	title: "F1 Ticket Hub",
	description: "A ticket workspace for support and engineering teams.",
};

import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";

export default async function RootLayout({
	children,
}: {
	children: ReactNode;
}) {
	return (
		<html lang={await getLocale()}>
			<body>
				<NextIntlClientProvider>{children}</NextIntlClientProvider>
			</body>
		</html>
	);
}
