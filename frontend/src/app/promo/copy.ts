export const promo = {
	th: {
		title: "F1 Ticket Hub | ระบบจัดการเคสสำหรับทีมซัพพอร์ตและทีมพัฒนา",
		nav: "เมนูหลัก",
		product: "ดูฟีเจอร์",
		caseStudy: {
			nav: "กรณีศึกษา",
			title: "หนึ่งยอดชำระ สองคำสั่งซื้อ",
			problem:
				"ในเคสตัวอย่าง ลูกค้าลองชำระอีกครั้งหลังระบบหมดเวลา แล้วพบคำสั่งซื้อสองรายการจากยอดชำระเดียว โจทย์ที่ผมออกแบบคือ ทำอย่างไรให้คนรับแจ้งกับคนแก้ใช้หลักฐานชุดเดียวกันจนปิดเคสได้",
			decisions: [
				{
					title: "เก็บวิธีทำให้เกิดปัญหาไว้ในเคส",
					body: "ผมให้ซัพพอร์ตระบุขั้นตอนที่ทำให้เกิดปัญหาตอนส่งงาน นักพัฒนาจึงรู้ว่าต้องจำลองจังหวะที่ระบบหมดเวลาแล้วลองจ่ายซ้ำ และซัพพอร์ตใช้ขั้นตอนเดิมตรวจรับได้",
				},
				{
					title: "ให้ซัพพอร์ตเป็นคนปิดเคส",
					body: "เมื่อนักพัฒนาส่งผลทดสอบและลิงก์ PR เคสจะเข้าคิวรอตรวจรับ ในเดโม ซัพพอร์ตลองจ่ายซ้ำตามขั้นตอนเดิมและยืนยันว่าเกิดคำสั่งซื้อเพียงรายการเดียวก่อนปิดเคส",
				},
			],
			tryIt: "ลองเดินเคสนี้",
		},
		developers: "สำหรับนักพัฒนา",
		login: "เข้าสู่ระบบ",
		workspace: "เปิดพื้นที่ทำงาน",
		headline: ["จากเคสแรกเข้า", "ถึงวันที่แก้จบ"],
		intro:
			"ให้ทีมซัพพอร์ตและทีมพัฒนาทำงานบนเคสเดียวกัน ตั้งแต่รับแจ้งปัญหา จัดลำดับงาน ไปจนถึงตรวจรับการแก้ไข",
		demo: "ลองใช้เดโม",
		explore: "ดูวิธีทำงาน",
		tourTitle: "หนึ่งเคส ผ่านมือสองทีม",
		tourIntro: "เลือกดูแต่ละขั้น แล้วลองทำเองในเดโมได้ทันที",
		views: [
			{
				label: "บอร์ดงาน",
				title: "เห็นงานค้างทั้งคิวในบอร์ดเดียว",
				body: "ดูว่าเคสไหนรอรับเรื่อง ใครกำลังแก้ และงานไหนพร้อมตรวจ กรองคิวตามกำหนดส่งหรือความเร่งด่วน",
				alt: "บอร์ดตัวอย่าง แสดงเคสตามสถานะ พร้อมผู้รับผิดชอบและระดับความสำคัญ",
				link: "เปิดบอร์ดตัวอย่าง",
			},
			{
				label: "คัดกรองด้วย AI",
				title: "เปลี่ยนรายละเอียดปัญหาให้พร้อมส่งต่อ",
				body: "เลือกเคสตัวอย่าง แล้วให้ AI สรุปผลกระทบและเสนอคำถามที่ทีมควรถามเพิ่มก่อนเริ่มแก้",
				alt: "หน้าคัดกรองด้วย AI พร้อมรายงานปัญหาและสรุปที่สร้างจากเคสตัวอย่าง",
				link: "ลองคัดกรองเคส",
			},
			{
				label: "ส่งต่องาน",
				title: "ส่งงานให้ทีมพัฒนา แล้วตามกลับมาตรวจรับ",
				body: "ลองเดินเคสชำระเงินซ้ำตั้งแต่รับแจ้ง บันทึกวิธีทำให้เกิดปัญหา แนบผลแก้ไข จนทีมซัพพอร์ตตรวจรับ",
				alt: "หน้าทดลองส่งต่องาน แสดงลำดับเหตุการณ์ของเคสชำระเงินซ้ำ",
				link: "ลองเดินเคสทีละขั้น",
			},
		],
		devTitle: "อัปเดตเคสจากเครื่องมือที่ใช้เขียนโค้ด",
		devBody:
			"ผมเลือกใช้ MCP เพื่อให้นักพัฒนาบันทึกผลทดสอบลงเคสเดิมจาก Claude Code หรือ Codex ได้ทันที เมื่อส่งงานกลับ ซัพพอร์ตจึงเห็นหลักฐานในประวัติเคสโดยไม่ต้องตามอ่านแชตของนักพัฒนา",
		tools: [
			"อ่านเคสและขั้นตอนที่ทำให้เกิดปัญหา",
			"บันทึกผลทดสอบลงในเคส",
			"ส่งผลการแก้ไขให้ซัพพอร์ตตรวจรับ",
		],
		toolHeading: "เครื่องมือ MCP",
		staff: "พื้นที่เจ้าหน้าที่",
	},
	en: {
		title: "F1 Ticket Hub | Ticket management for support and engineering",
		nav: "Main navigation",
		product: "Product tour",
		caseStudy: {
			nav: "Case study",
			title: "One payment, two orders.",
			problem:
				"In this sample case, a customer retries checkout after a timeout and gets two orders for one payment. I designed the handoff around one question. How can support and engineering work from the same evidence until the case is closed?",
			decisions: [
				{
					title: "Keep the reproduction steps on the ticket",
					body: "I made the steps part of the handoff so the developer knows exactly when to retry checkout. Support can later repeat the same sequence to verify the fix.",
				},
				{
					title: "Give support the closing decision",
					body: "Submitting test evidence and a pull request moves the ticket to review. In the demo, support repeats the original checkout sequence and confirms that one payment creates one order before closing the case.",
				},
			],
			tryIt: "Walk through this case",
		},
		developers: "For developers",
		login: "Sign in",
		workspace: "Open workspace",
		headline: ["From first report", "to verified fix."],
		intro:
			"Give support and engineering one ticket to work from. Triage the report, hand it to a developer, and bring the fix back for review.",
		demo: "Try the demo",
		explore: "See how it works",
		tourTitle: "One ticket, two teams.",
		tourIntro: "Explore each step, then try it yourself in the demo.",
		views: [
			{
				label: "Ticket board",
				title: "See the whole queue at a glance.",
				body: "See what’s waiting, who’s working on a fix, and what’s ready for review. Filter the queue by urgency or due date.",
				alt: "Sample ticket board grouped by status, with assignees and priorities on the cards",
				link: "Explore the board",
			},
			{
				label: "AI triage",
				title: "Turn a report into a handoff brief.",
				body: "Pick a sample incident and let AI summarize the impact and suggest the questions to ask before engineering starts.",
				alt: "AI triage view showing a sample incident and its generated brief",
				link: "Try AI triage",
			},
			{
				label: "Team handoff",
				title: "Follow a fix back to support.",
				body: "Work through a duplicate checkout report. Record how to reproduce it, attach the fix, and verify the result with support.",
				alt: "Guided handoff showing the activity timeline for a duplicate checkout incident",
				link: "Walk through a ticket",
			},
		],
		devTitle: "Update tickets from the tools you code in.",
		devBody:
			"I chose MCP so developers can log test results on the original ticket directly from Claude Code or Codex. When the fix comes back for review, support can find the evidence in the ticket history without tracking down a developer’s chat.",
		tools: [
			"Read the ticket and reproduction steps",
			"Record test results on the ticket",
			"Submit a fix for support review",
		],
		toolHeading: "MCP tools",
		staff: "Staff workspace",
	},
} as const;

export type PromoLocale = keyof typeof promo;
