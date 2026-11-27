"use client";
import { useText } from "../i18n/use-text";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { maxTicketImageBytes } from "./tickets";
import { Icon } from "./ui-icon";

const maxImages = 5;
const imageTypes = ["image/jpeg", "image/png"];

function fileKey(file: File) {
	return `${file.name}:${file.size}:${file.lastModified}`;
}

function NewImagePreview({ file }: { file: File }) {
	const [url, setUrl] = useState("");
	useEffect(() => {
		const preview = URL.createObjectURL(file);
		setUrl(preview);
		return () => URL.revokeObjectURL(preview);
	}, [file]);
	return url ? (
		<Image
			unoptimized
			src={url}
			width={52}
			height={52}
			alt=""
			className="ticket-upload-preview"
		/>
	) : null;
}

export function NewTicketImages({
	files,
	onFilesChange,
	limitMB,
	uploadedCount,
}: {
	files: File[];
	onFilesChange: (files: File[]) => void;
	limitMB: number;
	uploadedCount: number;
}) {
	const t = useText();
	const inputRef = useRef<HTMLInputElement>(null);
	const [error, setError] = useState("");

	return (
		<div className="ticket-upload-card">
			<div className="ticket-upload-file">
				<span className="ticket-upload-icon">
					<Icon name="image" />
				</span>
				<div className="ticket-upload-copy">
					<strong aria-live="polite">
						{" "}
						{t("รูปแนบ")} {files.length + uploadedCount} / {maxImages} {t(
							"รูป",
						)}{" "}
					</strong>
					<span className="muted" id="new-ticket-image-help">
						{" "}
						{t("JPG หรือ PNG · ไม่เกิน")} {limitMB} {t("MB ต่อรูป")}{" "}
					</span>
				</div>
			</div>
			{files.length > 0 && (
				<ul className="ticket-upload-list">
					{files.map((file) => (
						<li className="ticket-upload-file" key={fileKey(file)}>
							<NewImagePreview file={file} />
							<span title={file.name}>{file.name}</span>
							<button
								type="button"
								className="button button-secondary"
								aria-label={t("เอารูป {0} ออก", file.name)}
								onClick={() => {
									onFilesChange(files.filter((item) => item !== file));
									setError("");
									inputRef.current?.focus();
								}}
							>
								{" "}
								{t("เอาออก")}{" "}
							</button>
						</li>
					))}
				</ul>
			)}
			{error && (
				<p className="notice error" role="alert">
					{error}
				</p>
			)}
			<div className="ticket-upload-actions">
				<input
					ref={inputRef}
					id="new-ticket-image"
					className="ticket-file-input"
					type="file"
					accept="image/jpeg,image/png"
					multiple
					aria-describedby="new-ticket-image-help"
					onChange={({ currentTarget }) => {
						const next = [...files];
						let message = "";
						for (const file of currentTarget.files ?? []) {
							if (next.some((item) => fileKey(item) === fileKey(file)))
								continue;
							if (next.length + uploadedCount >= maxImages) {
								message = t("แนบได้สูงสุด 5 รูปต่อเคส");
								break;
							}
							if (
								file.size === 0 ||
								(file.type && !imageTypes.includes(file.type))
							) {
								message = t("กรุณาเลือกรูป JPG หรือ PNG ที่เปิดได้ · {0}", file.name);
							} else if (file.size > limitMB * 1024 * 1024) {
								message = t("{0} ต้องมีขนาดไม่เกิน {1} MB", file.name, limitMB);
							} else {
								next.push(file);
							}
						}
						currentTarget.value = "";
						setError(message);
						onFilesChange(next);
					}}
				/>
				<label
					className="button button-secondary ticket-file-picker"
					htmlFor="new-ticket-image"
				>
					{files.length > 0 ? t("เลือกรูปเพิ่ม") : t("เลือกรูปภาพ")}
				</label>
			</div>
		</div>
	);
}

export function TicketImageField({
	id,
	pending,
}: {
	id: string;
	pending?: boolean;
}) {
	const t = useText();
	const inputRef = useRef<HTMLInputElement>(null);
	const [selection, setSelection] = useState<{
		name: string;
		preview: string;
		error: string;
	} | null>(null);
	const preview = selection?.preview;

	useEffect(() => {
		if (preview) return () => URL.revokeObjectURL(preview);
	}, [preview]);

	useEffect(() => {
		const input = inputRef.current;
		const form = input?.form;
		if (!form) return;
		function reset() {
			input?.setCustomValidity("");
			setSelection(null);
		}
		form.addEventListener("reset", reset);
		return () => form.removeEventListener("reset", reset);
	}, []);

	return (
		<div className="ticket-upload-card" data-selected={Boolean(preview)}>
			<div className="ticket-upload-file">
				{preview ? (
					<Image
						unoptimized
						src={preview}
						width={52}
						height={52}
						alt={t("ตัวอย่างรูปที่เลือก")}
						className="ticket-upload-preview"
					/>
				) : (
					<span className="ticket-upload-icon">
						<Icon name="image" />
					</span>
				)}
				<div className="ticket-upload-copy" aria-live="polite">
					<strong title={selection?.name}>
						{selection?.name ?? t("เลือกรูปจากเครื่อง")}
					</strong>
					<span className="muted" id={`${id}-help`}>
						{" "}
						{t("JPG หรือ PNG · ไม่เกิน 5 MB ต่อรูป")}{" "}
					</span>
				</div>
			</div>
			{selection?.error && (
				<p className="notice error" id={`${id}-error`} role="alert">
					{selection.error}
				</p>
			)}
			<div className="ticket-upload-actions">
				<input
					ref={inputRef}
					id={id}
					className="ticket-file-input"
					type="file"
					name="image"
					accept="image/jpeg,image/png"
					aria-invalid={Boolean(selection?.error)}
					aria-describedby={
						selection?.error ? `${id}-help ${id}-error` : `${id}-help`
					}
					onChange={({ currentTarget }) => {
						const file = currentTarget.files?.[0];
						let error = "";
						if (file?.size === 0) error = t("ไฟล์รูปภาพว่างเปล่า");
						else if (file && file.size > maxTicketImageBytes)
							error = t("รูปภาพต้องมีขนาดไม่เกิน 5 MB");
						else if (
							file?.type &&
							file.type !== "image/jpeg" &&
							file.type !== "image/png"
						)
							error = t("กรุณาเลือกไฟล์ JPG หรือ PNG");
						currentTarget.setCustomValidity(error);
						setSelection(
							file
								? {
										name: file.name,
										preview: error ? "" : URL.createObjectURL(file),
										error,
									}
								: null,
						);
					}}
				/>
				<label
					className="button button-secondary ticket-file-picker"
					htmlFor={id}
				>
					{selection ? t("เปลี่ยนรูปภาพ") : t("เลือกรูปภาพ")}
				</label>
				{selection && (
					<button
						type="button"
						className="button button-secondary"
						onClick={() => {
							const input = inputRef.current;
							if (input) {
								input.value = "";
								input.setCustomValidity("");
								input.focus();
							}
							setSelection(null);
						}}
					>
						{" "}
						{t("เอารูปออก")}{" "}
					</button>
				)}
				{pending !== undefined && preview && (
					<button
						type="submit"
						className="button button-primary"
						disabled={pending}
					>
						{pending ? t("กำลังเพิ่มรูป…") : t("เพิ่มรูปภาพ")}
					</button>
				)}
			</div>
		</div>
	);
}
