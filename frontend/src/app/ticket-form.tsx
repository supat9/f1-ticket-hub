"use client";
import { useText } from "../i18n/use-text";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { queueHref } from "./queue-url";
import { StaffFields } from "./staff-fields";
import { appendTicketImage, submitTicket } from "./ticket-actions";
import { Priority } from "./ticket-badges";
import { NewTicketImages } from "./ticket-image-field";
import { TicketMetadataFields } from "./ticket-metadata-fields";
import {
	priorities,
	sources,
	type QueueView,
	type StaffMember,
	type TicketFormState,
} from "./tickets";

const initialState: TicketFormState = { attempt: 0 };
const sourceOptions = [
	{ value: "customer", help: "บันทึกเรื่องที่ทีม CS รับแจ้งจากลูกค้า" },
	{ value: "internal", help: "แจ้งปัญหาหรือคำขอจากทีมภายใน" },
] as const;

export function TicketForm({
	requestId,
	staff,
	currentUserId,
	view,
	closeHref,
	imageLimitMB,
}: {
	requestId: string;
	staff: StaffMember[];
	currentUserId: string;
	view: QueueView;
	closeHref: string;
	imageLimitMB: number;
}) {
	const t = useText();
	const router = useRouter();
	const [stableRequestId] = useState(requestId);
	const [files, setFiles] = useState<File[]>([]);
	const [state, action, pending] = useActionState(
		async (previous: TicketFormState, form: FormData) => {
			const result = previous.saved
				? previous
				: await submitTicket(previous, form);
			if (!result.saved) return result;

			for (const [index, file] of files.entries()) {
				const attachment = new FormData();
				attachment.set("ticketId", result.saved.id);
				attachment.set("image", file);
				const upload = await appendTicketImage(attachment).catch(() => null);
				if (!upload || upload.error) {
					return {
						...result,
						saved: {
							...result.saved,
							uploadedImages: result.saved.uploadedImages + index,
						},
						error: t(
							"แนบรูป {0} ไม่สำเร็จ · {1}",
							file.name,
							upload?.message ?? "ลองอีกครั้ง",
						),
					};
				}
				setFiles(files.slice(index + 1));
			}
			router.replace(
				queueHref({
					view,
					created: result.saved.code,
					createdId: result.saved.id,
				}),
				{ scroll: false },
			);
			return { ...result, error: undefined };
		},
		initialState,
	);

	return (
		<form
			className="create-form"
			action={action}
			key={state.attempt}
			aria-busy={pending}
		>
			<input type="hidden" name="requestId" value={stableRequestId} />
			<div className="create-fields">
				{state.error && (
					<p className="notice error" role="alert">
						{state.saved && t("สร้างเคส {0} แล้ว · ", state.saved.code)}
						{state.error}
					</p>
				)}
				<fieldset disabled={pending || Boolean(state.saved)}>
					<TicketTextFields fields={state.fields} />
					<StaffFields
						prefix="new-ticket"
						staff={staff}
						creating
						ownerId={state.fields?.ownerId ?? currentUserId}
						assigneeId={state.fields?.assigneeId ?? ""}
						assigneeName={state.fields?.assigneeName ?? ""}
					/>
					<TicketMetadataFields
						prefix="new-ticket"
						fields={state.fields}
						requireClassification
					/>
					<fieldset className="choice-field">
						<legend>{t("แหล่งที่มา")}</legend>
						<div className="choice-grid source-options">
							{sourceOptions.map(({ value, help }) => (
								<label className="choice source-choice" key={value}>
									<input
										type="radio"
										name="source"
										value={value}
										defaultChecked={
											value === (state.fields?.source ?? "customer")
										}
									/>
									<span className="choice-ring" aria-hidden="true" />
									<span>
										<strong>{t(sources[value])}</strong>
										<small>{t(help)}</small>
									</span>
								</label>
							))}
						</div>
					</fieldset>
					<fieldset className="choice-field">
						<legend>
							{" "}
							{t("Priority")}{" "}
							<span className="form-hint">
								{t("ค่าเริ่มต้นคือ")} {t(priorities.normal)}
							</span>
						</legend>
						<div className="choice-grid priority-options">
							{(Object.keys(priorities) as (keyof typeof priorities)[]).map(
								(priority) => (
									<label className="choice priority-choice" key={priority}>
										<input
											type="radio"
											name="priority"
											value={priority}
											defaultChecked={
												priority === (state.fields?.priority ?? "normal")
											}
										/>
										<Priority priority={priority} />
									</label>
								),
							)}
						</div>
					</fieldset>
				</fieldset>
				<fieldset disabled={pending}>
					<NewTicketImages
						files={files}
						onFilesChange={setFiles}
						limitMB={imageLimitMB}
						uploadedCount={state.saved?.uploadedImages ?? 0}
					/>
				</fieldset>
			</div>
			<footer className="dialog-footer">
				<Link
					href={
						state.saved
							? queueHref({ view, ticket: state.saved.id, section: "images" })
							: closeHref
					}
					scroll={false}
					className="button button-secondary"
					aria-disabled={pending}
					onNavigate={(event) => {
						if (pending) event.preventDefault();
					}}
				>
					{state.saved ? t("เปิดเคส") : t("ยกเลิก")}
				</Link>
				<button
					type="submit"
					className="button button-primary"
					disabled={pending}
				>
					{pending && <span className="spinner" aria-hidden="true" />}
					{pending
						? t("กำลังบันทึก…")
						: state.saved
							? files.length
								? t("บันทึกรูปที่เหลือ")
								: t("เสร็จสิ้น")
							: t("บันทึกเคส")}
				</button>
			</footer>
		</form>
	);
}

function TicketTextFields({ fields }: { fields: TicketFormState["fields"] }) {
	const t = useText();
	const [title, setTitle] = useState(fields?.title ?? "");
	const [description, setDescription] = useState(fields?.description ?? "");
	return (
		<>
			<div className="form-field">
				<div className="field-label">
					<label htmlFor="ticket-title">{t("ชื่อเคส")}</label>
					<span className="required-mark" aria-hidden="true">
						*
					</span>
					<span className="char-count">{title.length} / 160</span>
				</div>
				<input
					id="ticket-title"
					name="title"
					placeholder={t("เช่น ส่งออกไฟล์รายงานประจำวันไม่ได้")}
					required
					maxLength={160}
					value={title}
					aria-describedby="title-help"
					onChange={(event) => setTitle(event.target.value)}
				/>
				<p className="form-hint" id="title-help">
					{" "}
					{t("สรุปปัญหาหรือคำขอให้สั้นและชัดเจน")}{" "}
				</p>
			</div>
			<div className="form-field">
				<div className="field-label">
					<label htmlFor="ticket-description">{t("รายละเอียด")}</label>
					<span className="required-mark" aria-hidden="true">
						*
					</span>
					<span className="char-count">{description.length} / 5,000</span>
				</div>
				<textarea
					id="ticket-description"
					name="description"
					rows={5}
					placeholder={t("อาการที่พบ ขั้นตอนที่ทำ และผลที่คาดหวัง")}
					required
					maxLength={5000}
					value={description}
					aria-describedby="description-help"
					onChange={(event) => setDescription(event.target.value)}
				/>
				<p className="form-hint" id="description-help">
					{" "}
					{t("เพิ่มข้อมูลที่ช่วยให้ทีมตรวจสอบหรือทำซ้ำได้")}{" "}
				</p>
			</div>
		</>
	);
}
