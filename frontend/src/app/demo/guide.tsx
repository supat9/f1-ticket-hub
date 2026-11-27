import { useText } from "../../i18n/use-text";
import { demoTicketCode } from "./data";

export const guideSteps = [
	{
		button: "Log the customer report",
		actor: "Maya · Support",
		event: "Logged a checkout incident",
		detail: "A customer received two orders after retrying a payment.",
		status: "open",
		minute: 0,
	},
	{
		button: "Hand off to Engineering",
		actor: "Maya · Support",
		event: "Assigned Alex and added reproduction steps",
		detail:
			"Retry the same checkout after a gateway timeout. Two order records are created for one payment.",
		status: "open",
		minute: 8,
	},
	{
		button: "Start work as Dev",
		actor: "Alex · Engineering",
		event: "Moved the ticket to In progress",
		detail:
			"Reproduced the issue in the test gateway and isolated the duplicate write.",
		status: "in_progress",
		minute: 15,
	},
	{
		button: "Submit the fix and PR evidence",
		actor: "Alex · Engineering",
		event: "Submitted PR #42 for review",
		detail:
			"Demo PR #42 reuses the existing order for repeated payment requests. The retry test returns one order.",
		status: "resolved",
		minute: 55,
	},
	{
		button: "Verify and close as Support",
		actor: "Maya · Support",
		event: "Verified the fix and closed the ticket",
		detail:
			"Retested the original checkout sequence. One payment produced one order.",
		status: "closed",
		minute: 70,
	},
] as const;

export function DemoGuide({
	step,
	ticketId,
	onAdvance,
}: {
	step: number;
	ticketId: number | null;
	onAdvance: () => void;
}) {
	const t = useText();
	const next = guideSteps[step];
	return (
		<section className="demo-guide" id="walkthrough">
			<header>
				<span>
					{ticketId === null
						? t("Follow one case from customer report to verified fix")
						: t(
								"{0} · {1} of {2} steps",
								demoTicketCode(ticketId),
								step,
								guideSteps.length,
							)}
				</span>
			</header>
			<div className="demo-guide-content">
				<div>
					<h3>{t("Duplicate checkout order")}</h3>
					<p>
						{next
							? t("Next up · {0}", t(next.actor))
							: t("Support verified the fix and closed the case.")}
					</p>
					{next && (
						<button
							className="button button-primary"
							type="button"
							onClick={onAdvance}
						>
							{t(next.button)}
						</button>
					)}
					{!next && (
						<dl className="demo-guide-report">
							<div>
								<dt>{t("Started in")}</dt>
								<dd>
									{guideSteps[2].minute} {t("min")}
								</dd>
							</div>
							<div>
								<dt>{t("Resolved in")}</dt>
								<dd>
									{guideSteps[3].minute} {t("min")}
								</dd>
							</div>
							<div>
								<dt>{t("Resolution target")}</dt>
								<dd>{t("4 hours · Met")}</dd>
							</div>
						</dl>
					)}
				</div>
				{step > 0 && (
					<div>
						<h3>{t("Activity timeline")}</h3>
						<ol className="workflow-timeline">
							{guideSteps.slice(0, step).map((item) => (
								<li key={item.event}>
									<strong>{t(item.event)}</strong>
									<span className="muted">
										{t(item.actor)} ·{" "}
										{item.minute === 0
											? t("Intake")
											: t("{0} min after intake", item.minute)}
									</span>
									<p>{t(item.detail)}</p>
								</li>
							))}
						</ol>
					</div>
				)}
			</div>
		</section>
	);
}
