import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "./EditCrdr.css";
import { getCrdrById } from "./api/crdrs";

const createDetailRow = (overrides = {}) => ({
	id: overrides.id ?? `detail-${Date.now()}-${Math.random().toString(16).slice(2)}`,
	fDescription: overrides.fDescription ?? "",
	fDebit: overrides.fDebit ?? 0,
	fCredit: overrides.fCredit ?? 0,
});

const toNumberOrZero = (value) => {
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
};

const toDateInputValue = (value) => {
	if (!value) return "";
	const d = new Date(value);
	if (Number.isNaN(d.getTime())) return "";
	return d.toISOString().split("T")[0];
};

function EditCrdr() {
	const { id } = useParams();
	const navigate = useNavigate();
	const [form, setForm] = useState(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(null);

	useEffect(() => {
		let active = true;
		const load = async () => {
			setLoading(true);
			setError(null);
			try {
				const resp = await getCrdrById(id);
				const data = resp?.data ?? resp;
				if (!active) return;

				const next = {
					fId: data?.fId ?? id,
					fCrDbNo: data?.fCrDbNo ?? "",
					fsName: data?.fsName ?? "",
					fPostDate: toDateInputValue(data?.fPostDate),
					fInvoiceDate: toDateInputValue(data?.fInvoiceDate),
					fDueDate: toDateInputValue(data?.fDueDate),
					fTotal: data?.fTotal ?? 0,
					details: Array.isArray(data?.details)
						? data.details.map((d, idx) =>
								createDetailRow({
									id: d?.id ?? `seed-${idx}`,
									fDescription: d?.fDescription ?? d?.description ?? "",
									fDebit: d?.fDebit ?? d?.debit ?? 0,
									fCredit: d?.fCredit ?? d?.credit ?? 0,
								})
							)
						: [createDetailRow()],
				};

				setForm(next);
			} catch (err) {
				if (!active) return;
				setError(err?.message || "Failed to load CRDR");
			} finally {
				if (active) setLoading(false);
			}
		};

		if (id) load();
		else setError("CRDR id is required");

		return () => {
			active = false;
		};
	}, [id]);

	const updateHeader = (field, value) => {
		setForm((prev) => ({ ...prev, [field]: value }));
	};

	const updateDetail = (index, field, value) => {
		setForm((prev) => {
			const next = Array.isArray(prev?.details) ? [...prev.details] : [];
			next[index] = { ...(next[index] || {}), [field]: value };
			return { ...prev, details: next };
		});
	};

	const removeDetail = (index) => {
		setForm((prev) => {
			const next = Array.isArray(prev?.details) ? prev.details.filter((_, i) => i !== index) : [];
			return { ...prev, details: next.length ? next : [createDetailRow()] };
		});
	};

	const totals = useMemo(() => {
		const lines = Array.isArray(form?.details) ? form.details : [];
		const debit = lines.reduce((sum, row) => sum + toNumberOrZero(row.fDebit), 0);
		const credit = lines.reduce((sum, row) => sum + toNumberOrZero(row.fCredit), 0);
		return { debit, credit };
	}, [form?.details]);

	const handleSave = () => {
		window.alert("Save not implemented yet.");
	};

	if (loading) {
		return (
			<div className="edit-crdr-page">
				<section className="panel">Loading CRDR…</section>
			</div>
		);
	}

	if (error) {
		return (
			<div className="edit-crdr-page">
				<section className="panel error-row">{error}</section>
			</div>
		);
	}

	if (!form) {
		return (
			<div className="edit-crdr-page">
				<section className="panel">No CRDR loaded.</section>
			</div>
		);
	}

	return (
		<div className="edit-crdr-page">
			<section className="panel edit-crdr-hero">
				<div>
					<p className="eyebrow">CRDR</p>
					<h2>Edit CRDR</h2>
					<p>Update header dates and line item amounts.</p>
				</div>
				<div className="hero-meta">
					<span>CRDR No: {form.fCrDbNo || "—"}</span>
					<span>Agent: {form.fsName || "—"}</span>
				</div>
			</section>

			<section className="panel">
				<h3 style={{ marginTop: 0 }}>Header</h3>
				<div className="form-grid">
					<label className="field">
						<span>CRDR No</span>
						<input value={form.fCrDbNo} onChange={(e) => updateHeader("fCrDbNo", e.target.value)} />
					</label>
					<label className="field">
						<span>Agent</span>
						<input value={form.fsName} onChange={(e) => updateHeader("fsName", e.target.value)} />
					</label>
					<label className="field">
						<span>Post Date</span>
						<input
							type="date"
							value={form.fPostDate}
							onChange={(e) => updateHeader("fPostDate", e.target.value)}
						/>
					</label>
					<label className="field">
						<span>Invoice Date</span>
						<input
							type="date"
							value={form.fInvoiceDate}
							onChange={(e) => updateHeader("fInvoiceDate", e.target.value)}
						/>
					</label>
					<label className="field">
						<span>Due Date</span>
						<input
							type="date"
							value={form.fDueDate}
							onChange={(e) => updateHeader("fDueDate", e.target.value)}
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
					<div className="totals">
						<span>Total Debit: {totals.debit}</span>
						<span>Total Credit: {totals.credit}</span>
					</div>
				</div>

				<div className="table-wrapper">
					<table className="templates-table">
						<thead>
							<tr>
								<th>Description</th>
								<th style={{ textAlign: "right" }}>Debit</th>
								<th style={{ textAlign: "right" }}>Credit</th>
								<th style={{ textAlign: "center" }}>Action</th>
							</tr>
						</thead>
						<tbody>
							{(form.details || []).map((row, idx) => (
								<tr key={row.id ?? idx}>
									<td>
										<input
											value={row.fDescription ?? ""}
											onChange={(e) => updateDetail(idx, "fDescription", e.target.value)}
										/>
									</td>
									<td>
										<input
											type="number"
											value={row.fDebit ?? 0}
											onChange={(e) => updateDetail(idx, "fDebit", e.target.value)}
											style={{ textAlign: "right" }}
										/>
									</td>
									<td>
										<input
											type="number"
											value={row.fCredit ?? 0}
											onChange={(e) => updateDetail(idx, "fCredit", e.target.value)}
											style={{ textAlign: "right" }}
										/>
									</td>
									<td style={{ textAlign: "center" }}>
										<button
											type="button"
											className="btn danger ghost"
											onClick={() => removeDetail(idx)}
										>
											Remove
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>

			<section className="panel actions" style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
				<button type="button" className="btn ghost" onClick={() => navigate(-1)}>
					Cancel
				</button>
				<button type="button" className="btn primary" onClick={handleSave}>
					Save
				</button>
			</section>
		</div>
	);
}

export default EditCrdr;
