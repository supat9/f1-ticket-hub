import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";

test("Support closes a handoff with exactly one copy of the developer's retried MCP note", async ({
	page,
	request,
}, testInfo) => {
	const api = testInfo.config.metadata.apiURL;
	const password = process.env.F1_E2E_PASSWORD;
	if (!password) throw new Error("Missing disposable E2E credentials");
	const developer = "developer@example.test";
	const title = "Checkout retry creates two orders";
	const note = "Retried the timed-out payment. Exactly one order was created.";
	const resolution = "Both payment attempts now return the original order.";
	const review = "Support repeated the retry and verified one order.";
	const dialog = page.getByRole("dialog");
	const timeline = dialog.locator(".workflow-timeline");

	await test.step("Support signs in, creates the ticket and assigns the handoff", async () => {
		await page.goto("/login");
		await page.locator('[name="email"]').fill("support@example.test");
		await page.locator('[name="password"]').fill(password);
		await page.locator('button[type="submit"]').click();
		await expect(page).toHaveURL(/\/workspace/);
		await page.locator('a[href*="new=1"]').first().click();
		await dialog.locator('[name="title"]').fill(title);
		await dialog
			.locator('[name="description"]')
			.fill("A customer retried after a timeout and saw two orders.");
		await dialog.locator('[name="product"]').selectOption("checkout");
		await dialog.locator('[name="category"]').selectOption("bug");
		await dialog.locator('button[type="submit"]').click();
		await page.getByRole("link", { name: "เปิดดูเคส", exact: true }).click();
		await expect(dialog.getByRole("heading", { name: title })).toBeVisible();

		await dialog.getByText("คัดกรองและส่งงานให้ Dev", { exact: true }).click();
		await dialog
			.locator('.workflow-handoff select[name="assigneeId"]')
			.selectOption({ label: developer });
		await dialog
			.locator('[name="steps"]')
			.fill("Time out the first payment and retry it.");
		await dialog
			.locator('[name="impact"]')
			.fill("Two orders appear for one payment.");
		await dialog
			.getByRole("button", { name: "ส่งงานให้ Dev", exact: true })
			.click();
		await expect(
			timeline.getByText("ส่งงานให้ Dev", { exact: true }),
		).toBeVisible();
	});

	const code = (await dialog.locator(".ticket-code").textContent())?.trim();
	expect(code).toMatch(/^F1-\d{6,}$/);
	await test.step("The developer authenticates and submits evidence through MCP", async () => {
		const login = await request.post(`${api}/api/auth/login`, {
			data: { email: developer, password },
		});
		expect(login.status()).toBe(200);
		const session = (await login.json()).token;
		const issued = await request.post(`${api}/api/auth/dev-token`, {
			headers: { Authorization: `Bearer ${session}` },
		});
		expect(issued.status()).toBe(201);
		const headers = {
			Authorization: `Bearer ${(await issued.json()).token}`,
			Accept: "application/json, text/event-stream",
			"MCP-Protocol-Version": "2025-11-25",
		};
		async function rpc(method: string, params: object) {
			const response = await request.post(`${api}/mcp`, {
				headers,
				data: { jsonrpc: "2.0", id: randomUUID(), method, params },
			});
			expect(response.status()).toBe(200);
			const body = await response.json();
			expect(body.error).toBeUndefined();
			return body.result;
		}
		await rpc("initialize", {
			protocolVersion: "2025-11-25",
			capabilities: {},
			clientInfo: { name: "portfolio-e2e", version: "1" },
		});
		const ready = await request.post(`${api}/mcp`, {
			headers,
			data: { jsonrpc: "2.0", method: "notifications/initialized" },
		});
		expect(ready.status()).toBe(202);
		async function tool(name: string, args: object) {
			const result = await rpc("tools/call", {
				name,
				arguments: { code, ...args },
			});
			expect(result.isError, name).not.toBe(true);
			return result.structuredContent;
		}
		const assigned = await tool("f1_get_ticket", {});
		expect(assigned.title).toBe(title);
		await tool("f1_update_handoff", {
			action: "start",
			version: assigned.workflowVersion,
		});
		const args = { note, requestId: randomUUID() };
		await tool("f1_add_note", args);
		await tool("f1_add_note", args);
		const working = await tool("f1_get_ticket", {});
		expect(working.status).toBe("in_progress");
		await tool("f1_update_handoff", {
			action: "submit",
			version: working.workflowVersion,
			resolution,
		});
	});

	await test.step("Support verifies the developer's evidence and closes the ticket", async () => {
		await page.reload();
		await expect(dialog.locator(".dialog-header .status")).toHaveText(
			"แก้ไขแล้ว",
		);
		const noteEvents = timeline
			.getByRole("listitem")
			.filter({ has: page.getByText(note, { exact: true }) });
		await expect(noteEvents).toHaveCount(1);
		await expect(noteEvents).toContainText(developer);
		await expect(dialog.locator(".workflow-facts")).toContainText(resolution);
		await dialog.locator('[name="reviewNote"]').fill(review);
		await dialog.getByRole("button", { name: "ตรวจผ่านและปิดเคส" }).click();
		await expect(dialog.locator(".dialog-header .status")).toHaveText("ปิดแล้ว");
		await page.reload();
		await expect(dialog.locator(".dialog-header .status")).toHaveText("ปิดแล้ว");
		await expect(timeline.getByText(review, { exact: true })).toBeVisible();
		await expect(noteEvents).toHaveCount(1);
	});
});
