import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSelector } from "react-redux";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import "./CreateCrdr.css";
import { searchAgentCompaniesByName } from "./api/agentCompanies";
import { extractCrdrDocument, getCrdrByRefNumber, saveCrdr } from "./api/crdrs";
import { PORTAL_API_PATH } from "./api/config";
import { getCrdrTemplateByAgentId } from "./api/ListCrdrTemplate";
import { selectAuth } from "./store/slices/authSlice";

const extractionEnabled = import.meta.env.DEV || (PORTAL_API_PATH && import.meta.env.VITE_CRDR_AI_ENABLED === "true");

const DatePickerPopperContainer = ({ children }) => {
	if (typeof document === "undefined") return children;
	return createPortal(children, document.body);
};

const toNumber = (value) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
};

const parseDocumentDate = (value) => {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) return null;
	const date = new Date(`${value}T00:00:00`);
	if (Number.isNaN(date.getTime())) return null;
	const [year, month, day] = value.split("-").map(Number);
	return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
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
		const match = text.match(/CRDR\s*(?:No\.?|#|Number)?\s*[:\s-]*([A-Za-z0-9-]+)/i);
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
		if (!value) return null;
		const date = value instanceof Date ? value : new Date(value);
		return Number.isNaN(date.getTime()) ? null : date;
	};

	const [agent, setAgent] = useState(initialData?.agent ?? "");
	const [agentId, setAgentId] = useState(initialData?.agentId ?? null);
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
	const [resolvedReference, setResolvedReference] = useState("");
	const [documentFile, setDocumentFile] = useState(null);
	const [documentDraft, setDocumentDraft] = useState(null);
	const [documentError, setDocumentError] = useState(null);
	const [extractingDocument, setExtractingDocument] = useState(false);
	const [preparedSource, setPreparedSource] = useState(null);
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

	const resetCrdrForm = useCallback(() => {
		setAgent("");
		setAgentId(null);
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
		if (isSaveDisabled) return;
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

			const target = match ?? null;
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
					fYourRef: String(target?.fHblno ?? "").trim(),
					fBranchdb: "",
					fBranchcrdbid: 0,
					details,
				},
			};
		};

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
		setAgentAc({ list: [], index: -1, visible: false, loading: false, query: "" });
	};

	const handleAgentChange = (value) => {
		setAgent(value);
		setAgentId(null);
		setTemplateOptions([]);
		setTemplateKey("");

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
		if (preparedSource) return;
		setNetTerm("");
		setDueDate(null);
		setCrdrNumber("");
		setItems([createLine({ id: "seed-0" })]);
	};

	const doRefSearch = async (event) => {
		if (event && event.preventDefault) event.preventDefault();
		if (refSearching || saveLoading) return;
		const query = (refSearchTerm || "").trim();
		setResolvedReference("");
		if (!query) {
			setRefLookupError("Reference number is required");
			setBlList([]);
			setSelectedBL("");
			setRefPayload(null);
			if (!preparedSource) resetCrdrForm();
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
				if (!preparedSource) resetCrdrForm();
				setRefLookupError("CRDR not found.");
				return;
			}

			setRefPayload(payload || null);
			setResolvedReference(query);

			const mbl = (master?.fMblno || "").toString().trim();
			const hbls = houses
				.map((row) => (row?.fHblno || "").toString().trim())
				.filter(Boolean);

			const list = [mbl, ...hbls].filter(Boolean);
			const preferredBl = hbls[0] || mbl || "";

			setBlList([...new Set(list)]);
			setSelectedBL(preparedSource?.reference === query && list.includes(preparedSource.bl)
				? preparedSource.bl : preferredBl);

			const company = payload?.tCompany ?? null;
			const agentName =
				(company?.fSname || company?.fFname || "").toString().trim();
			const agentIdValue = company?.fId ?? master?.fAgent ?? null;
			setAgent(agentName);
			setAgentId(agentIdValue);
			if (!list.length) {
				setRefLookupError("No BL information returned for this reference.");
			}
		} catch (err) {
			setBlList([]);
			setSelectedBL("");
			setRefPayload(null);
			if (!preparedSource) resetCrdrForm();
			setRefLookupError(getErrorMessage(err, "Unable to load CRDR details"));
		} finally {
			setRefSearching(false);
		}
	};

	const hasShipment = Boolean(!refSearching && refPayload && selectedBL &&
		blList.includes(selectedBL) && resolvedReference === refSearchTerm.trim());
	const templateAgentId = hasShipment ? agentId : null;

	useEffect(() => {
		setTemplateOptions([]);
		setTemplateKey("");
		setTemplateError(null);
		if (!templateAgentId) {
			setTemplateLoading(false);
			return;
		}
		let active = true;
		setTemplateLoading(true);

		(async () => {
			try {
				const templates = await getCrdrTemplateByAgentId(templateAgentId);
				if (!active) return;
				const nextTemplates = Array.isArray(templates)
					? templates.filter((template) => Array.isArray(template.details) && template.details.length)
					: [];
				setTemplateOptions(nextTemplates);
				if (nextTemplates.length === 1) setTemplateKey(getTemplateOptionKey(nextTemplates[0], 0));
			} catch (err) {
				if (!active) return;
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
	}, [templateAgentId]);

	const isPrepared = Boolean(hasShipment && preparedSource?.reference === resolvedReference && preparedSource?.bl === selectedBL);
	const prepareSource = (kind, label) => {
		setPreparedSource({ kind, label, reference: resolvedReference, bl: selectedBL });
		setSaveSuccess(null);
		setSaveError(null);
	};

	const selectedTemplate = templateOptions.find((template, index) => getTemplateOptionKey(template, index) === templateKey);
	const populateTemplate = () => {
		if (!hasShipment || !selectedTemplate || templateLoading || saveLoading || extractingDocument) return;
		const term = selectedTemplate.term == null ? "" : Number(selectedTemplate.term) || 0;
		const due = new Date(invoiceDate ?? Date.now());
		if (term !== "") due.setDate(due.getDate() + term);
		setNetTerm(term);
		setDueDate(term === "" ? null : due);
		setItems(selectedTemplate.details.map((row) => createLine(row)));
		setDocumentDraft(null);
		prepareSource("template", selectedTemplate.name ?? selectedTemplate.templateName ?? "Template");
	};
	const draftBlocker = !documentDraft ? "" :
		documentDraft.currency && documentDraft.currency.toUpperCase() !== "USD"
			? "This form saves in USD. Only USD notes can be imported."
			: !hasShipment
				? "Look up the shipment and select its BL before applying the draft."
				: documentDraft.hblNumber && documentDraft.hblNumber.trim().toUpperCase() !== selectedBL.trim().toUpperCase()
					? "Select the HBL shown on the note before applying the draft."
					: "";

	const extractDocument = async () => {
		if (!extractionEnabled || !hasShipment || !documentFile || extractingDocument || saveLoading) return;
		setDocumentError(null);
		if (!documentFile.size || documentFile.size > 10 * 1024 * 1024) {
			setDocumentError("Choose a nonempty file of 10 MB or less.");
			return;
		}
		setDocumentDraft(null);
		setExtractingDocument(true);
		try {
			setDocumentDraft(await extractCrdrDocument(documentFile));
		} catch (err) {
			setDocumentError(getErrorMessage(err, "Unable to extract the note."));
		} finally {
			setExtractingDocument(false);
		}
	};

	const applyDocument = () => {
		if (!documentDraft || draftBlocker || saveLoading) return;
		const issueDate = parseDocumentDate(documentDraft.invoiceDate);
		const paymentDate = parseDocumentDate(documentDraft.dueDate);
		if (issueDate) setInvoiceDate(issueDate);
		setDueDate(paymentDate);
		setNetTerm(issueDate && paymentDate && paymentDate >= issueDate
			? Math.round((paymentDate - issueDate) / 86_400_000)
			: "");
		setItems(documentDraft.lines.map((line) => createLine(line)));
		prepareSource("import", documentDraft.noteNumber || documentFile?.name || "Imported note");
		setDocumentDraft(null);
	};

	const discardPreparedCharges = () => {
		setPreparedSource(null);
		setItems([createLine({ id: "seed-0" })]);
		setDueDate(null);
		setNetTerm("");
		setSaveSuccess(null);
		setSaveError(null);
	};

	const enterManually = () => {
		if (!hasShipment || saveLoading || extractingDocument) return;
		setItems([createLine({ id: "seed-0" })]);
		setInvoiceDate(new Date());
		setDueDate(null);
		setNetTerm("");
		setDocumentDraft(null);
		prepareSource("manual", "Manual entry");
	};

	const isSaveDisabled = saveLoading || extractingDocument || !isPrepared ||
		!items.some((line) => line.description.trim() && (toNumber(line.debit) || toNumber(line.credit)));

	return (
		<div className="create-invoice-page crdr-create-page">
			<section className="panel invoice-hero">
				<div className="hero-copy">
					<p className="eyebrow">CRDR</p>
					<h2>{title}</h2>
					<p>Find the shipment, prepare the charges, and review the credit or debit invoice.</p>
				</div>
			</section>

			<section className="panel ref-panel">
				<header className="panel-heading">
					<div>
						<h3>1. Reference &amp; BL Lookup</h3>
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
								disabled={refSearching || saveLoading}
								onChange={(e) => handleRefChange(e.target.value)}
							/>
							<button className="btn primary" type="submit" disabled={refSearching || saveLoading}>
								{refSearching ? "Searching…" : "Search"}
							</button>
						</div>
					</label>
					<label className="field">
						<span>BL number</span>
						<select
							className="input-control"
							value={selectedBL || ""}
							disabled={refSearching || saveLoading || !blList.length}
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

			<section className="panel crdr-source-panel">
				<header className="panel-heading">
					<div>
						<h3>2. Prepare Charges</h3>
						<p>{hasShipment ? "Choose one source for the invoice charges." : "Find the shipment and select a BL to continue."}</p>
					</div>
				</header>
				<div className="crdr-source-grid">
					<section className="crdr-source-card import-panel">
						<h4>Import Credit/Debit Note</h4>
						<p>{extractionEnabled ? "Extract charge lines from a PDF, PNG, or JPEG up to 10 MB with Azure AI." : "Azure AI import is unavailable on this server. Use a template or enter charges manually."}</p>
						<label className="field">
							<span>Credit/Debit Note file</span>
							<input className="input-control" type="file" accept="application/pdf,image/png,image/jpeg"
								disabled={!extractionEnabled || !hasShipment || extractingDocument || saveLoading} onChange={(event) => {
									setDocumentFile(event.target.files?.[0] ?? null);
									setDocumentDraft(null);
									setDocumentError(null);
								}} />
						</label>
						<button className="btn outline" type="button" disabled={!extractionEnabled || !hasShipment || !documentFile || extractingDocument || saveLoading} onClick={extractDocument}>
							{extractingDocument ? "Extracting..." : "Extract with Azure AI"}
						</button>
						{documentError && <div className="inline-error" role="alert">{documentError}</div>}
						{documentDraft && (
							<div className="import-feedback" aria-live="polite">
								<p>Extracted {documentDraft.noteType} note {documentDraft.noteNumber || ""} ({documentDraft.lines.length} charge lines).</p>
								<p>Reference: {documentDraft.referenceNumber || "Missing"} | HBL: {documentDraft.hblNumber || "Missing"} | Agent: {documentDraft.agentName || "Missing"} | Currency: {documentDraft.currency || "Verify USD before saving"}</p>
								{draftBlocker && <p>{draftBlocker}</p>}
								<button className="btn primary" type="button" disabled={Boolean(draftBlocker) || saveLoading} onClick={applyDocument}>
									{isPrepared ? "Replace Charges with Imported Lines" : "Use Imported Lines"}
								</button>
							</div>
						)}
					</section>
					<section className="crdr-source-card">
						<h4>Populate from Template</h4>
						<p>Use a template for the shipment's agent when one is available.</p>
						<label className="field">
							<span>Credit/Debit template</span>
							<select className="input-control" value={templateKey} onChange={(event) => setTemplateKey(event.target.value)}
								disabled={!hasShipment || templateLoading || !templateOptions.length || saveLoading}>
								<option value="">{templateLoading ? "Loading templates..." : templateOptions.length ? "Select template" : "No templates available"}</option>
								{templateOptions.map((template, index) => {
									const key = getTemplateOptionKey(template, index);
									return <option key={key} value={key}>{template.name ?? template.templateName ?? `Template ${index + 1}`}</option>;
								})}
							</select>
						</label>
						<button className="btn outline" type="button"
							disabled={!hasShipment || !selectedTemplate || templateLoading || extractingDocument || saveLoading} onClick={populateTemplate}>
							{isPrepared ? "Replace Charges with Template" : "Populate Template"}
						</button>
						{templateError && <div className="inline-error" role="alert">{templateError}</div>}
					</section>
					<section className="crdr-source-card">
						<h4>Manual Entry</h4>
						<p>Start with a blank charge line and enter each debit or credit amount yourself.</p>
						<button className="btn outline" type="button" onClick={enterManually}
							disabled={!hasShipment || extractingDocument || saveLoading || (isPrepared && preparedSource.kind === "manual")}>
							{isPrepared && preparedSource.kind !== "manual" ? "Replace Charges with Manual Entry" : "Enter Manually"}
						</button>
					</section>
				</div>
			</section>

			<section className="panel ref-panel">
				<header className="panel-heading">
					<div>
						<h3>3. Create CR/DR Invoice</h3>
						<p>{isPrepared
							? "Review the invoice details and charges below before creating it."
							: preparedSource ? "Restore the prepared shipment and BL or prepare charges for the new selection." : "Import a note, populate a template, or enter charges manually to review the invoice."}</p>
					</div>
					{isPrepared && <button className="btn outline" type="button" disabled={saveLoading} onClick={discardPreparedCharges}>Clear Charges</button>}
				</header>
				{isPrepared && <p role="status">{preparedSource.kind === "manual" ? preparedSource.label : `${preparedSource.kind === "import" ? "Imported note" : "Template"}: ${preparedSource.label}`}</p>}
				{!isPrepared && <button className="btn ghost" type="button" onClick={internalCancel}>Cancel</button>}
			</section>

			{isPrepared && <>
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
						Fill Header Defaults
					</button>
				</div>

				<div className="form-grid">
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
					>
						{saveLoading ? "Creating..." : "Create CR/DR Invoice"}
					</button>
				</div>
				{saveError && <div className="inline-error">{saveError}</div>}
				{saveSuccess && <div className="inline-success">{saveSuccess}</div>}
			</section>
			</>}
		</div>
	);
}

export default CreateCrdr;
