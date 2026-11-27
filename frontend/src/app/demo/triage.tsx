"use client";
import { useText } from "../../i18n/use-text";

import { useState } from "react";
import { TriagePanel } from "../triage-panel";
import { sampleTickets } from "./data";

export function DemoTriage() {
	const t = useText();
	const [id, setId] = useState(sampleTickets[0].id);
	const ticket =
		sampleTickets.find((item) => item.id === id) ?? sampleTickets[0];
	return (
		<section id="ai-triage" className="demo-ai" aria-labelledby="ai-title">
			<div>
				<h3 id="ai-title">{t("Customer report")}</h3>
				<label htmlFor="ai-sample">{t("Choose a sample report")}</label>
				<select
					id="ai-sample"
					value={id}
					onChange={(event) => setId(Number(event.target.value))}
				>
					{sampleTickets.map((item) => (
						<option key={item.id} value={item.id}>
							{t(item.title)}
						</option>
					))}
				</select>
				<p>{t(ticket.description)}</p>
			</div>
			<TriagePanel key={id} source="sample" id={String(id)} />
		</section>
	);
}
