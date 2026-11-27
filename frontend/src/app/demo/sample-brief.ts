import { translator, type Language } from "../../i18n/text";
import type { DemoTicket } from "./data";

type Check = { impact: string; question: string };
const checks: Record<number, Record<Language, Check>> = {
	108: {
		en: {
			impact: "One payment can appear as two orders.",
			question:
				"Time out a test payment, retry it, and verify that the order history contains exactly one order for that payment.",
		},
		th: {
			impact: "การชำระครั้งเดียวอาจสร้างคำสั่งซื้อสองรายการ",
			question:
				"จำลองให้การจ่ายเงินหมดเวลาแล้วกดจ่ายซ้ำ ตรวจว่าประวัติมีคำสั่งซื้อเดียวสำหรับยอดชำระนั้น",
		},
	},
	107: {
		en: {
			impact:
				"Trial users wait several minutes before they can reset their password.",
			question:
				"Request a reset from a trial account and verify the email arrives within the agreed delivery target with a working link.",
		},
		th: {
			impact: "ผู้ใช้บัญชีทดลองต้องรอหลายนาทีกว่าจะรีเซ็ตรหัสผ่านได้",
			question:
				"ขอรีเซ็ตรหัสผ่านจากบัญชีทดลอง จับเวลาจนได้รับอีเมล แล้วตรวจว่าถึงภายในเวลาที่ทีมกำหนดและลิงก์ใช้งานได้",
		},
	},
	106: {
		en: {
			impact:
				"The requested shortcuts affect how staff search and open new tickets.",
			question:
				"Use each shortcut on the board, then type the same keys in a text field and verify no shortcut fires there.",
		},
		th: {
			impact: "ปุ่มลัดนี้เกี่ยวข้องกับการค้นหาและเปิดเคสของเจ้าหน้าที่",
			question:
				"ลองปุ่มลัดทั้งค้นหาและเปิดเคส จากนั้นพิมพ์ปุ่มเดียวกันในช่องข้อความแล้วตรวจว่าไม่มีคำสั่งทำงาน",
		},
	},
	105: {
		en: {
			impact: "Someone opening the link needs to see the same date range.",
			question:
				"Choose a date range, reload, then open the copied URL in a new tab and verify both dates and the filtered rows match.",
		},
		th: {
			impact: "คนที่เปิดลิงก์ต้องเห็นเคสในช่วงวันที่เดียวกัน",
			question:
				"เลือกช่วงวันที่ รีเฟรช แล้วเปิดลิงก์ในแท็บใหม่ ตรวจว่าทั้งวันที่และรายการเคสตรงกัน",
		},
	},
	104: {
		en: {
			impact:
				"Customers need different recovery steps for a declined card and a lost connection.",
			question:
				"Simulate each failure separately and verify each message describes the failure and gives an appropriate next step.",
		},
		th: {
			impact: "ลูกค้าต้องใช้วิธีแก้คนละแบบเมื่อบัตรถูกปฏิเสธกับเมื่อการเชื่อมต่อขาด",
			question:
				"จำลองทั้งสองเหตุการณ์แยกกัน ตรวจว่าแต่ละข้อความบอกปัญหาและสิ่งที่ลูกค้าควรทำต่อได้ตรงเหตุการณ์",
		},
	},
	103: {
		en: {
			impact: "A CSV can omit matching tickets beyond the first page.",
			question:
				"Export a filtered queue with two or more pages and compare its ticket IDs against all matching pages.",
		},
		th: {
			impact: "ไฟล์ CSV อาจขาดเคสที่ตรงตัวกรองในหน้าถัดไป",
			question:
				"ส่งออกคิวที่กรองแล้วมีอย่างน้อยสองหน้า แล้วเทียบรหัสเคสในไฟล์กับรายการที่ตรงตัวกรองทุกหน้า",
		},
	},
	102: {
		en: {
			impact:
				"Screen reader users need to identify each input and its validation error.",
			question:
				"Tab to each invalid field with a screen reader and verify it announces the field label and corresponding error.",
		},
		th: {
			impact: "ผู้ใช้โปรแกรมอ่านหน้าจอต้องทราบชื่อช่องกรอกและข้อผิดพลาดของช่องนั้น",
			question:
				"ใช้โปรแกรมอ่านหน้าจอแล้วกด Tab ไปแต่ละช่องที่กรอกผิด ตรวจว่าได้ยินชื่อช่องและข้อผิดพลาดที่ตรงกัน",
		},
	},
	101: {
		en: {
			impact: "Customers need access to their own invoices.",
			question:
				"Using two test accounts, verify each can download its own invoice and cannot download the other account’s invoice.",
		},
		th: {
			impact: "ลูกค้าต้องเข้าถึงใบแจ้งหนี้ของตนเองได้",
			question:
				"ใช้สองบัญชีทดสอบ ตรวจว่าแต่ละบัญชีดาวน์โหลดใบแจ้งหนี้ของตนได้ และเปิดใบแจ้งหนี้ของอีกบัญชีไม่ได้",
		},
	},
};

export function sampleBrief(ticket: DemoTicket, language: Language) {
	const check = checks[ticket.id]?.[language];
	if (!check) return null;
	return {
		readiness: "handoff" as const,
		summary: translator(language)(ticket.title),
		...check,
	};
}
