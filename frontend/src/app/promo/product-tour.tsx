"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "../ui-icon";
import { promo, type PromoLocale } from "./copy";
import boardEn from "./images/all-en.webp";
import boardTh from "./images/all-th.webp";
import triageEn from "./images/ai-triage-en.webp";
import triageTh from "./images/ai-triage-th.webp";
import handoffEn from "./images/walkthrough-en.webp";
import handoffTh from "./images/walkthrough-th.webp";

const panels = [
	{ hash: "all", icon: "board", en: boardEn, th: boardTh },
	{ hash: "ai-triage", icon: "spark", en: triageEn, th: triageTh },
	{ hash: "walkthrough", icon: "layers", en: handoffEn, th: handoffTh },
] as const;

export function ProductTour({ locale }: { locale: PromoLocale }) {
	const [selected, select] = useState(0);
	const copy = promo[locale];
	const view = copy.views[selected];
	const panel = panels[selected];
	return (
		<section
			id="product"
			className="promo-tour promo-frame"
			aria-labelledby="tour-title"
		>
			<div className="promo-section-heading">
				<h2 id="tour-title">{copy.tourTitle}</h2>
				<p>{copy.tourIntro}</p>
			</div>
			<fieldset className="promo-controls" aria-labelledby="tour-title">
				{copy.views.map((item, index) => (
					<button
						key={panels[index].hash}
						type="button"
						aria-pressed={selected === index}
						aria-controls="feature-preview"
						onClick={() => select(index)}
					>
						<Icon name={panels[index].icon} />
						{item.label}
					</button>
				))}
			</fieldset>
			<div className="promo-preview" id="feature-preview">
				<div className="promo-caption" aria-live="polite" aria-atomic="true">
					<h3>{view.title}</h3>
					<p>{view.body}</p>
					<Link className="promo-inline-link" href={`/demo#${panel.hash}`}>
						{view.link}
						<Icon name="arrow" />
					</Link>
				</div>
				<div className="promo-product-shot">
					<Image
						src={panel[locale]}
						alt={view.alt}
						sizes="(max-width: 800px) 92vw, 760px"
					/>
				</div>
			</div>
		</section>
	);
}
