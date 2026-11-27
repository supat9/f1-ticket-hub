import { useText } from "../i18n/use-text";
import { categories, products, type TicketMetadata } from "./tickets";

export function TicketMetadataFields({
	prefix,
	fields,
	requireClassification = false,
}: {
	prefix: string;
	fields?: TicketMetadata;
	requireClassification?: boolean;
}) {
	const t = useText();
	return (
		<>
			<div className="form-field">
				<label htmlFor={`${prefix}-customer`}>{t("ชื่อลูกค้า (ไม่บังคับ)")}</label>
				<input
					id={`${prefix}-customer`}
					name="customerName"
					maxLength={160}
					defaultValue={fields?.customerName}
				/>
			</div>
			<div className="staff-fields">
				<div className="form-field">
					<label htmlFor={`${prefix}-product`}>
						{" "}
						{t("สินค้า")}{" "}
						{requireClassification && (
							<span className="required-mark" aria-hidden="true">
								*
							</span>
						)}
					</label>
					<select
						id={`${prefix}-product`}
						name="product"
						defaultValue={fields?.product ?? ""}
						required={requireClassification}
					>
						<option value="">{t("เลือกสินค้า")}</option>
						{Object.entries(products).map(([value, label]) => (
							<option key={value} value={value}>
								{t(label)}
							</option>
						))}
					</select>
				</div>
				<div className="form-field">
					<label htmlFor={`${prefix}-category`}>
						{" "}
						{t("ประเภทเคส")}{" "}
						{requireClassification && (
							<span className="required-mark" aria-hidden="true">
								*
							</span>
						)}
					</label>
					<select
						id={`${prefix}-category`}
						name="category"
						defaultValue={fields?.category ?? ""}
						required={requireClassification}
					>
						<option value="">{t("เลือกประเภท")}</option>
						{Object.entries(categories).map(([value, label]) => (
							<option key={value} value={value}>
								{t(label)}
							</option>
						))}
					</select>
				</div>
			</div>
			<div className="form-field">
				<label htmlFor={`${prefix}-notes`}>{t("หมายเหตุ (ไม่บังคับ)")}</label>
				<textarea
					id={`${prefix}-notes`}
					name="notes"
					rows={3}
					maxLength={5000}
					defaultValue={fields?.notes}
				/>
			</div>
		</>
	);
}
