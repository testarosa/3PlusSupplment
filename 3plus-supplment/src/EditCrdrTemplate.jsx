import React, { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "./EditCrdrTemplate.css";
import { updateCrdrTemplate } from "./api/ListCrdrTemplate";

const toNumberOrZero = (value) => {
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
};

const toValidDetailId = (value) => {
	const n = Number(value);
	return Number.isFinite(n) && n > 0 ? n : undefined;
};

const createDetailRow = (overrides = {}) => ({
	id: overrides.id ?? `row-${Date.now()}-${Math.random().toString(16).slice(2)}`,
	detailId: overrides.detailId ?? null,
	description: overrides.description ?? "",
	debit: overrides.debit ?? 0,
	credit: overrides.credit ?? 0,
});

const parseMaybeJson = (payload) => {
	if (typeof payload !== "string") return payload;
	try {
		return JSON.parse(payload);
	} catch {
		return payload;
	}
};

const getErrorMessage = (err, fallback) => {
	const data = parseMaybeJson(err?.response?.data ?? err?.data);
	if (typeof data === "string" && data.trim()) return data.trim();
	if (data && typeof data === "object") {
		const message = data.message || data.error || data.title || data.detail || data.msg;
		if (typeof message === "string" && message.trim()) return message.trim();
	}
	if (typeof err?.message === "string" && err.message.trim()) return err.message;
	return fallback;
};

function EditCrdrTemplate({ template, onCancel }) {
	const navigate = useNavigate();
	const location = useLocation();
	const templateFromState = location?.state?.template;
	const headerIdFromState = location?.state?.headerId;

	const seed = useMemo(() => {
		const source = template ?? templateFromState ?? {};
		return {
			headerId: source.headerId ?? headerIdFromState ?? null,
			userName: source.userName ?? "POM",
			freightType: source.freightType ?? "",
			agent: source.agent ?? 0,
			agentName: source.agentName ?? "",
			term: source.term ?? 0,
			details:
				Array.isArray(source.details) && source.details.length
					? source.details.map((row, idx) =>
							createDetailRow({ ...row, id: row.id ?? `seed-${idx}` })
						)
					: [createDetailRow({ id: "seed-0" })],
		};
	}, [template, templateFromState, headerIdFromState]);

	const [form, setForm] = useState(seed);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState(null);
	const [success, setSuccess] = useState(null);

	const updateHeader = (field, value) => {
		setForm((prev) => ({ ...prev, [field]: value }));
	};

	const updateDetail = (index, field, value) => {
		setForm((prev) => {
			const next = Array.isArray(prev.details) ? [...prev.details] : [];
			next[index] = { ...(next[index] || {}), [field]: value };
			return { ...prev, details: next };
		});
	};

	const addLine = () => {
		setForm((prev) => ({
			...prev,
			details: [...(prev.details || []), createDetailRow()],
		}));
	};

	const addLineIfLast = (index) => {
		setForm((prev) => {
			const next = Array.isArray(prev.details) ? [...prev.details] : [];
			if (index !== next.length - 1) return prev;
			const last = next[index] || {};
			const hasValue =
				String(last.description || "").trim() ||
				toNumberOrZero(last.debit) ||
				toNumberOrZero(last.credit);
			if (!hasValue) return prev;
			next.push(createDetailRow());
			return { ...prev, details: next };
		});
	};

	const removeLine = (index) => {
		setForm((prev) => {
			const next = Array.isArray(prev.details) ? [...prev.details] : [];
			next.splice(index, 1);
			return { ...prev, details: next.length ? next : [createDetailRow()] };
		});
	};

	const submit = async () => {
		setError(null);
		setSuccess(null);

		if (!form.headerId) {
			setError("Header ID is required for update.");
			return;
		}
		if (!form.userName) {
			setError("User name is required.");
			return;
		}
		if (!form.agentName) {
			setError("Agent name is required.");
			return;
		}
		if (!form.freightType) {
			setError("Freight type is required.");
			return;
		}

		setSaving(true);
		try {
			const payload = {
				headerId: form.headerId,
				userName: String(form.userName || "").trim(),
				freightType: String(form.freightType || "").trim(),
				agent: toNumberOrZero(form.agent),
				agentName: String(form.agentName || "").trim(),
				term: toNumberOrZero(form.term),
				details: (form.details || [])
					.map((d) => ({
						detailId: toValidDetailId(d.detailId ?? d.id),
						code: "",
						description: String(d.description || "").trim(),
						revenue: 0,
						cost: 0,
						ppcc: "",
						debit: toNumberOrZero(d.debit),
						credit: toNumberOrZero(d.credit),
						pShare: "0",
						pShareField: "0",
					}))
					.filter((d) => !(toNumberOrZero(d.debit) === 0 && toNumberOrZero(d.credit) === 0)),
			};

			const response = await updateCrdrTemplate(payload);
			if (response?.success === false) {
				throw new Error(response?.message || "Failed to update CRDR template");
			}

			setSuccess(response?.message || "Template updated successfully.");
			if (typeof onCancel === "function") onCancel();
			else navigate("/crdr-templates");
		} catch (err) {
			setError(getErrorMessage(err, "Failed to update CRDR template"));
		} finally {
			setSaving(false);
		}
	};

	const cancel = () => {
		if (typeof onCancel === "function") return onCancel();
		navigate("/crdr-templates");
	};

	return (
		<div className="edit-crdr-template-page">
			<section className="panel edit-crdr-template-hero">
				<div>
					<p className="eyebrow">CRDR TEMPLATE</p>
					<h2>Edit CRDR Template</h2>
					<p>Update template header and detail lines.</p>
				</div>
				<div className="hero-meta">
					<span>Header ID: {form.headerId ?? "—"}</span>
					<span>Agent: {form.agentName || "—"}</span>
				</div>
			</section>

			<section className="panel">
				<h3 style={{ marginTop: 0 }}>Header</h3>
				{error && <div className="error-row">{error}</div>}
				{success && <div className="success-row">{success}</div>}
				<div className="form-grid">
					<label className="field">
						<span>Header ID</span>
						<input value={form.headerId ?? ""} readOnly />
					</label>
					<label className="field">
						<span>User Name</span>
						<input
							value={form.userName}
							onChange={(e) => updateHeader("userName", e.target.value)}
						/>
					</label>
					<label className="field">
						<span>Freight Type</span>
						<input
							value={form.freightType}
							onChange={(e) => updateHeader("freightType", e.target.value)}
						/>
					</label>
					<label className="field">
						<span>Agent ID</span>
						<input
							type="number"
							value={form.agent}
							onChange={(e) => updateHeader("agent", e.target.value)}
						/>
					</label>
					<label className="field">
						<span>Agent Name</span>
						<input
							value={form.agentName}
							onChange={(e) => updateHeader("agentName", e.target.value)}
						/>
					</label>
					<label className="field">
						<span>Term</span>
						<input
							type="number"
							value={form.term}
							onChange={(e) => updateHeader("term", e.target.value)}
						/>
					</label>
				</div>
			</section>

			<section className="panel">
				<div className="details-header">
					<div>
						<h3 style={{ marginTop: 0 }}>Details</h3>
						<p style={{ margin: 0, opacity: 0.7 }}>Edit line item description, debit, and credit.</p>
					</div>
					<button type="button" className="btn outline" onClick={addLine}>
						+ Add line
					</button>
				</div>

				<div className="table-wrapper">
					<table className="templates-table">
						<thead>
							<tr>
								<th style={{ width: "52px", textAlign: "center" }}>#</th>
								<th>Description</th>
								<th style={{ textAlign: "right" }}>Debit</th>
								<th style={{ textAlign: "right" }}>Credit</th>
								<th style={{ textAlign: "center" }}>Action</th>
							</tr>
						</thead>
						<tbody>
							{(form.details || []).map((row, idx) => (
								<tr key={row.id ?? idx}>
									<td style={{ textAlign: "center", color: "#64748b" }}>{idx + 1}</td>
									<td>
										<input
											value={row.description ?? ""}
											onChange={(e) => updateDetail(idx, "description", e.target.value)}
											onBlur={() => addLineIfLast(idx)}
										/>
									</td>
									<td>
										<input
											type="number"
											value={row.debit ?? 0}
											onChange={(e) => updateDetail(idx, "debit", e.target.value)}
											onBlur={() => addLineIfLast(idx)}
										/>
									</td>
									<td>
										<input
											type="number"
											value={row.credit ?? 0}
											onChange={(e) => updateDetail(idx, "credit", e.target.value)}
											onBlur={() => addLineIfLast(idx)}
										/>
									</td>
									<td style={{ textAlign: "center" }}>
										<button
											type="button"
											className="btn danger"
											onClick={() => removeLine(idx)}
											disabled={(form.details || []).length <= 1}
										>
											Remove
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
					<p className="detail-hint">A new row is added automatically when you fill the last line.</p>
				</div>
			</section>

			<section className="panel action-row">
				<button type="button" className="btn ghost" onClick={cancel}>
					Cancel
				</button>
				<button type="button" className="btn primary" onClick={submit} disabled={saving}>
					{saving ? "Saving…" : "Update Template"}
				</button>
			</section>
		</div>
	);
}

export default EditCrdrTemplate;
