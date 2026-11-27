import { defineConfig } from "@playwright/test";

const database = process.env.F1_E2E_DATABASE_URL;
if (!database || !process.env.F1_E2E_PASSWORD) {
	throw new Error("Start the isolated lifecycle test with npm run test:e2e.");
}
const apiAddress = "127.0.0.1:18081";
const apiURL = `http://${apiAddress}`;
const webURL = "http://127.0.0.1:13001";

export default defineConfig({
	testDir: "./e2e",
	workers: 1,
	timeout: 60_000,
	use: { baseURL: webURL, trace: "retain-on-failure" },
	webServer: [
		{
			command: "go run ./cmd/api",
			cwd: "../backend",
			env: {
				DATABASE_URL: database,
				API_ADDR: apiAddress,
				LINE_CHANNEL_SECRET: "",
				LINE_CHANNEL_ACCESS_TOKEN: "",
				LINE_OFFICIAL_ACCOUNT_ID: "",
			},
			url: `${apiURL}/healthz`,
			timeout: 120_000,
			reuseExistingServer: false,
		},
		{
			command:
				"node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 13001",
			env: { F1_BACKEND_URL: apiURL, SESSION_COOKIE_SECURE: "false" },
			url: `${webURL}/login`,
			timeout: 60_000,
			reuseExistingServer: false,
		},
	],
	metadata: { apiURL },
});
