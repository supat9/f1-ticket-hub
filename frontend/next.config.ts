import type { NextConfig } from "next";

import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
	devIndicators: false,
	logging: { serverFunctions: false },
	experimental: { serverActions: { bodySizeLimit: "6mb" } },
};

export default createNextIntlPlugin()(nextConfig);
