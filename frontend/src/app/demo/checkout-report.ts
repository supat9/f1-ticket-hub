export const checkoutReport = {
	th: {
		title: "ปัญหาที่หน้าชำระเงิน",
		report: "เมื่อกี้จ่ายเงินแล้วหน้าจอค้าง ช่วยเช็กให้หน่อยค่ะ",
		reply:
			"ตอนกดจ่ายครั้งแรกขึ้นว่าหมดเวลา เลยกดจ่ายอีกครั้ง ประวัติคำสั่งซื้อขึ้นสองรายการ แต่ธนาคารแจ้งตัดเงินครั้งเดียวค่ะ",
	},
	en: {
		title: "Problem at checkout",
		report:
			"The screen froze when I paid just now. Could you check what happened?",
		reply:
			"My first payment attempt timed out, so I pressed Pay again. My order history shows two orders, but my bank shows only one charge.",
	},
} as const;
