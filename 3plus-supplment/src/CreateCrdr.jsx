import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSelector } from "react-redux";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import "./CreateCrdr.css";
import { searchAgentCompaniesByName } from "./api/agentCompanies";
import { getCrdrByRefNumber, saveCrdr } from "./api/crdrs";
import { getCrdrTemplateByAgentId } from "./api/ListCrdrTemplate";
import { selectAuth } from "./store/slices/authSlice";

const DatePickerPopperContainer = ({ children }) => {
	if (typeof document === "undefined") return children;
	return createPortal(children, document.body);
};

const toNumber = (value) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
};

const createLine = (overrides = {}) => ({
	id: overrides.id ?? `line-${Date.now()}-${Math.random().toString(16).slice(2)}`,
	description: overrides.description ?? "",
	debit: overrides.debit ?? 0,
	credit: overrides.credit ?? 0,
});

const getTemplateOptionKey = (template, fallback = "") => {
	if (!template || typeof template !== "object") return String(fallback);
	return String(
		template.headerId ??
			template.HeaderId ??
			template.name ??
			template.templateName ??
			fallback
	);
};

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
		const message =
			data.message || data.error || data.title || data.detail || data.msg;
		if (typeof message === "string" && message.trim()) return message.trim();
	}
	if (typeof err?.message === "string" && err.message.trim()) return err.message;
	return fallback;
};

const getCrdrNumberFromResponse = (response, fallback) => {
	const data = parseMaybeJson(response?.data ?? response);
	const text = typeof data === "string" ? data.trim() : "";
	if (text) {
		const match = text.match(/CRDR\s*(?:No\.?|#|Number)?\s*[:\-\s]*([A-Za-z0-9\-]+)/i);
		if (match?.[1]) return match[1].trim();
	}
	const candidates = [
		data?.fCrDbNo,
		data?.crdrNo,
		data?.crdrNumber,
		data?.crdbNo,
		data?.getCrdrDto?.fCrDbNo,
		data?.result?.fCrDbNo,
		data?.data?.fCrDbNo,
		data?.data?.crdrNo,
		fallback,
	];
	const found = candidates.find((val) => typeof val === "string" && val.trim());
	return found ? found.trim() : "";
};

function CreateCrdr({ initialData = {}, title = "Create CRDR", onCancel = null }) {
	const auth = useSelector(selectAuth);
	const currentUser = auth?.user ?? null;
	const userIdForPayload =
		currentUser?.userId ??
		currentUser?.userID ??
		currentUser?.UserId ??
		currentUser?.UserID ??
		currentUser?.id ??
		currentUser?.Id ??
		"";

	const parseDate = (value) => {
		if (!value) return null;k
		const date = value instanceof Date ? value : new Date(value);
		return Number.isNaN(date.getTime()) ? null : date;
	};

	const [agent, setAgent] = useState(initialData?.agent ?? "");
	const [agentId, setAgentId] = useState(initialData?.agentId ?? null);
	const [templateName, setTemplateName] = useState(initialData?.templateName ?? "");
	const [templateKey, setTemplateKey] = useState(
		initialData?.templateHeaderId ?? initialData?.headerId ?? initialData?.templateName ?? ""
	);
	const [templateOptions, setTemplateOptions] = useState([]);
	const agentInputRef = useRef(null);
	const agentDebounce = useRef(null);
	const [agentAc, setAgentAc] = useState({
		list: [],
		index: -1,
		visible: false,
		loading: false,
		query: "",
	});
	const [agentAcStyle, setAgentAcStyle] = useState(null);
	const [refSearchTerm, setRefSearchTerm] = useState(initialData?.ref ?? "");
	const [selectedBL, setSelectedBL] = useState(initialData?.bl ?? "");
	const [blList, setBlList] = useState(
		Array.isArray(initialData?.blList) ? initialData.blList : []
	);
	const [refLookupError, setRefLookupError] = useState(null);
	const [refSearching, setRefSearching] = useState(false);
	const [refPayload, setRefPayload] = useState(null);
	const [templateError, setTemplateError] = useState(null);
	const [templateLoading, setTemplateLoading] = useState(false);
	const [saveError, setSaveError] = useState(null);
	const [saveSuccess, setSaveSuccess] = useState(null);
	const [saveLoading, setSaveLoading] = useState(false);
	const [invoicePostDate, setInvoicePostDate] = useState(
		parseDate(initialData?.invoicePostDate) ?? new Date()
	);
	const [invoiceDate, setInvoiceDate] = useState(
		parseDate(initialData?.invoiceDate) ?? new Date()
	);
	const [dueDate, setDueDate] = useState(parseDate(initialData?.dueDate) ?? null);
	const [netTerm, setNetTerm] = useState(() => {
		if (initialData?.netTerm === 0) return 0;
		if (initialData?.netTerm) return Number(initialData.netTerm) || 0;
		return "";
	});
	const [crdrNumber, setCrdrNumber] = useState(
		initialData?.crdrNo ?? initialData?.crdrNumber ?? ""
	);

	const [items, setItems] = useState(() => {
		if (Array.isArray(initialData?.items) && initialData.items.length) {
			return initialData.items.map((row, idx) =>
				createLine({
					id: row.id ?? `seed-${idx}`,
					description: row.description ?? row.fDescription ?? "",
					debit: row.debit ?? row.fDebit ?? 0,
					credit: row.credit ?? row.fCredit ?? 0,
				})
			);
		}
		return [createLine({ id: "seed-0" })];
	});

	const updateItem = (id, field, value) => {
		setItems((prev) =>
			prev.map((it) => (it.id === id ? { ...it, [field]: value } : it))
		);
	};

	const addItem = () => {
		const next = createLine();
		setItems((prev) => [...prev, next]);
	};

	const removeItem = (id) => {
		setItems((prev) => {
			if (prev.length <= 1) return prev;
			return prev.filter((it) => it.id !== id);
		});
	};

	const itemAmount = (it) => toNumber(it.debit) - toNumber(it.credit);

	const subtotal = useMemo(
		() => items.reduce((sum, it) => sum + itemAmount(it), 0),
		[items]
	);

	const lineStats = useMemo(() => {
		const ready = items.filter(
			(it) => it.description && (toNumber(it.debit) || toNumber(it.credit))
		).length;
		return {
			total: items.length,
			ready,
			pending: Math.max(items.length - ready, 0),
		};
	}, [items]);

	const resetCrdrForm = useCallback(() => {
		setAgent("");
		setAgentId(null);
		setTemplateName("");
		setTemplateKey("");
		setTemplateOptions([]);
		setTemplateError(null);
		setNetTerm("");
		setDueDate(null);
		setCrdrNumber("");
		setItems([createLine({ id: "seed-0" })]);
	}, []);

	const internalCancel = () => {
		if (typeof onCancel === "function") return onCancel();
		if (typeof window !== "undefined" && window.history?.length) {
			window.history.back();
		}
	};

	const handleSave = () => {
		const toDateString = (value) => {
			if (!value) return null;
			const date = value instanceof Date ? value : new Date(value);
			if (Number.isNaN(date.getTime())) return null;
			const pad = (n) => String(n).padStart(2, "0");
			return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T00:00:00`;
		};

		const buildPayload = () => {
			const master = refPayload?.tOIMMainDto ?? null;
			const houses = Array.isArray(refPayload?.tOIHMainDtos)
				? refPayload.tOIHMainDtos
				: [];
			const selected = (selectedBL || "").toString().trim();
			const match = houses.find(
				(row) => (row?.fHblno || "").toString().trim() === selected
			);

			const target = match || houses[0] || null;
			const tbName = target ? "T_OIHMAIN" : master ? "T_OIMMAIN" : "T_OIHMAIN";
			const tBid = target?.fId ?? master?.fId ?? 0;

			const now = new Date();
			const details = items.map((it) => ({
				fStbName: tbName,
				fStbid: tBid,
				fCrdbcode: (it.description || "CRDR").toString().trim() || "CRDR",
				fDescription: (it.description || "").toString(),
				fRevenue: 0,
				fCost: 0,
				fPpcc: "",
				fDebit: toNumber(it.debit),
				fCredit: toNumber(it.credit),
				fPshare: "",
				fPshareField: "",
			}));

			return {
				tOIMMainDto: master,
				tOIHMainDtos: houses,
				tCompany: refPayload?.tCompany ?? null,
				getCrdrDto: {
					fTbName: tbName,
					fTbid: tBid,
					fAgent: agentId ?? master?.fAgent ?? 0,
					fPostDate: toDateString(invoicePostDate) ?? toDateString(now),
					fSettled: "0",
					fCurrency: "USD",
					fCrDbNo: (crdrNumber || "").toString(),
					fInvoiceDate: toDateString(invoiceDate) ?? toDateString(now),
					fTerms: netTerm === "" ? 0 : Number(netTerm) || 0,
					fDueDate: toDateString(dueDate),
					fTotal: subtotal,
					fPaidAmt: 0,
					fCheckNo: "",
					fPaidDate: null,
					fProfitShare: 0,
					fNotShow: "0",
					fU1id: userIdForPayload,
					fU1date: toDateString(now),
					fU2id: userIdForPayload,
					fU2date: toDateString(now),
					fMultiNameId: 0,
					fYourRef: "",
					fBranchdb: "",
					fBranchcrdbid: 0,
					details,
				},
			};
		};

		if (!selectedBL || !selectedBL.toString().trim()) {
			setSaveError("Select a BL before saving.");
			setSaveSuccess(null);
			return;
		}
		if (!refPayload) {
			setSaveError("Search a reference number before saving.");
			setSaveSuccess(null);
			return;
		}

		setSaveError(null);
		setSaveSuccess(null);
		setSaveLoading(true);

		(async () => {
			try {
				const payload = buildPayload();
				const response = await saveCrdr(payload, { userId: userIdForPayload });
				const numberFromResponse = getCrdrNumberFromResponse(
					response,
					payload?.getCrdrDto?.fCrDbNo || crdrNumber
				);
				const baseMessage = response?.message || "CRDR saved successfully.";
				const hasNumber =
					numberFromResponse &&
					String(baseMessage).includes(String(numberFromResponse));
				const suffix = !hasNumber && numberFromResponse
					? ` CRDR No: ${numberFromResponse}`
					: "";
				setSaveSuccess(`${baseMessage}${suffix}`.trim());
			} catch (err) {
				setSaveError(getErrorMessage(err, "Unable to save CRDR."));
			} finally {
				setSaveLoading(false);
			}
		})();
	};

	const handleAutoPopulateHeader = () => {
		const baseDate = invoiceDate instanceof Date ? invoiceDate : new Date();
		if (!netTerm && netTerm !== 0) {
			setNetTerm(30);
			const due = new Date(baseDate);
			due.setDate(due.getDate() + 30);
			setDueDate(due);
		} else if (Number.isFinite(Number(netTerm)) && !dueDate) {
			const term = Number(netTerm) || 0;
			const due = new Date(baseDate);
			due.setDate(due.getDate() + term);
			setDueDate(due);
		}

		if (!crdrNumber) {
			const seed = (refSearchTerm || selectedBL || "CRDR").toString().trim();
			const compact = seed.replace(/[^a-zA-Z0-9-]/g, "");
			setCrdrNumber(compact ? `CRDR-${compact}` : `CRDR-${Date.now()}`);
		}
	};

	useEffect(() => {
		return () => {
			if (agentDebounce.current) {
				clearTimeout(agentDebounce.current);
				agentDebounce.current = null;
			}
		};
	}, []);

	const updateAgentAcStyle = useCallback(() => {
		const node = agentInputRef.current;
		if (!node) return;
		const rect = node.getBoundingClientRect();
		const margin = 12;
		const preferredWidth = 420;

		let width = Math.min(preferredWidth, window.innerWidth - margin * 2);
		width = Math.max(260, width);

		let left = rect.left;
		if (left + width > window.innerWidth - margin) {
			left = Math.max(margin, window.innerWidth - margin - width);
		}

		const top = rect.bottom + 6;
		const maxHeight = Math.max(140, Math.min(260, window.innerHeight - top - margin));

		setAgentAcStyle({
			position: "fixed",
			top,
			left,
			width,
			maxHeight,
			zIndex: 3000,
		});
	}, []);

	useEffect(() => {
		if (!agentAc.visible) return;
		updateAgentAcStyle();
		const handle = () => updateAgentAcStyle();
		window.addEventListener("scroll", handle, true);
		window.addEventListener("resize", handle);
		return () => {
			window.removeEventListener("scroll", handle, true);
			window.removeEventListener("resize", handle);
		};
	}, [agentAc.visible, updateAgentAcStyle]);

	const selectAgent = (company) => {
		if (!company) return;
		setAgent(company.companyName ?? "");
		setAgentId(company.companyId ?? null);
		setTemplateOptions([]);
		setTemplateKey("");
		setTemplateName("");
		setAgentAc({ list: [], index: -1, visible: false, loading: false, query: "" });
	};

	const handleAgentChange = (value) => {
		setAgent(value);
		setAgentId(null);
		setTemplateOptions([]);
		setTemplateKey("");
		setTemplateName("");

		const query = String(value ?? "").trim();
		if (agentDebounce.current) {
			clearTimeout(agentDebounce.current);
			agentDebounce.current = null;
		}

		if (!query) {
			setAgentAc({ list: [], index: -1, visible: false, loading: false, query: "" });
			return;
		}

		if (query.length < 2) {
			setAgentAc({ list: [], index: -1, visible: false, loading: false, query });
			return;
		}

		setAgentAc((s) => ({ ...s, loading: true, visible: true, query }));
		agentDebounce.current = setTimeout(async () => {
			const list = await searchAgentCompaniesByName(query);
			const limited = Array.isArray(list) ? list.slice(0, 5) : [];
			if (!limited.length) {
				setAgentAc({
					list: [{ companyId: "__empty", companyName: "No matches", disabled: true }],
					index: 0,
					visible: true,
					loading: false,
					query,
				});
			} else {
				setAgentAc({ list: limited, index: 0, visible: true, loading: false, query });
			}
			agentDebounce.current = null;
		}, 250);
	};

	const handleRefChange = (value) => {
		setRefSearchTerm(value);
	};

	const handleBlChange = (value) => {
		setSelectedBL(value);
		setNetTerm("");
		setDueDate(null);
		setCrdrNumber("");
		setTemplateOptions([]);
		setTemplateKey("");
		setTemplateName("");
		setItems([createLine({ id: "seed-0" })]);
	};

	const applyTemplate = useCallback(
		(template) => {
			if (!template || typeof template !== "object") return;

			const resolvedTemplateName =
				template.name ?? template.templateName ?? template.userName ?? "";
			setTemplateName(String(resolvedTemplateName));
			setTemplateKey(getTemplateOptionKey(template));

			if (template.agentName) setAgent(template.agentName);
			if (template.agent) setAgentId(template.agent);

			if (template.term !== undefined && template.term !== null) {
				const termValue = Number(template.term) || 0;
				setNetTerm(termValue);
				const baseDate =
					invoiceDate instanceof Date
						? invoiceDate
						: new Date(invoiceDate || Date.now());
				const due = new Date(baseDate);
				due.setDate(due.getDate() + termValue);
				setDueDate(due);
			}

			if (Array.isArray(template.details) && template.details.length) {
				setItems(
					template.details.map((row, idx) =>
						createLine({
							id: row.detailId ?? `tpl-${idx}`,
							description: row.description ?? "",
							debit: row.debit ?? 0,
							credit: row.credit ?? 0,
						})
					)
				);
			}
		},
		[invoiceDate]
	);

	const handleTemplateChange = (value) => {
		setTemplateKey(value);
		const selectedTemplate = templateOptions.find(
			(template, idx) => getTemplateOptionKey(template, idx) === value
		);
		if (!selectedTemplate) {
			setTemplateName("");
			return;
		}
		applyTemplate(selectedTemplate);
	};

	const doRefSearch = async (event) => {
		if (event && event.preventDefault) event.preventDefault();
		const query = (refSearchTerm || "").trim();
		if (!query) {
			setRefLookupError("Reference number is required");
			setBlList([]);
			setSelectedBL("");
			setRefPayload(null);
			resetCrdrForm();
			return;
		}

		setRefLookupError(null);
		setRefSearching(true);
		try {
			const response = await getCrdrByRefNumber(query);
			const payload = response?.data ?? response;
			const master = payload?.tOIMMainDto ?? null;
			const houses = Array.isArray(payload?.tOIHMainDtos) ? payload.tOIHMainDtos : [];

			if (!master && !houses.length) {
				setBlList([]);
				setSelectedBL("");
				setRefPayload(null);
				resetCrdrForm();
				setRefLookupError("CRDR not found.");
				return;
			}

			setRefPayload(payload || null);

			const mbl = (master?.fMblno || "").toString().trim();
			const hbls = houses
				.map((row) => (row?.fHblno || "").toString().trim())
				.filter(Boolean);

			const list = [mbl, ...hbls].filter(Boolean);
			const preferredBl = hbls[0] || mbl || "";

			setBlList(list);
			setSelectedBL(preferredBl);

			const company = payload?.tCompany ?? null;
			const agentName =
				(company?.fSname || company?.fFname || "").toString().trim();
			const agentIdValue = company?.fId ?? master?.fAgent ?? null;
			if (agentName) setAgent(agentName);
			if (agentIdValue !== null && agentIdValue !== undefined) setAgentId(agentIdValue);
			if (!list.length) {
				setRefLookupError("No BL information returned for this reference.");
			}
		} catch (err) {
			setBlList([]);
			setSelectedBL("");
			setRefPayload(null);
			resetCrdrForm();
			setRefLookupError(getErrorMessage(err, "Unable to load CRDR details"));
		} finally {
			setRefSearching(false);
		}
	};

	useEffect(() => {
		if (!selectedBL || !agentId) return;
		let active = true;
		setTemplateError(null);
		setTemplateLoading(true);

		(async () => {
			try {
				const templates = await getCrdrTemplateByAgentId(agentId);
				if (!active) return;
				const nextTemplates = Array.isArray(templates) ? templates : [];
				setTemplateOptions(nextTemplates);
				const template = nextTemplates.length
					? nextTemplates.find(
						(item, idx) => getTemplateOptionKey(item, idx) === String(templateKey)
					) ??
					  nextTemplates.find(
						(item) =>
							String(item?.name ?? item?.templateName ?? "") === String(templateName)
					  ) ??
					  nextTemplates[0]
					: null;
				if (!template) {
					setTemplateKey("");
					setTemplateName("");
					setItems([createLine({ id: "seed-0" })]);
					setTemplateError("No CRDR template found for this agent.");
					return;
				}

				applyTemplate(template);
			} catch (err) {
				if (!active) return;
				setTemplateOptions([]);
				setTemplateKey("");
				setTemplateName("");
				setItems([createLine({ id: "seed-0" })]);
				setTemplateError(
					getErrorMessage(err, "Unable to load CRDR template for this agent.")
				);
			} finally {
				if (active) setTemplateLoading(false);
			}
		})();

		return () => {
			active = false;
		};
	}, [selectedBL, agentId, templateKey, templateName, applyTemplate]);

	const isSaveDisabled =
		saveLoading || !selectedBL || !selectedBL.toString().trim();

	return (
		<div className="create-invoice-page">
			<section className="panel invoice-hero">
				<div className="hero-copy">
					<p className="eyebrow">CRDR</p>
					<h2>{title}</h2>
					<p>Compose CRDR header details and line items.</p>
				</div>
			</section>

			<section className="panel ref-panel">
				<header className="panel-heading">
					<div>
						<h3>Reference & BL lookup</h3>
					</div>
				</header>
				<form className="ref-grid" onSubmit={doRefSearch} autoComplete="off">
					<label className="field span-2">
						<span>Reference number</span>
						<div className="ref-input-row">
							<input
								className="input-control"
								placeholder="Search by reference"
								autoComplete="off"
								autoCorrect="off"
								autoCapitalize="off"
								spellCheck={false}
								value={refSearchTerm}
								onChange={(e) => handleRefChange(e.target.value)}
							/>
							<button className="btn primary" type="submit" disabled={refSearching}>
								{refSearching ? "Searching…" : "Search"}
							</button>
						</div>
					</label>
					<label className="field">
						<span>BL number</span>
						<select
							className="input-control"
							value={selectedBL || ""}
							onChange={(e) => handleBlChange(e.target.value)}
						>
							<option value="">Select BL</option>
							{blList.map((b) => (
								<option key={b} value={b}>
									{b}
								</option>
							))}
						</select>
					</label>
				</form>
				{refLookupError && <div className="inline-error">{refLookupError}</div>}
			</section>

			<section className="panel header-panel">
				<div className="panel-heading">
					<div>
						<h3>Header</h3>
						<p>Update agent, dates, and CRDR number.</p>
					</div>
					<button
						type="button"
						className="btn outline"
						onClick={handleAutoPopulateHeader}
					>
						Auto Populate
					</button>
				</div>
				{templateError && <div className="inline-error">{templateError}</div>}
				{templateLoading && (
					<div className="inline-error">Loading CRDR template…</div>
				)}

				<div className="form-grid">
					<div className="field">
						<label>Template Name</label>
						<select
							className="input-control"
							value={templateKey}
							onChange={(e) => handleTemplateChange(e.target.value)}
							disabled={templateLoading || !templateOptions.length}
						>
							<option value="">
								{templateLoading
									? "Loading templates..."
									: templateOptions.length
										? "Select template"
										: "No templates available"}
							</option>
							{templateOptions.map((template, idx) => {
								const optionKey = getTemplateOptionKey(template, idx);
								const optionLabel =
									template?.name ?? template?.templateName ?? `Template ${idx + 1}`;
								return (
									<option key={optionKey} value={optionKey}>
										{optionLabel}
									</option>
								);
							})}
						</select>
					</div>

					<div className="field">
						<label>Agent</label>
						<div className="ac-wrap">
							<input
								className="input-control"
								type="text"
								autoComplete="off"
								spellCheck={false}
								placeholder="Enter agent name"
								value={agent}
								onChange={(e) => handleAgentChange(e.target.value)}
								onFocus={() => {
									if (agentAc.list?.length) setAgentAc((s) => ({ ...s, visible: true }));
								}}
								onBlur={() => {
									window.setTimeout(
										() => setAgentAc((s) => ({ ...s, visible: false })),
										150
									);
								}}
								onKeyDown={(e) => {
									if (!agentAc.visible) return;
									if (e.key === "Escape") {
										e.preventDefault();
										setAgentAc((s) => ({ ...s, visible: false }));
										return;
									}
									if (e.key === "ArrowDown") {
										e.preventDefault();
										setAgentAc((s) => ({
											...s,
											index: Math.min((s.list?.length ?? 1) - 1, (s.index ?? -1) + 1),
										}));
										return;
									}
									if (e.key === "ArrowUp") {
										e.preventDefault();
										setAgentAc((s) => ({
											...s,
											index: Math.max(0, (s.index ?? 0) - 1),
										}));
										return;
									}
									if (e.key === "Enter") {
										const sel = agentAc.list?.[agentAc.index];
										if (sel && !sel.disabled) {
											e.preventDefault();
											selectAgent(sel);
										}
									}
								}}
								ref={agentInputRef}
							/>
							{agentId && (
								<span className="customer-id-chip">ID #{agentId}</span>
							)}
							{agentAc.visible && typeof document !== "undefined" &&
								createPortal(
									<ul
										className="ac-list ac-list-portal"
										role="listbox"
										style={agentAcStyle || undefined}
									>
										{agentAc.list.map((opt, idx) => {
											const disabled = Boolean(opt?.disabled || opt?.companyId === "__empty");
											return (
												<li
													key={opt.companyId ?? `${opt.companyName}-${idx}`}
													className={`${idx === agentAc.index ? "active" : ""} ${disabled ? "disabled" : ""}`.trim()}
													onMouseDown={(ev) => {
														if (disabled) return;
														ev.preventDefault();
														selectAgent(opt);
													}}
													role="option"
													aria-selected={idx === agentAc.index}
													aria-disabled={disabled}
												>
													{opt.companyName}
												</li>
											);
										})}
									</ul>,
									document.body
								)}
						</div>
					</div>

					<div className="field">
						<label>Invoice Post Date</label>
						<DatePicker
							className="input-control"
							selected={invoicePostDate}
							onChange={(d) => setInvoicePostDate(d)}
							dateFormat="yyyy-MM-dd"
							popperContainer={DatePickerPopperContainer}
							popperClassName="datepicker-popper-portal"
						/>
					</div>

					<div className="field">
						<label>Invoice Date</label>
						<DatePicker
							className="input-control"
							selected={invoiceDate}
							onChange={(d) => setInvoiceDate(d)}
							dateFormat="yyyy-MM-dd"
							popperContainer={DatePickerPopperContainer}
							popperClassName="datepicker-popper-portal"
						/>
					</div>

					<div className="field">
						<label>Term (days)</label>
						<input
							type="number"
							className="input-control"
							value={netTerm}
							min={0}
							onChange={(e) => {
								const raw = e.target.value;
								if (raw === "") {
									setNetTerm("");
									setDueDate(null);
									return;
								}
								const value = Number(raw);
								if (Number.isNaN(value)) return;
								setNetTerm(value);
								const baseDate =
									invoiceDate instanceof Date
										? invoiceDate
										: new Date(invoiceDate || Date.now());
								const due = new Date(baseDate);
								due.setDate(due.getDate() + value);
								setDueDate(due);
							}}
						/>
					</div>

					<div className="field">
						<label>Due Date</label>
						<DatePicker
							className="input-control"
							selected={dueDate}
							onChange={(d) => setDueDate(d)}
							dateFormat="yyyy-MM-dd"
							popperContainer={DatePickerPopperContainer}
							popperClassName="datepicker-popper-portal"
						/>
					</div>

				</div>
			</section>

			<section className="panel line-panel">
				<header className="panel-heading">
					<div>
						<h3>CRDR Items</h3>
					</div>
					<div style={{ display: "flex", gap: "0.5rem" }}>
						<button type="button" className="btn outline" onClick={addItem}>
							+ Add line
						</button>
					</div>
				</header>

				<div className="line-table-wrapper">
					<table className="line-table">
						<thead>
							<tr>
								<th>Description</th>
								<th>Debit</th>
								<th>Credit</th>
								<th>Amount</th>
							</tr>
						</thead>
						<tbody>
							{items.map((it) => (
								<tr key={it.id}>
									<td>
										<input
											value={it.description}
											onChange={(e) =>
												updateItem(it.id, "description", e.target.value)
											}
											placeholder="Description"
										/>
									</td>
									<td>
										<input
											type="number"
											value={it.debit}
											onChange={(e) => updateItem(it.id, "debit", e.target.value)}
										/>
									</td>
									<td>
										<input
											type="number"
											value={it.credit}
											onChange={(e) => updateItem(it.id, "credit", e.target.value)}
										/>
									</td>
									<td className="right">
										<div
											style={{
												display: "flex",
												alignItems: "center",
												gap: "0.5rem",
												justifyContent: "flex-end",
											}}
										>
											<span>{itemAmount(it).toFixed(2)}</span>
											<button
												type="button"
												className="btn danger ghost"
												onClick={() => removeItem(it.id)}
												disabled={items.length === 1}
												title={
													items.length === 1
														? "At least one line item is required"
														: "Remove this line"
												}
											>
												Remove
											</button>
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>

				<div className="line-footer">
					<div className="line-metrics" />
					<div className="subtotal-card">
						<p>Total</p>
						<strong>${subtotal.toFixed(2)}</strong>
					</div>
				</div>

				<div className="action-row">
					<button type="button" className="btn ghost" onClick={internalCancel}>
						Cancel
					</button>
					<button
						className="btn primary"
						type="button"
						onClick={handleSave}
						disabled={isSaveDisabled}
						title={isSaveDisabled ? "Select a BL before saving" : ""}
					>
						{saveLoading ? "Saving…" : "Save CRDR"}
					</button>
				</div>
				{saveError && <div className="inline-error">{saveError}</div>}
				{saveSuccess && <div className="inline-success">{saveSuccess}</div>}
			</section>
		</div>
	);
}

export default CreateCrdr;
