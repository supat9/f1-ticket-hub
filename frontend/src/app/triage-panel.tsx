"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";

function waitForRetry(signal: AbortSignal) {
	return new Promise<void>((resolve, reject) => {
		signal.throwIfAborted();
		const cancel = () => {
			clearTimeout(timer);
			reject(signal.reason);
		};
		const timer = setTimeout(() => {
			signal.removeEventListener("abort", cancel);
			resolve();
		}, 5000);
		signal.addEventListener("abort", cancel, { once: true });
	});
}

type Provider = "example" | "local" | "claude";

type Brief = {
	readiness: "ask" | "handoff";
	summary: string;
	impact: string;
	question: string;
};
const copy = {
	en: {
		title: "AI triage brief",
		help: "Find out whether to ask the customer for more detail or send the case to Engineering.",
		generate: "Assess this report",
		ask: "Ask the customer first",
		handoff: "Ready for engineering review",
		verify: "Proposed acceptance check",
		copyQuestion: "Copy customer question",
		pending: "Reading the report…",
		busy: "The selected AI is working on another case. Try again shortly.",
		error:
			"The selected AI is unavailable. Start the AI service, then try again.",
		readError: "Could not read this ticket. Reopen the case and try again.",
		summary: "Case summary",
		impact: "Reported impact",
		question: "Ask next",
		source: "AI draft · Review before sharing",
		copy: "Copy brief",
		copied: "Copied",
		copyError: "Select the text to copy it manually.",
	},
	th: {
		title: "AI ช่วยคัดกรองเคส",
		help: "ดูว่าข้อมูลพร้อมส่งให้ทีมพัฒนาหรือยัง และคำถามไหนจะช่วยให้ทำงานต่อได้",
		generate: "ประเมินเคสนี้",
		ask: "ควรถามลูกค้าเพิ่ม",
		handoff: "พร้อมส่งให้ทีมพัฒนาตรวจสอบ",
		verify: "วิธีตรวจรับที่แนะนำ",
		copyQuestion: "คัดลอกคำถามถึงลูกค้า",
		pending: "กำลังอ่านเคส…",
		busy: "โมเดลกำลังอ่านเคสอื่น กรุณาลองอีกครั้งสักครู่",
		error: "ติดต่อ AI ที่เลือกไม่ได้ กรุณาตรวจสอบบริการ AI แล้วลองอีกครั้ง",
		readError: "อ่านเคสไม่ได้ กรุณาเปิดเคสใหม่แล้วลองอีกครั้ง",
		summary: "สรุปเคส",
		impact: "ผลกระทบที่รายงาน",
		question: "คำถามที่ควรถามต่อ",
		source: "ร่างจาก AI · ตรวจทานก่อนส่งต่อ",
		copy: "คัดลอกบรีฟ",
		copied: "คัดลอกแล้ว",
		copyError: "เลือกข้อความเพื่อคัดลอกได้ด้วยตนเอง",
	},
};
const fields = ["summary", "impact", "question"] as const;

export function TriagePanel({
	source,
	id,
}: {
	source: "sample" | "ticket";
	id: string;
}) {
	const language = useLocale() === "en" ? "en" : "th";
	const [provider, setProvider] = useState<Provider>(
		source === "sample" ? "example" : "local",
	);
	const en = language === "en";
	return (
		<div className="triage-panel">
			{source === "ticket" && (
				<>
					<h3>{copy[language].title}</h3>
					<p>{copy[language].help}</p>
				</>
			)}
			<label>
				{en ? "Assessment source" : "เลือกวิธีประเมิน"}{" "}
				<select
					value={provider}
					onChange={(e) => setProvider(e.target.value as Provider)}
				>
					{source === "sample" && (
						<option value="example">
							{en ? "Prepared example" : "ตัวอย่างที่เตรียมไว้"}
						</option>
					)}
					<option value="local">
						{en ? "On-device · Qwen" : "บนเครื่อง · Qwen"}
					</option>
					<option value="claude">Claude · Anthropic</option>
				</select>
			</label>
			{provider === "claude" && (
				<small>
					{en
						? "Generating sends the title and description to Anthropic."
						: "เมื่อกดประเมินเคส ระบบจะส่งหัวข้อและรายละเอียดเคสไปยัง Anthropic"}
				</small>
			)}
			<Draft
				key={`${source}:${id}:${provider}:${language}`}
				source={source}
				id={id}
				language={language}
				provider={provider}
			/>
		</div>
	);
}
function Draft({
	source,
	id,
	language,
	provider,
}: {
	source: "sample" | "ticket";
	id: string;
	language: "th" | "en";
	provider: Provider;
}) {
	const t = copy[language];
	const [brief, setBrief] = useState<Brief | null>(null);
	const [pending, setPending] = useState(false);
	const [message, setMessage] = useState("");
	const active = useRef<AbortController | null>(null);
	useEffect(() => () => active.current?.abort(), []);
	async function generate() {
		setPending(true);
		setMessage("");
		const controller = new AbortController();
		active.current = controller;
		const request = () =>
			fetch(
				`/api/triage?${source}=${encodeURIComponent(id)}&lang=${language}&provider=${provider}`,
				{ method: "POST", signal: controller.signal },
			);
		try {
			let response = await request();
			for (let retry = 0; response.status === 429 && retry < 3; retry++) {
				setMessage(
					language === "en"
						? "The model is busy. Retrying in 5 seconds…"
						: "โมเดลกำลังอ่านเคสอื่น จะลองอีกครั้งใน 5 วินาที…",
				);
				await waitForRetry(controller.signal);
				response = await request();
			}
			setMessage("");
			if (!response.ok) {
				setMessage(
					response.status === 429
						? t.busy
						: response.status === 504
							? language === "en"
								? "The assessment timed out. Try again."
								: "การประเมินใช้เวลาเกินกำหนด กรุณาลองอีกครั้ง"
							: response.status < 500
								? t.readError
								: t.error,
				);
				return;
			}
			setBrief((await response.json()).brief);
		} catch {
			if (!controller.signal.aborted) setMessage(t.error);
		} finally {
			if (!controller.signal.aborted) setPending(false);
		}
	}
	async function copyBrief() {
		if (!brief) return;
		try {
			await navigator.clipboard.writeText(
				brief.readiness === "ask"
					? brief.question
					: [
							t.handoff,
							...fields.map(
								(key) =>
									`${key === "question" ? t.verify : t[key]}\n${brief[key]}`,
							),
						].join("\n\n"),
			);
			setMessage(t.copied);
		} catch {
			setMessage(t.copyError);
		}
	}
	return (
		<div className="triage-panel">
			{brief ? (
				<>
					<strong>{t[brief.readiness]}</strong>
					<dl>
						{fields.map((key) => (
							<div key={key}>
								<dt>
									{key === "question" && brief.readiness === "handoff"
										? t.verify
										: t[key]}
								</dt>
								<dd>{brief[key]}</dd>
							</div>
						))}
					</dl>
					<small>
						{provider === "example"
							? language === "en"
								? "Prepared example brief"
								: "ตัวอย่างบรีฟที่เตรียมไว้"
							: `${provider === "local" ? "Qwen" : "Claude"} · ${t.source}`}
					</small>
					<button
						type="button"
						className="button button-secondary"
						onClick={copyBrief}
					>
						{brief.readiness === "ask" ? t.copyQuestion : t.copy}
					</button>
				</>
			) : (
				<button
					type="button"
					className="button button-primary"
					disabled={pending}
					onClick={generate}
				>
					{pending
						? t.pending
						: provider === "example"
							? language === "en"
								? "View example brief"
								: "ดูตัวอย่างบรีฟ"
							: t.generate}
				</button>
			)}
			<span role="status">{message || (pending ? t.pending : "")}</span>
		</div>
	);
}
