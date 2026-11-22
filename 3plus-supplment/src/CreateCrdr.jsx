import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSelector } from "react-redux";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import "./CreateCrdr.css";
import { searchAgentCompaniesByName } from "./api/agentCompanies";
import { extractCrdrDocument, findCrdrAirShipment, getCrdrByRefNumber, saveCrdr } from "./api/crdrs";
import { PORTAL_API_PATH } from "./api/config";
import { getCrdrTemplateByAgentId } from "./api/ListCrdrTemplate";
import { selectAuth } from "./store/slices/authSlice";
import DocumentDropzone from "./components/DocumentDropzone";
import CrdrDocumentPreview from "./components/CrdrDocumentPreview";
import { normalizeShipmentBill } from "./shipmentBill";
import { chooseCrdrAirBill, chooseCrdrShipmentBill, getCrdrAirBills } from "./crdrShipmentSelection";
import { getCrdrCreateBlocker, getCrdrCurrencyBlocker, getCrdrHouseBillNotice } from "./crdrReview";
import { getCrdrPaymentTerms } from "./crdrTerms";

const extractionEnabled = import.meta.env.DEV || (PORTAL_API_PATH && import.meta.env.VITE_CRDR_AI_ENABLED === "true");
const airImportEnabled = import.meta.env.VITE_CRDR_AIR_IMPORT_ENABLED === "true" && (import.meta.env.DEV || Boolean(PORTAL_API_PATH));

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
	const [documentApplied, setDocumentApplied] = useState(false);
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
	const initialTerms = () => getCrdrPaymentTerms(invoiceDate, {
		dueDate: parseDate(initialData?.dueDate), term: initialData?.netTerm,
	});
	const [dueDate, setDueDate] = useState(() => initialTerms().dueDate);
	const [netTerm, setNetTerm] = useState(() => initialTerms().term);
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
		const today = new Date();
		const payment = getCrdrPaymentTerms(today);
		setInvoiceDate(today);
		setNetTerm(payment.term);
		setDueDate(payment.dueDate);
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
			const payment = getCrdrPaymentTerms(invoiceDate, { dueDate, term: netTerm });
			const air = refPayload?.airImport;
			const airBill = air?.bills.find((bill) => bill.billNumber === selectedBL);
			if (air && !airBill) throw new Error("Select an air import airway bill.");
			const master = refPayload?.tOIMMainDto ?? null;
			const houses = Array.isArray(refPayload?.tOIHMainDtos)
				? refPayload.tOIHMainDtos
				: [];
			const selected = (selectedBL || "").toString().trim();
			const match = houses.find(
				(row) => (row?.fHblno || "").toString().trim() === selected
			);

			const target = match ?? null;
			const tbName = airBill?.table ?? (target ? "T_OIHMAIN" : master ? "T_OIMMAIN" : "T_OIHMAIN");
			const tBid = airBill?.id ?? target?.fId ?? master?.fId ?? 0;

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
				...(air ? { airImportReference: air.referenceNumber } : {}),
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
					fTerms: Number(netTerm === "" ? payment.term : netTerm) || 0,
					fDueDate: toDateString(payment.dueDate),
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
		const payment = getCrdrPaymentTerms(invoiceDate, { dueDate, term: netTerm });
		setNetTerm(payment.term);
		setDueDate(payment.dueDate);

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
		setRefLookupError(null);
	};

	const handleBlChange = (value) => {
		setSelectedBL(value);
		if (preparedSource) return;
		const payment = getCrdrPaymentTerms(invoiceDate);
		setNetTerm(payment.term);
		setDueDate(payment.dueDate);
		setCrdrNumber("");
		setItems([createLine({ id: "seed-0" })]);
	};

	const doRefSearch = (event) => {
		event.preventDefault();
		if (!refSearching && !extractingDocument && !saveLoading) void lookupShipment(refSearchTerm);
	};

	const lookupShipment = async (reference, extracted = null, airOnly = false) => {
		const query = reference.trim().toUpperCase();
		const resetShipment = () => {
			setBlList([]);
			setSelectedBL("");
			setRefPayload(null);
			if (preparedSource || extracted) {
				setAgent(extracted?.agentName?.trim() || preparedSource?.agentName || "");
				setAgentId(null);
			} else {
				resetCrdrForm();
			}
		};
		setRefSearchTerm(query);
		setResolvedReference("");
		if (!query) {
			setRefLookupError("Reference number is required");
			resetShipment();
			return;
		}
		if (!airImportEnabled && (airOnly || /^AI-?\d/i.test(query))) {
			resetShipment();
			setRefLookupError("CR/DR creation supports ocean imports only. Enter an ocean import reference.");
			return;
		}

		setRefLookupError(null);
		setRefSearching(true);
		try {
			let payload = null;
			if (!airOnly && !/^AI-?\d/i.test(query)) {
				try {
					const response = await getCrdrByRefNumber(query);
					payload = response?.data ?? response;
				} catch (error) {
					if (error.response?.status !== 404) throw error;
				}
			}
			const master = payload?.tOIMMainDto ?? null;
			const houses = Array.isArray(payload?.tOIHMainDtos) ? payload.tOIHMainDtos : [];

			if (!master && !houses.length) {
				let air = airImportEnabled ? await findCrdrAirShipment(query) : null;
				const extractedBill = extracted?.hblNumber?.trim();
				if (airImportEnabled && !air && extractedBill && normalizeShipmentBill(extractedBill) !== normalizeShipmentBill(query)) {
					air = await findCrdrAirShipment(extractedBill);
				}
				if (air) {
					const airReference = air.referenceNumber.trim();
					const bills = getCrdrAirBills(air);
					setRefSearchTerm(airReference);
					setResolvedReference(airReference);
					setRefPayload({ airImport: { referenceNumber: airReference, bills } });
					setBlList(bills.map((bill) => bill.billNumber));
					setSelectedBL(chooseCrdrAirBill(bills, { search: query, reference: airReference, extracted,
						preparedBill: preparedSource?.reference === airReference ? preparedSource.bl : "" }));
					setAgent(air.agentName || extracted?.agentName?.trim() || preparedSource?.agentName || "");
					setAgentId(air.agentId || null);
					if (!bills.length) setRefLookupError("No unique airway bills were found for this air shipment.");
					return;
				}
				resetShipment();
				setRefLookupError("Shipment not found for this reference. Check the reference and search again.");
				return;
			}

			setRefPayload(payload || null);
			setResolvedReference(query);

			const mbl = (master?.fMblno || "").toString().trim();
			const hbls = houses
				.map((row) => (row?.fHblno || "").toString().trim())
				.filter(Boolean);

			const list = [mbl, ...hbls].filter(Boolean);
			setBlList([...new Set(list)]);
			setSelectedBL(chooseCrdrShipmentBill({ master: mbl, houses: hbls, extracted,
				preparedBill: preparedSource?.reference === query ? preparedSource.bl : "" }));

			const company = payload?.tCompany ?? null;
			const agentName =
				(company?.fSname || company?.fFname || "").toString().trim();
			const agentIdValue = company?.fId ?? master?.fAgent ?? null;
			setAgent(agentName || extracted?.agentName?.trim() || preparedSource?.agentName || "");
			setAgentId(agentIdValue);
			if (!list.length) {
				setRefLookupError("No BL information returned for this reference.");
			}
		} catch (err) {
			resetShipment();
			setRefLookupError(err.response?.status === 404
				? "Shipment not found for this reference. Check the reference and search again."
				: getErrorMessage(err, "Unable to look up the shipment."));
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

	const isPrepared = Boolean(preparedSource);
	const prepareSource = (kind, label, fields = {}) => {
		setPreparedSource({ kind, label, reference: resolvedReference, bl: selectedBL, ...fields });
		setSaveSuccess(null);
		setSaveError(null);
	};

	const selectedTemplate = templateOptions.find((template, index) => getTemplateOptionKey(template, index) === templateKey);
	const populateTemplate = () => {
		if (!hasShipment || !selectedTemplate || templateLoading || saveLoading || extractingDocument) return;
		const payment = getCrdrPaymentTerms(invoiceDate, { term: selectedTemplate.term });
		setNetTerm(payment.term);
		setDueDate(payment.dueDate);
		setItems(selectedTemplate.details.map((row) => createLine(row)));
		setDocumentDraft(null);
		prepareSource("template", selectedTemplate.name ?? selectedTemplate.templateName ?? "Template");
	};
	const draftBlocker = getCrdrCurrencyBlocker(documentDraft);

	const lookupDocumentShipment = async (draft) => {
		const reference = draft.referenceNumber?.trim();
		const houseBill = draft.hblNumber?.trim();
		if (reference) await lookupShipment(reference, draft);
		else if (airImportEnabled && houseBill && (!hasShipment || normalizeShipmentBill(houseBill) !== normalizeShipmentBill(selectedBL))) {
			await lookupShipment(houseBill, draft, true);
		} else if (!hasShipment) {
			setRefLookupError(airImportEnabled
				? "No shipment reference or house bill was found on the note. Enter a reference or airway bill and search."
				: "No shipment reference was found on the note. Enter a reference and search.");
		}
	};

	const extractDocument = async () => {
		if (!extractionEnabled || !documentFile || extractingDocument || refSearching || saveLoading) return;
		setDocumentError(null);
		setDocumentDraft(null);
		setDocumentApplied(false);
		setExtractingDocument(true);
		try {
			const draft = await extractCrdrDocument(documentFile);
			setDocumentDraft(draft);
			if (!isPrepared) {
				if (!getCrdrCurrencyBlocker(draft)) fillDocument(draft);
				await lookupDocumentShipment(draft);
			}
		} catch (err) {
			setDocumentError(getErrorMessage(err, "Unable to extract the note."));
		} finally {
			setExtractingDocument(false);
		}
	};

	const fillDocument = (draft) => {
		const issueDate = parseDocumentDate(draft.invoiceDate);
		const payment = getCrdrPaymentTerms(issueDate, { dueDate: parseDocumentDate(draft.dueDate) });
		setInvoiceDate(issueDate);
		setDueDate(payment.dueDate);
		setNetTerm(payment.term);
		setItems(draft.lines.map((line) => createLine(line)));
		if (!hasShipment) {
			setAgent(draft.agentName?.trim() || "");
			setAgentId(null);
		}
		prepareSource("import", draft.noteNumber || documentFile?.name || "Imported note", {
			houseBill: draft.hblNumber, agentName: draft.agentName?.trim(),
		});
		setDocumentApplied(true);
	};

	const applyDocument = async () => {
		if (!documentDraft || draftBlocker || saveLoading || extractingDocument || refSearching) return;
		fillDocument(documentDraft);
		await lookupDocumentShipment(documentDraft);
	};

	const discardPreparedCharges = () => {
		setPreparedSource(null);
		setItems([createLine({ id: "seed-0" })]);
		const payment = getCrdrPaymentTerms(invoiceDate);
		setDueDate(payment.dueDate);
		setNetTerm(payment.term);
		setSaveSuccess(null);
		setSaveError(null);
		setDocumentApplied(false);
	};

	const enterManually = () => {
		if (saveLoading || extractingDocument || refSearching) return;
		setItems([createLine({ id: "seed-0" })]);
		const today = new Date();
		const payment = getCrdrPaymentTerms(today);
		setInvoiceDate(today);
		setDueDate(payment.dueDate);
		setNetTerm(payment.term);
		setDocumentDraft(null);
		prepareSource("manual", "Manual entry");
	};

	const selectedShipment = { hasShipment, reference: resolvedReference, bill: selectedBL };
	const reviewBlocker = getCrdrCreateBlocker(preparedSource, {
		shipment: selectedShipment,
		agentId, invoiceDate,
		hasCharge: items.some((line) => line.description.trim() && (toNumber(line.debit) || toNumber(line.credit))),
	});
	const isSaveDisabled = saveLoading || extractingDocument || Boolean(reviewBlocker);
	const showReviewBlocker = !refSearching && !extractingDocument && Boolean(reviewBlocker);
	const houseBillNotice = getCrdrHouseBillNotice(preparedSource, selectedShipment);
	const createDescription = [
		showReviewBlocker && "crdr-create-blocker",
		houseBillNotice && "crdr-house-bill-notice",
	].filter(Boolean).join(" ") || undefined;

	return (
		<div className="create-invoice-page crdr-create-page">
			<section className="panel invoice-hero">
				<div className="hero-copy">
					<p className="eyebrow">CRDR</p>
					<h2>{title}</h2>
					<p>Import a note with 3Plus AI or look up the shipment and prepare charges yourself.</p>
				</div>
			</section>

			<section className="panel crdr-source-panel">
				<header className="panel-heading">
					<div>
						<h3>1. 3Plus AI</h3>
						<p>Upload a credit/debit note to extract its charges and search its shipment reference automatically. You can skip this step.</p>
					</div>
				</header>
				<section className="crdr-source-card import-panel">
					<h4>Import Credit/Debit Note</h4>
					<p>{extractionEnabled ? "Use 3Plus AI to extract credit and debit lines."
						: "3Plus AI import is unavailable on this server. Use a template or enter charges manually."}</p>
					{extractionEnabled && (
						<>
							<DocumentDropzone label="Credit/Debit Note file" file={documentFile}
								disabled={refSearching || extractingDocument || saveLoading}
								onChange={(selected, validationError = null) => {
									setDocumentFile(selected);
									setDocumentDraft(null);
									setDocumentApplied(false);
									setDocumentError(validationError);
								}} />
							<button className="btn outline" type="button"
								disabled={!documentFile || refSearching || extractingDocument || saveLoading} onClick={extractDocument}>
								{extractingDocument ? refSearching ? "Looking up shipment…" : "Extracting…" : "Extract with 3Plus AI"}
							</button>
						</>
					)}
					{documentError && <div className="inline-error" role="alert">{documentError}</div>}
					{documentDraft && (
						<CrdrDocumentPreview draft={documentDraft} blocker={draftBlocker} applied={documentApplied}
							disabled={saveLoading} applyDisabled={extractingDocument || refSearching} hasCharges={isPrepared}
							onApply={applyDocument} onDismiss={() => setDocumentDraft(null)} />
					)}
				</section>
			</section>

			<section className="panel ref-panel">
				<header className="panel-heading">
					<div>
						<h3>2. Shipment Lookup</h3>
						<p>{airImportEnabled ? "Confirm the extracted shipment, or search by PLUS reference or air import airway bill."
							: "Confirm the extracted ocean shipment, or search by its PLUS reference."}</p>
					</div>
				</header>
				<form className="ref-grid" onSubmit={doRefSearch} autoComplete="off">
					<label className="field span-2">
						<span>{airImportEnabled ? "Reference or airway bill" : "Reference number"}</span>
						<div className="ref-input-row">
							<input
								className="input-control"
								placeholder={airImportEnabled ? "Search by reference or air waybill" : "Search by reference"}
								autoComplete="off"
								autoCorrect="off"
								autoCapitalize="off"
								spellCheck={false}
								value={refSearchTerm}
								disabled={refSearching || extractingDocument || saveLoading}
								onChange={(e) => handleRefChange(e.target.value)}
							/>
							<button className="btn primary" type="submit" disabled={refSearching || extractingDocument || saveLoading}>
								{refSearching ? "Searching…" : "Search"}
							</button>
						</div>
					</label>
					<label className="field">
						<span>{refPayload?.airImport ? "Airway bill" : "BL number"}</span>
						<select
							className="input-control"
							value={selectedBL || ""}
							disabled={refSearching || extractingDocument || saveLoading || !blList.length || resolvedReference !== refSearchTerm.trim()}
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
				{refLookupError && <div className="inline-error" role="alert">{refLookupError}</div>}
				{!refSearching && !refLookupError && resolvedReference && resolvedReference === refSearchTerm.trim() && blList.length > 0 && (
					<p role="status">{hasShipment ? "Shipment and bill of lading selected." : "Shipment found. Select a bill of lading to continue."}</p>
				)}
			</section>

			<section className="panel crdr-source-panel">
				<header className="panel-heading">
					<div>
						<h3>3. Populate from Template or Manual Entry</h3>
						<p>Review imported charges, use a template for the selected shipment, or enter charges manually.</p>
					</div>
				</header>
				<div className="crdr-source-grid">
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
							disabled={refSearching || extractingDocument || saveLoading || preparedSource?.kind === "manual"}>
							{isPrepared && preparedSource.kind !== "manual" ? "Replace Charges with Manual Entry" : "Enter Manually"}
						</button>
					</section>
				</div>
			</section>

			{isPrepared && <section className="panel line-panel">
				<header className="panel-heading">
					<div>
						<h3>Review Charges</h3>
						<p>Check the debit and credit lines before creating the invoice.</p>
					</div>
					<div style={{ display: "flex", gap: "0.5rem" }}>
						<button type="button" className="btn outline" onClick={addItem}>
							+ Add line
						</button>
					</div>
				</header>

				<div className="line-table-wrapper" role="region" aria-label="Credit and debit charge lines" tabIndex={0}>
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
			</section>}

			<section className="panel ref-panel">
				<header className="panel-heading">
					<div>
						<h3>4. Create CR/DR Invoice</h3>
						<p>{isPrepared
							? "Review the invoice details and charges below before creating it."
							: "Import a note, populate a template, or enter charges manually to review the invoice."}</p>
					</div>
					{isPrepared && <button className="btn outline" type="button" disabled={saveLoading || extractingDocument} onClick={discardPreparedCharges}>Clear Charges</button>}
				</header>
				{isPrepared && <p role="status">{preparedSource.kind === "manual" ? preparedSource.label : `${preparedSource.kind === "import" ? "Imported note" : "Template"}: ${preparedSource.label}`}</p>}
				{!isPrepared && <button className="btn ghost" type="button" onClick={internalCancel}>Cancel</button>}
			</section>

			{isPrepared && <section className="panel header-panel">
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
							onChange={(d) => {
								setInvoiceDate(d);
								const payment = getCrdrPaymentTerms(d, { term: netTerm });
								setDueDate(payment.dueDate);
								setNetTerm(payment.term);
							}}
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
								if (!Number.isInteger(value) || value < 0) return;
								const payment = getCrdrPaymentTerms(invoiceDate, { term: value });
								setNetTerm(payment.term);
								setDueDate(payment.dueDate);
							}}
						/>
					</div>

					<div className="field">
						<label>Due Date</label>
						<DatePicker
							className="input-control"
							selected={dueDate}
							onChange={(d) => {
								const payment = getCrdrPaymentTerms(invoiceDate, { dueDate: d });
								setDueDate(payment.dueDate);
								setNetTerm(payment.term);
							}}
							minDate={invoiceDate ?? undefined}
							dateFormat="yyyy-MM-dd"
							popperContainer={DatePickerPopperContainer}
							popperClassName="datepicker-popper-portal"
						/>
					</div>

				</div>

				{showReviewBlocker && <p id="crdr-create-blocker" className="inline-error" role="status">{reviewBlocker}</p>}
				{houseBillNotice && <p id="crdr-house-bill-notice" className="crdr-bill-notice" role="status">{houseBillNotice}</p>}
				<div className="action-row">
					<button type="button" className="btn ghost" onClick={internalCancel}>
						Cancel
					</button>
					<button
						className="btn primary"
						type="button"
						onClick={handleSave}
						disabled={isSaveDisabled}
						aria-describedby={createDescription}
					>
						{saveLoading ? "Creating..." : "Create CR/DR Invoice"}
					</button>
				</div>
				{saveError && <div className="inline-error">{saveError}</div>}
				{saveSuccess && <div className="inline-success">{saveSuccess}</div>}
			</section>}
		</div>
	);
}

export default CreateCrdr;
