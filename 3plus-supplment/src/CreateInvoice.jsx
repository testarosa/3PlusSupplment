import React, {
  useCallback,
  useState,
  useMemo,
  useRef,
  useEffect,
} from "react";
import { createPortal } from "react-dom";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import "./CreateInvoice.css";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { fetchInvoiceTemplatesByCustomer } from "./api/invoiceTemplates";
import { getInvoiceByRef, saveInvoice } from "./api/invoices";
import { getCustomersByName } from "./api/customers";
import { getBillingCodes } from "./api/billingCodes";
import { selectAuth, selectBillingUserId } from "./store/slices/authSlice";

const DatePickerPopperContainer = ({ children }) => {
  if (typeof document === "undefined") return children;
  return createPortal(children, document.body);
};

const coerceNumber = (value) => {
  if (value === null || typeof value === "undefined") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const normalizeCustomerOption = (input) => {
  if (!input) return null;
  if (typeof input === "string") {
    const trimmed = input.trim();
    return trimmed ? { name: trimmed, value: trimmed, id: null } : null;
  }
  const name = (
    input.name ??
    input.Name ??
    input.customerName ??
    input.customer ??
    ""
  )
    .toString()
    .trim();
  const idRaw =
    input.id ??
    input.Id ??
    input.customerId ??
    input.CustomerId ??
    input.customerID ??
    input.CustomerID;

  const valueRaw = input.value ?? input.Value ?? input.code ?? input.Code;
  const value =
    valueRaw != null
      ? valueRaw.toString()
      : idRaw != null
        ? idRaw.toString()
        : name;
  if (!name && !value) return null;
  return {
    name: name || value,
    value: value || name,
    id: typeof idRaw !== "undefined" && idRaw !== null ? idRaw : null,
  };
};

const dedupeCustomerOptions = (list) => {
  const seen = new Set();
  const out = [];
  for (const item of list || []) {
    const normalized = normalizeCustomerOption(item);
    if (!normalized) continue;
    const key = `${normalized.name.toLowerCase()}::${normalized.value.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
};

const optionLabel = (opt) => {
  if (!opt) return "";
  if (typeof opt === "string") return opt;
  return opt.name || opt.value || "";
};

const getInvoiceFreightType = (payload = {}) => {
  const explicit =
    payload?.freightType ??
    payload?.FreightType ??
    payload?.frightType ??
    payload?.FrightType ??
    payload?.tOIMMainDto?.freightType ??
    payload?.tOOMMain?.freightType ??
    payload?.tAIMMain?.freightType ??
    payload?.tAOMMain?.freightType;
  if (explicit) return String(explicit).trim().toUpperCase();
  if (payload?.tOIMMainDto || Array.isArray(payload?.tOIHMainDtos)) return "OI";
  if (payload?.tOOMMain || Array.isArray(payload?.tOOHMains)) return "OO";
  if (
    payload?.tAIMMain ||
    payload?.tAIMMainDto ||
    Array.isArray(payload?.tAIHMains)
  ) {
    return "AI";
  }
  if (payload?.tAOMMain || Array.isArray(payload?.tAOHMains)) return "AO";
  return "OI";
};

const pickTableName = (...values) => {
  for (const value of values) {
    if (value == null) continue;
    const text = value.toString().trim();
    if (text) return text;
  }
  return null;
};

const getMasterTableName = (payload = {}) =>
  pickTableName(
    payload?.tOIMMainDto?.tbName,
    payload?.tOIMMainDto?.tBName,
    payload?.tOIMMainDto?.fTbName,
    payload?.tAIMMainDto?.tbName,
    payload?.tAIMMainDto?.tBName,
    payload?.tAIMMainDto?.fTbName,
    payload?.tAIMMain?.tbName,
    payload?.tAIMMain?.tBName,
    payload?.tAIMMain?.fTbName,
  ) ??
  (payload?.tOIMMainDto
    ? "T_OIMMAIN"
    : payload?.tAIMMainDto || payload?.tAIMMain
      ? "T_AIMMAIN"
      : null);

const getHouseTableName = (row = {}, payload = {}) =>
  pickTableName(row?.tbName, row?.tBName, row?.fTbName) ??
  (Array.isArray(payload?.tOIHMainDtos)
    ? "T_OIHMAIN"
    : Array.isArray(payload?.tAIHMainDtos)
      ? "T_AIHMAIN"
      : null);

const findDefaultTemplate = (templates = []) =>
  templates.find((template) =>
    Boolean(template?.isDefault ?? template?.IsDefault),
  ) ?? null;

const metaToCustomerOption = (meta) => {
  if (!meta) return null;
  return normalizeCustomerOption({
    name:
      meta.customerName ||
      meta.customerShort ||
      meta.customerCode ||
      meta.customer ||
      meta.customerLabel ||
      "",
    value:
      meta.customerCode ||
      meta.customerShort ||
      meta.customerName ||
      meta.customer ||
      meta.customerLabel ||
      meta.customerId ||
      "",
    id: meta.customerId ?? meta.customerCode ?? null,
  });
};

const emptyLine = (id = 1) => ({ id, billingCode: "", description: "", rate: 0, qty: 1 });

const extractInvoiceLineItemsFromLookup = (payload) => {
  if (!payload || typeof payload !== "object") return [];

  const listCandidate =
    payload.oiRates ??
    payload.oIRates ??
    payload.tOIRateDtos ??
    payload.tOIRateDTOs ??
    payload.tOIRateMainDtos ??
    payload.tOIRateMainDTOs ??
    payload.invoiceRates ??
    payload.rates ??
    payload.items ??
    payload.lineItems ??
    null;

  const rows = Array.isArray(listCandidate) ? listCandidate : [];

  const normalizeText = (value) =>
    value != null && typeof value !== "object" ? value.toString().trim() : "";

  const out = [];
  rows.forEach((row) => {
    if (!row || typeof row !== "object") return;

    const billingCode = normalizeText(
      row.billingCode ??
        row.BillingCode ??
        row.code ??
        row.Code ??
        row.fBillingCode ??
        row.fBillcode ??
        row.fBillCode ??
        row.fCode ??
        row.fBillingcode,
    );

    const description = normalizeText(
      row.billingDescription ??
        row.BillingDescription ??
        row.description ??
        row.Description ??
        row.desc ??
        row.fDescription ??
        row.fDesc ??
        row.fBillingDescription,
    );

    const rate =
      coerceNumber(
        row.rate ??
          row.Rate ??
          row.fRate ??
          row.amount ??
          row.Amount ??
          row.fAmount ??
          row.unitPrice ??
          row.UnitPrice,
      ) ?? 0;

    const qty =
      coerceNumber(
        row.qty ??
          row.Qty ??
          row.quantity ??
          row.Quantity ??
          row.fQty ??
          row.fQuantity,
      ) ?? 1;

    // Only include rows that have at least something meaningful.
    if (!billingCode && !description) return;

    out.push({ billingCode, description, rate, qty });
  });

  return out;
};

function CreateInvoice({
  initialData = {},
  title = "Create Invoice",
  onCancel = null,
}) {
  const navigate = useNavigate();
  const auth = useSelector(selectAuth);
  const loginUserId = useSelector(selectBillingUserId);
  const currentUser = auth?.user ?? null;
  const userBranch =
    currentUser?.branch ??
    currentUser?.Branch ??
    currentUser?.branchCode ??
    currentUser?.BranchCode ??
    currentUser?.branchId ??
    currentUser?.BranchId ??
    currentUser?.branchName ??
    currentUser?.BranchName ??
    currentUser?.fBranch ??
    currentUser?.F_Branch ??
    "";
  const userIdForPayload =
    currentUser?.userId ??
    currentUser?.userID ??
    currentUser?.UserId ??
    currentUser?.UserID ??
    currentUser?.id ??
    currentUser?.Id ??
    "";
  const userNameForTemplates = loginUserId || String(userIdForPayload);
  const [blList, setBlList] = useState([]);
  const [selectedBL, setSelectedBL] = useState("");
  // editable header fields
  const [billTo, setBillTo] = useState(initialData?.billTo ?? "");
  const [selectedCustomerId, setSelectedCustomerId] = useState(
    initialData?.customerId ?? null,
  );
  const [acBill, setAcBill] = useState({
    list: [],
    index: -1,
    visible: false,
    query: "",
  });
  const [customerOptions, setCustomerOptions] = useState([]);
  const [blMeta, setBlMeta] = useState({});
  const billLookupRef = useRef(null);
  const parseDate = (v) => {
    if (!v) return null;
    try {
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  };

  const [invoicePostDate, setInvoicePostDate] = useState(
    parseDate(initialData?.invoicePostDate) ?? new Date(),
  );
  const [invoiceDate, setInvoiceDate] = useState(
    parseDate(initialData?.invoiceDate) ?? new Date(),
  );
  const [dueDate, setDueDate] = useState(
    parseDate(initialData?.dueDate) ?? null,
  );
  const [netTerm, setNetTerm] = useState(() => {
    if (initialData?.netTerm === 0) return 0;
    if (initialData?.netTerm) return Number(initialData.netTerm) || 0;
    return "";
  });
  const [invoiceNumber, setInvoiceNumber] = useState(
    initialData?.invoiceNo ?? initialData?.invoiceNumber ?? "",
  );
  // Ref state (re-added per request)
  const [refSearchTerm, setRefSearchTerm] = useState(initialData?.ref ?? "");
  const [selectedRef, setSelectedRef] = useState(initialData?.ref ?? "");
  const [refLookupError, setRefLookupError] = useState(null);
  const [refSearching, setRefSearching] = useState(false);
  const [billingFreightType, setBillingFreightType] = useState(
    initialData?.freightTypeCode ?? initialData?.freightType ?? "",
  );

  const [lookupCharges, setLookupCharges] = useState(null);
  const [preparedSource, setPreparedSource] = useState(null);
  const [templateResult, setTemplateResult] = useState(null);
  const [templateChoice, setTemplateChoice] = useState(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState(null);
  const reviewHeading = useRef(null);

  useEffect(() => {
    return () => {
      if (billLookupRef.current) {
        clearTimeout(billLookupRef.current);
        billLookupRef.current = null;
      }
    };
  }, []);

  React.useEffect(() => {
    try {
      const templates = JSON.parse(
        sessionStorage.getItem("templates") || "null",
      );
      if (Array.isArray(templates) && templates.length) {
        const customers = Array.from(
          new Set(
            templates
              .map((t) => (t.customer || t.customerName || "").trim())
              .filter(Boolean),
          ),
        );
        setCustomerOptions(dedupeCustomerOptions(customers));
        return;
      }
    } catch {
      /* ignore */
    }
    setCustomerOptions(dedupeCustomerOptions([]));
  }, []);

  // Ref handlers: autocomplete + search
  const handleRefChange = (val) => {
    setRefSearchTerm(val);
    setRefLookupError(null);
  };

  const parseCombinedRefInput = (raw) => {
    const input = (raw || "").toString().trim();
    if (!input) return { refQuery: "", preferredBl: "" };

    // Accept inputs like: OI-514261-bl-001 (case-insensitive "-bl-")
    const match = input.match(/^(.*?)-(?:bl)-(.*)$/i);
    if (!match) return { refQuery: input, preferredBl: "" };

    const refQuery = (match[1] || "").trim();
    let blSuffix = (match[2] || "").trim();
    if (!refQuery || !blSuffix) return { refQuery: input, preferredBl: "" };

    // If suffix is numeric, pad to 3 digits (001)
    if (/^\d+$/.test(blSuffix)) {
      blSuffix = blSuffix.padStart(3, "0");
    }

    return {
      refQuery,
      preferredBl: `${refQuery}-BL-${blSuffix}`,
    };
  };

  const doRefSearch = async (e) => {
    e?.preventDefault();
    if (refSearching || saveLoading) return;
    const rawQuery = (refSearchTerm || "").trim();
    const { refQuery: query, preferredBl: preferredBlFromInput } =
      parseCombinedRefInput(rawQuery);
    if (!query) {
      setRefLookupError("Reference number is required");
      return;
    }

    if (preparedSource && !saveFeedback?.success && !window.confirm("Replace the prepared invoice with a new shipment lookup?")) return;
    setSelectedRef("");
    setSelectedBL("");
    setBlList([]);
    setBlMeta({});
    setLookupCharges(null);
    setPreparedSource(null);
    setTemplateChoice(null);
    setSaveFeedback(null);
    setRefLookupError(null);
    applyShipmentHeader(null);
    const today = new Date();
    setInvoicePostDate(today);
    setInvoiceDate(today);
    setNetTerm("");
    setDueDate(null);
    setInvoiceNumber("");
    setItems([emptyLine()]);
    setRefSearching(true);

    try {
      const response = await getInvoiceByRef(query);
      let payload = response;
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch {
          // A non-JSON response cannot contain a verified shipment.
        }
      }

      if (payload && typeof payload === "object" && payload.data) {
        payload = payload.data;
      }
      const lookupFreightType = getInvoiceFreightType(payload);
      setBillingFreightType(lookupFreightType);

      const extractedLines = extractInvoiceLineItemsFromLookup(payload);

      const mbl = (
        payload?.tOIMMainDto?.fMblno ||
        payload?.tAIMMain?.fMawbNo ||
        payload?.tAIMMainDto?.fMawbNo ||
        ""
      )
        .toString()
        .trim();

      const hblRows = Array.isArray(payload?.tOIHMainDtos)
        ? payload.tOIHMainDtos
        : Array.isArray(payload?.tAIHMainDtos)
          ? payload.tAIHMainDtos
          : [];

      const extractNames = (row = {}) => {
        const toTrimmedString = (value) =>
          value != null && typeof value !== "object"
            ? value.toString().trim()
            : "";

        const rawCode =
          row.fCustomer ??
          row.customer ??
          row.Customer ??
          row.fCustomerCode ??
          row.customerCode ??
          row.CustomerCode ??
          row.fCustomerNo ??
          row.customerNo ??
          row.CustomerNo;

        const rawId =
          row.fCustomerId ??
          row.fCustomerID ??
          row.customerId ??
          row.customerID ??
          row.CustomerId ??
          row.CustomerID ??
          row.fCustId ??
          row.fCustID;

        let parsedCustomerId = null;
        if (rawId != null) {
          const trimmedId = typeof rawId === "string" ? rawId.trim() : rawId;
          if (trimmedId !== "") {
            parsedCustomerId = coerceNumber(trimmedId);
          }
        }
        if (parsedCustomerId == null && rawCode != null) {
          const trimmedCode =
            typeof rawCode === "string" ? rawCode.trim() : rawCode;
          if (trimmedCode !== "") {
            parsedCustomerId = coerceNumber(trimmedCode);
          }
        }

        return {
          customerName: toTrimmedString(
            row.fCustomerName ??
              row.customerName ??
              row.fCname ??
              row.customer ??
              row.Customer ??
              "",
          ),
          customerShort: toTrimmedString(
            row.fCustomerSName ?? row.customerShort ?? row.customerSName ?? "",
          ),
          customerCode: toTrimmedString(rawCode),
          custRefNo: toTrimmedString(
            row.fCustRefNo ??
              row.custRefNo ??
              row.customerRefNo ??
              row.CustomerRefNo ??
              "",
          ),
          customerId: parsedCustomerId,
        };
      };

      const hblNumbers = hblRows
        .map((row) => ({
          number: (row?.fHblno || row?.fHawbNo || "").toString().trim(),
          meta: extractNames(row),
          tbName: getHouseTableName(row, payload),
          recordId:
            row?.fId ?? row?.FId ?? row?.fid ?? row?.id ?? row?.Id ?? null,
        }))
        .filter((entry) => entry.number);

      const metaMap = {};
      const firstHouse = hblNumbers[0];
      const masterTableName = getMasterTableName(payload);
      if (mbl) {
        const masterRecordId =
          payload?.tOIMMainDto?.fId ??
          payload?.tOIMMainDto?.FId ??
          payload?.tOIMMainDto?.fid ??
          payload?.tOIMMainDto?.id ??
          payload?.tOIMMainDto?.Id ??
          payload?.tAIMMainDto?.fId ??
          payload?.tAIMMain?.fId ??
          null;
        metaMap[mbl] = {
          kind: "MBL",
          recordId: coerceNumber(masterRecordId),
          tbName: masterTableName,
          ...(firstHouse
            ? firstHouse.meta
            : { customerName: "", customerShort: "" }),
        };
      }

      hblNumbers.forEach(({ number, meta, recordId, tbName }) => {
        metaMap[number] = {
          kind: "HBL",
          recordId: coerceNumber(recordId),
          tbName,
          ...meta,
        };
      });

      const combinedList = [];
      if (mbl) combinedList.push(mbl);
      combinedList.push(...hblNumbers.map((entry) => entry.number));

      if (combinedList.length) {
        const defaultPreferred =
          (hblNumbers[0]?.number || "").toString().trim() ||
          mbl ||
          combinedList[0];
        const preferredBl =
          preferredBlFromInput && combinedList.includes(preferredBlFromInput)
            ? preferredBlFromInput
            : defaultPreferred;

        const verified = [...new Set(combinedList)].filter((bl) =>
          metaMap[bl]?.recordId > 0 && metaMap[bl]?.tbName
        );
        if (!verified.length) {
          setRefLookupError("No verifiable BL records were found for this reference.");
          return;
        }
        const selected = verified.includes(preferredBl) ? preferredBl : verified[0];
        setBlList(verified);
        setBlMeta(metaMap);
        setSelectedRef(query);
        setSelectedBL(selected);
        applyShipmentHeader(metaMap[selected]);
        if (extractedLines.length && selected === defaultPreferred) {
          setLookupCharges({ bl: selected, lines: extractedLines });
        }
        return;
      }

      setRefLookupError("No BL information returned for this reference.");
    } catch (err) {
      console.warn("[CreateInvoice] invoice lookup failed", err);
      setRefLookupError(err?.message || "Unable to load invoice details");
    } finally {
      setRefSearching(false);
    }
  };

  const applyShipmentHeader = (meta) => {
    const customer = metaToCustomerOption(meta);
    setBillTo(customer ? optionLabel(customer) : "");
    setSelectedCustomerId(coerceNumber(customer?.id) ?? coerceNumber(meta?.customerId));
    setAcBill({ list: [], index: -1, visible: false, query: "" });
    if (customer) {
      setCustomerOptions((previous) => dedupeCustomerOptions([...previous, customer]));
    }
  };

  const activeReference = parseCombinedRefInput(refSearchTerm).refQuery;
  const selectedMeta = blMeta[selectedBL];
  const hasShipment = Boolean(!refSearching && selectedRef && selectedRef === activeReference &&
    selectedMeta?.recordId > 0 && selectedMeta.tbName && blList.includes(selectedBL));
  const isPrepared = Boolean(hasShipment && preparedSource?.reference === selectedRef && preparedSource.bl === selectedBL);
  const templateCustomerId = coerceNumber(selectedCustomerId);
  const templateFreightType = billingFreightType || "OI";
  const templateKey = hasShipment && templateCustomerId > 0
    ? JSON.stringify([selectedRef, selectedBL, templateCustomerId, templateFreightType, userNameForTemplates])
    : "";
  const currentTemplates = templateResult?.key === templateKey ? templateResult : null;
  const templateOptions = currentTemplates?.options ?? [];
  const templateLoading = Boolean(templateKey && !currentTemplates);
  const selectedTemplateId = templateChoice?.key === templateKey
    ? templateChoice.id : String(findDefaultTemplate(templateOptions)?.id ?? "");
  const selectedTemplate = templateOptions.find((template) => String(template.id) === selectedTemplateId);

  useEffect(() => {
    if (!templateKey) return;
    let active = true;
    fetchInvoiceTemplatesByCustomer(templateCustomerId, userNameForTemplates, templateFreightType)
      .then((templates) => {
        if (active) setTemplateResult({
          key: templateKey, options: templates.filter((template) => template.items?.length),
        });
      })
      .catch((error) => {
        if (active) setTemplateResult({
          key: templateKey, error: error?.message || "Unable to load invoice templates.",
        });
      });
    return () => { active = false; };
  }, [templateKey, templateCustomerId, userNameForTemplates, templateFreightType]);

  const handleBlChange = (value) => {
    if (value === selectedBL || saveLoading) return;
    if (preparedSource && !saveFeedback?.success && !window.confirm("Clear prepared charges and switch the BL?")) return;
    setSelectedBL(value);
    setPreparedSource(null);
    setTemplateChoice(null);
    setSaveFeedback(null);
    setInvoiceNumber("");
    setNetTerm("");
    setDueDate(null);
    setItems([emptyLine()]);
    applyShipmentHeader(blMeta[value]);
  };

  const handleBillChange = (val) => {
    setBillTo(val);
    setSelectedCustomerId(null);
    if (billLookupRef.current) {
      clearTimeout(billLookupRef.current);
      billLookupRef.current = null;
    }

    const q = (val || "").trim();
    if (!q) {
      const list = customerOptions.slice(0, 8);
      setAcBill({
        list,
        index: list.length ? 0 : -1,
        visible: list.length > 0,
        query: val,
      });
      return;
    }

    if (q.length < 2) {
      const lower = q.toLowerCase();
      const list = customerOptions
        .filter((opt) => optionLabel(opt).toLowerCase().includes(lower))
        .slice(0, 8);
      setAcBill({
        list,
        index: list.length ? 0 : -1,
        visible: list.length > 0,
        query: val,
      });
      return;
    }

    setAcBill({
      list: [{ name: "Searching...", value: "__loading", disabled: true }],
      index: 0,
      visible: true,
      query: val,
    });

    billLookupRef.current = setTimeout(async () => {
      try {
        const results = await getCustomersByName(q);
        const normalized = dedupeCustomerOptions(results);
        if (!normalized.length) {
          setAcBill({
            list: [
              { name: "No customers found", value: "__empty", disabled: true },
            ],
            index: 0,
            visible: true,
            query: val,
          });
        } else {
          setAcBill({
            list: normalized,
            index: 0,
            visible: true,
            query: val,
          });
        }
      } catch (err) {
        console.warn("[CreateInvoice] customer lookup failed", err);
        setAcBill({ list: [], index: -1, visible: false, query: val });
      } finally {
        billLookupRef.current = null;
      }
    }, 300);
  };

  const selectBill = (val) => {
    if (!val || val.value === "__loading" || val.value === "__empty") return;
    const normalized = normalizeCustomerOption(val);
    if (!normalized) return;
    setBillTo(normalized.name);
    const parsedId =
      coerceNumber(normalized.id) ?? coerceNumber(normalized.value);
    setSelectedCustomerId(parsedId ?? null);
    setAcBill({ list: [], index: -1, visible: false, query: "" });
  };

  const prepareCharges = (kind, label, lines) => {
    if (!hasShipment || saveLoading) return;
    setPreparedSource({ kind, label, reference: selectedRef, bl: selectedBL });
    setSaveFeedback(null);
    setItems(lines);
    reviewHeading.current?.focus();
  };

  const populateTemplate = () => {
    if (!selectedTemplate?.items?.length || !hasShipment || saveLoading) return;
    const term = selectedTemplate.netTerm ?? selectedTemplate.term;
    if (term != null && String(term).trim() && Number.isSafeInteger(Number(term)) && Number(term) >= 0) {
      setNetTerm(Number(term));
      const due = new Date(invoiceDate || Date.now());
      due.setDate(due.getDate() + Number(term));
      setDueDate(due);
    }
    prepareCharges("template", selectedTemplate.name || "Invoice template", selectedTemplate.items.map((item, index) => ({
      id: index + 1,
      billingCode: item.billingCode || item.code || "",
      description: item.description || item.desc || "",
      rate: item.rate ?? item.amount ?? 0,
      qty: item.qty ?? 1,
    })));
  };

  const clearCharges = () => {
    setPreparedSource(null);
    setSaveFeedback(null);
    setItems([emptyLine()]);
  };

  const fillHeaderDefaults = () => {
    const date = invoiceDate ?? new Date();
    if (!invoiceDate) setInvoiceDate(date);
    if (!invoicePostDate) setInvoicePostDate(new Date());
    if (!coerceNumber(selectedCustomerId) && selectedMeta?.customerId) applyShipmentHeader(selectedMeta);
    if (!dueDate && netTerm !== "") {
      const due = new Date(date);
      due.setDate(due.getDate() + Number(netTerm));
      setDueDate(due);
    }
  };

  // Line items (reused from CreateInvoiceTemplate)
  const [items, setItems] = useState(
    initialData?.items && initialData.items.length
      ? initialData.items.map((it, idx) => ({
          id: it.id ?? idx + 1,
          billingCode: it.billingCode ?? it.code ?? "",
          description: it.description ?? it.desc ?? "",
          rate: it.rate ?? it.amount ?? 0,
          qty: it.qty ?? 1,
        }))
      : [{ id: 1, billingCode: "", description: "", rate: 0, qty: 1 }],
  );
  const updateItem = (id, field, value) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, [field]: value } : it)),
    );
  };


  const refs = useRef({});
  const billingDebounce = useRef({});

  // Billing code autocomplete cache (used for quick suggestions when query is short)
  const [billingCodeOptions, setBillingCodeOptions] = useState([]);
  const [billingCodeBootstrapped, setBillingCodeBootstrapped] = useState(false);

  const [ac, setAc] = useState({
    id: null,
    list: [],
    index: -1,
    visible: false,
    query: "",
  });

  const [billingAcStyle, setBillingAcStyle] = useState(null);
  const [billToAcStyle, setBillToAcStyle] = useState(null);

  const updateBillingAcStyle = useCallback(() => {
    const id = ac?.id;
    if (!id) return;
    const node = refs.current?.[id]?.billingCode;
    if (!node) return;

    const rect = node.getBoundingClientRect();
    const margin = 12;
    const preferredWidth = 360;

    let width = Math.min(preferredWidth, window.innerWidth - margin * 2);
    width = Math.max(260, width);

    let left = rect.left;
    if (left + width > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - margin - width);
    }

    const top = rect.bottom + 6;
    const maxHeight = Math.max(
      120,
      Math.min(260, window.innerHeight - top - margin),
    );

    setBillingAcStyle({
      position: "fixed",
      top,
      left,
      width,
      maxHeight,
      zIndex: 3000,
    });
  }, [ac?.id]);

  useEffect(() => {
    if (!ac.visible || !ac.id) return;
    updateBillingAcStyle();

    const handle = () => updateBillingAcStyle();
    window.addEventListener("scroll", handle, true);
    window.addEventListener("resize", handle);
    return () => {
      window.removeEventListener("scroll", handle, true);
      window.removeEventListener("resize", handle);
    };
  }, [ac.visible, ac.id, updateBillingAcStyle]);

  const updateBillToAcStyle = useCallback(() => {
    const node = refs.current?.billTo;
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

    const top = rect.bottom + 8;
    const maxHeight = Math.max(
      140,
      Math.min(260, window.innerHeight - top - margin),
    );

    setBillToAcStyle({
      position: "fixed",
      top,
      left,
      width,
      maxHeight,
      zIndex: 3000,
    });
  }, []);

  useEffect(() => {
    if (!acBill.visible) return;
    updateBillToAcStyle();

    const handle = () => updateBillToAcStyle();
    window.addEventListener("scroll", handle, true);
    window.addEventListener("resize", handle);
    return () => {
      window.removeEventListener("scroll", handle, true);
      window.removeEventListener("resize", handle);
    };
  }, [acBill.visible, updateBillToAcStyle]);

  useEffect(() => {
    let alive = true;

    const normalizeCodes = (results) => {
      let list = (results || []).map((it) => ({
        code: (it?.value ?? it?.code ?? "").toString().trim(),
        desc: (it?.name ?? it?.description ?? it?.desc ?? "").toString().trim(),
      }));
      const seen = new Set();
      list = list.filter((item) => {
        if (!item.code) return false;
        const key = `${item.code.toLowerCase()}::${(item.desc || "").toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      // Cap list size; dropdown can scroll.
      return list.slice(0, 50);
    };

    // Best-effort preload so autocomplete can show something immediately.
    (async () => {
      try {
        setBillingCodeBootstrapped(false);
        const results = await getBillingCodes("", billingFreightType || "OI");
        if (!alive) return;
        const normalized = normalizeCodes(results);
        setBillingCodeOptions(normalized);
      } catch {
        // Live search still works if the preload fails.
      } finally {
        if (alive) setBillingCodeBootstrapped(true);
      }
    })();

    return () => {
      alive = false;
    };
  }, [billingFreightType]);

  useEffect(() => {
    return () => {
      Object.values(billingDebounce.current || {}).forEach((timer) =>
        clearTimeout(timer),
      );
      billingDebounce.current = {};
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (!ac.visible) return;
      if (e.key === "Escape") setAc((s) => ({ ...s, visible: false }));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [ac.visible]);

  const handleAcChange = (id, value) => {
    updateItem(id, "billingCode", value);
    const q = (value || "").trim();

    if (billingDebounce.current[id]) {
      clearTimeout(billingDebounce.current[id]);
      billingDebounce.current[id] = null;
    }

    if (!q) {
      const list = billingCodeOptions.slice(0, 6);
      setAc({
        id,
        list,
        index: list.length ? 0 : -1,
        visible: list.length > 0,
        query: value,
      });
      return;
    }

    if (q.length < 2) {
      const lowered = q.toLowerCase();
      const list = lowered
        ? billingCodeOptions.filter(
            (o) =>
              o.code.toLowerCase().includes(lowered) ||
              (o.desc && o.desc.toLowerCase().includes(lowered)),
          )
        : billingCodeOptions.slice(0, 6);

      // If cache has results, show them. Otherwise fall through to API search
      // even for 1-character queries.
      if (list.length) {
        setAc({
          id,
          list,
          index: list.length ? 0 : -1,
          visible: list.length > 0,
          query: value,
        });
        return;
      }
    }

    setAc({
      id,
      list: [{ code: "__loading", desc: "Searching...", disabled: true }],
      index: 0,
      visible: true,
      query: value,
    });

    billingDebounce.current[id] = setTimeout(async () => {
      try {
        const results = await getBillingCodes(q, billingFreightType || "OI");
        let list = (results || []).map((it) => ({
          code: (it?.value ?? it?.code ?? "").toString().trim(),
          desc: (it?.name ?? it?.description ?? it?.desc ?? "")
            .toString()
            .trim(),
        }));
        const seen = new Set();
        list = list.filter((it) => {
          const key = `${it.code.toLowerCase()}::${(it.desc || "").toLowerCase()}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return Boolean(it.code);
        });

        list = list.slice(0, 50);

        if (!list.length) {
          list = [
            {
              code: "__empty",
              desc: "No matching billing codes",
              disabled: true,
            },
          ];
        }
        setAc({
          id,
          list,
          index: list.length ? 0 : -1,
          visible: true,
          query: value,
        });
      } catch (err) {
        console.warn("[CreateInvoice] billing code lookup failed", err);
        setAc({ id, list: [], index: -1, visible: false, query: value });
      } finally {
        billingDebounce.current[id] = null;
      }
    }, 300);
  };

  const selectAc = (id, opt) => {
    if (!opt) return;
    if (opt.disabled || opt.code === "__loading" || opt.code === "__empty")
      return;
    if (billingDebounce.current[id]) {
      clearTimeout(billingDebounce.current[id]);
      billingDebounce.current[id] = null;
    }
    updateItem(id, "billingCode", opt.code);
    updateItem(id, "description", opt.desc || "");
    setAc({ id: null, list: [], index: -1, visible: false, query: "" });
    setTimeout(() => {
      const node = refs.current?.[id]?.description;
      if (node && typeof node.focus === "function") node.focus();
    }, 0);
  };

  const addItem = () => {
    const nextId = items.length ? Math.max(...items.map((i) => i.id)) + 1 : 1;
    setItems((prev) => [
      ...prev,
      { id: nextId, billingCode: "", description: "", rate: 0, qty: 1 },
    ]);
    return nextId;
  };

  // Keep at least one line item — don't remove if there's only one left
  const removeItem = (id) =>
    setItems((prev) =>
      prev.length > 1 ? prev.filter((i) => i.id !== id) : prev,
    );

  const itemAmount = (it) => {
    const r = parseFloat(it.rate) || 0;
    const q = parseFloat(it.qty) || 0;
    return r * q;
  };

  const subtotal = useMemo(
    () => items.reduce((s, it) => s + itemAmount(it), 0),
    [items],
  );

  const canSave = isPrepared && !saveLoading && !saveFeedback?.success &&
    coerceNumber(selectedCustomerId) > 0 && invoicePostDate && invoiceDate && items.length > 0 &&
    items.every((line) => String(line.billingCode ?? "").trim() && String(line.description ?? "").trim() &&
      String(line.rate).trim() !== "" && Number.isFinite(Number(line.rate)) &&
      Number.isFinite(Number(line.qty)) && Number(line.qty) > 0);

  const handleSaveInvoice = async (e) => {
    e?.preventDefault();
    if (!canSave) return;
    setSaveLoading(true);
    setSaveFeedback(null);

    try {
      // Convert dates to ISO format for API
      const formatDateForAPI = (date) => {
        if (!date) return new Date().toISOString();
        const dateObj = date instanceof Date ? date : new Date(date);
        return dateObj.toISOString();
      };

      // Map form items to API oiRates format
      const oiRates = items.map((item) => ({
        billingCode: item.billingCode || "",
        billingDescription: item.description || "",
        rate: parseFloat(item.rate) || 0,
        qty: parseFloat(item.qty) || 1,
      }));

      // Calculate total invoice amount
      const invoiceAmount = items.reduce((total, item) => {
        return (
          total + (parseFloat(item.rate) || 0) * (parseFloat(item.qty) || 1)
        );
      }, 0);

      const resolvedCustomerId = coerceNumber(selectedCustomerId);

      // Prepare API payload
      const apiPayload = {
        branch: userBranch || "",
        tbId: selectedMeta.recordId,
        tbName: selectedMeta.tbName,
        invoiceNo: (invoiceNumber || "").toString().trim(),
        customerId: resolvedCustomerId,
        postDate: formatDateForAPI(invoicePostDate),
        invoiceDate: formatDateForAPI(invoiceDate),
        dueDate: formatDateForAPI(dueDate),
        invoiceAmount: invoiceAmount,
        customerRefNo: (selectedMeta?.custRefNo || "").toString().trim(),
        userID: userIdForPayload || "",
        oiRates: oiRates,
      };

      const response = await saveInvoice(apiPayload);
      if (!response?.success) throw new Error(response?.message || "Failed to save invoice");
      setSaveFeedback({ success: true, message: response.message || "Invoice saved." });
      if (typeof onCancel === "function") onCancel();
    } catch (error) {
      setSaveFeedback({ success: false, message: error?.response?.data?.message || error.message || "Could not save the invoice." });
    } finally {
      setSaveLoading(false);
    }
  };

  const internalCancel = () => {
    if (typeof onCancel === "function") onCancel();
    else navigate("/invoices");
  };

  return (
    <div className="create-invoice-page">
      <section className="panel invoice-hero">
        <div className="hero-copy">
          <p className="eyebrow">Invoice studio</p>
          <h3>{title}</h3>
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
              <button
                className="btn primary"
                type="submit"
                disabled={refSearching || saveLoading}
              >
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
              disabled={refSearching || saveLoading || !blList.length}
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
      </section>
      <section className="panel" aria-labelledby="invoice-prepare-heading">
        <header className="panel-heading">
          <div>
            <h3 id="invoice-prepare-heading">2. Prepare Charges</h3>
            <p>{hasShipment ? "Choose how to prepare the invoice charges." : "Find the shipment and select a BL to continue."}</p>
          </div>
        </header>
        <div className="billing-prepare-grid">
          <section className="billing-prepare-card" aria-labelledby="invoice-template-heading">
            <h4 id="invoice-template-heading">Populate from Template</h4>
            <p>Use a saved invoice template for the Bill To customer.</p>
            <label className="field">
              <span>Invoice template</span>
              <select className="input-control" value={selectedTemplateId}
                onChange={(event) => setTemplateChoice({ key: templateKey, id: event.target.value })}
                disabled={!hasShipment || templateLoading || !templateOptions.length || saveLoading}>
                <option value="">{templateLoading ? "Loading templates..." : templateOptions.length
                  ? "Select template" : "No templates available"}</option>
                {templateOptions.map((template) => (
                  <option key={template.id} value={template.id}>{template.name || "Template #" + template.id}</option>
                ))}
              </select>
            </label>
            {hasShipment && !templateKey && <p>Choose Manual Entry to select a Bill To customer first.</p>}
            <button className="btn outline" type="button" onClick={populateTemplate}
              disabled={!hasShipment || !selectedTemplate || templateLoading || saveLoading}>
              {isPrepared ? "Replace Charges with Template" : "Populate Template"}
            </button>
            {currentTemplates?.error && <p className="inline-error" role="alert">{currentTemplates.error}</p>}
          </section>
          <section className="billing-prepare-card" aria-labelledby="invoice-manual-heading">
            <h4 id="invoice-manual-heading">Manual Entry</h4>
            <p>Start with a blank charge line and enter the billing code, rate, and quantity.</p>
            <button className="btn outline" type="button"
              onClick={() => prepareCharges("manual", "Manual entry", [emptyLine()])}
              disabled={!hasShipment || saveLoading || (isPrepared && preparedSource.kind === "manual")}>
              {isPrepared && preparedSource.kind !== "manual" ? "Replace Charges with Manual Entry" : "Enter Manually"}
            </button>
            {hasShipment && lookupCharges?.bl === selectedBL && (
              <button className="btn outline" type="button" disabled={saveLoading}
                onClick={() => prepareCharges("shipment", "Shipment charges", lookupCharges.lines.map((line, index) => ({
                  ...line, id: index + 1,
                })))}>
                {isPrepared ? "Replace with Shipment Charges" : "Use Shipment Charges"}
              </button>
            )}
          </section>
        </div>
      </section>

      <section className="panel" aria-labelledby="invoice-review-heading">
        <header className="panel-heading">
          <div>
            <h3 id="invoice-review-heading" ref={reviewHeading} tabIndex={-1}>3. Create Invoice</h3>
            <p>{isPrepared ? "Review the invoice details and charges below before creating it."
              : "Populate a template or enter charges manually to review the invoice."}</p>
          </div>
          {isPrepared && <button className="btn outline" type="button" disabled={saveLoading} onClick={clearCharges}>Clear Charges</button>}
        </header>
        {isPrepared ? <p className="billing-charge-source" role="status">
          {preparedSource.kind === "template" ? "Template: " : ""}{preparedSource.label}
        </p> : <button className="btn ghost" type="button" onClick={internalCancel}>Cancel</button>}
      </section>

      {isPrepared && <fieldset className="invoice-review" disabled={saveLoading} aria-label="Invoice review">
      <section className="panel header-panel">
        <header className="panel-heading">
          <div>
            <h3>Header</h3>
            <p>Review the Bill To customer, invoice dates, and terms.</p>
          </div>
          <button className="btn outline" type="button" onClick={fillHeaderDefaults}>Fill Header Defaults</button>
        </header>
        <div className="header-grid">
          <div className="field span-2 customer-field">
            <label htmlFor="invoice-bill-to">Bill To</label>
            <div className="ac-wrap">
              <input
                className="input-control"
                id="invoice-bill-to"
                placeholder="Customer name"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                value={billTo}
                onChange={(e) => handleBillChange(e.target.value)}
                ref={(el) => {
                  refs.current.billTo = el;
                }}
                onFocus={() => {
                  if (!acBill.visible && customerOptions.length) {
                    setAcBill((s) => ({
                      ...s,
                      list: customerOptions.slice(0, 6),
                      index: customerOptions.length ? 0 : -1,
                      visible: true,
                    }));
                  }
                }}
                onKeyDown={(e) => {
                  if (acBill.visible) {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setAcBill((s) => ({
                        ...s,
                        index: Math.min(s.index + 1, s.list.length - 1),
                      }));
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setAcBill((s) => ({
                        ...s,
                        index: Math.max(s.index - 1, 0),
                      }));
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      const sel = acBill.list[acBill.index];
                      if (sel && sel.value !== "__loading") selectBill(sel);
                    }
                  }
                }}
                onBlur={() =>
                  setTimeout(
                    () => setAcBill((s) => ({ ...s, visible: false })),
                    120,
                  )
                }
              />
              {selectedCustomerId && (
                <span className="customer-id-chip">
                  ID #{selectedCustomerId}
                </span>
              )}
              {acBill.visible &&
                typeof document !== "undefined" &&
                createPortal(
                  <ul
                    className="ac-list ac-list-portal"
                    role="listbox"
                    style={billToAcStyle || undefined}
                  >
                    {acBill.list.map((opt, idx) => {
                      const label = optionLabel(opt) || "Unnamed";
                      const key = `${opt?.value || label}-${idx}`;
                      const disabled = Boolean(
                        opt?.disabled || opt?.value === "__loading",
                      );
                      return (
                        <li
                          key={key}
                          className={`${idx === acBill.index ? "active" : ""} ${
                            disabled ? "disabled" : ""
                          }`.trim()}
                          onMouseDown={(ev) => {
                            if (disabled) return;
                            ev.preventDefault();
                            selectBill(opt);
                          }}
                          role="option"
                          aria-selected={idx === acBill.index}
                          aria-disabled={disabled}
                        >
                          {label}
                        </li>
                      );
                    })}
                  </ul>,
                  document.body,
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

          <div className="field with-action">
            <label htmlFor="invoice-number">Invoice Number</label>
            <input
              id="invoice-number"
              className="input-control"
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder="Enter invoice #"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="panel line-panel">
        <header className="panel-heading">
          <div>
            <h3>Invoice Items</h3>
          </div>
          <button
            type="button"
            className="btn outline"
            onClick={() => {
              const newId = addItem();
              setTimeout(() => {
                const node = refs.current?.[newId]?.billingCode;
                if (node && typeof node.focus === "function") node.focus();
              }, 0);
            }}
          >
            + Add row
          </button>
        </header>
        <div className="line-table-wrapper" role="region" aria-label="Invoice charge lines" tabIndex={0}>
          <table className="line-table">
            <thead>
              <tr>
                <th>Billing Code</th>
                <th>Description</th>
                <th>Rate</th>
                <th>Qty</th>
                <th>Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, index) => (
                <tr key={it.id}>
                  <td className="billing-cell">
                    <input
                      aria-label={"Billing code, line " + (index + 1)}
                      value={it.billingCode}
                      onChange={(e) => handleAcChange(it.id, e.target.value)}
                      onFocus={() => {
                        // show cached suggestions quickly; if cache isn't ready yet, show loading
                        if (ac.visible && ac.id === it.id) return;
                        if (billingCodeOptions.length) {
                          const list = billingCodeOptions.slice(0, 6);
                          setAc({
                            id: it.id,
                            list,
                            index: list.length ? 0 : -1,
                            visible: list.length > 0,
                            query: it.billingCode,
                          });
                          return;
                        }

                        if (!billingCodeBootstrapped) {
                          setAc({
                            id: it.id,
                            list: [
                              {
                                code: "__loading",
                                desc: "Loading...",
                                disabled: true,
                              },
                            ],
                            index: 0,
                            visible: true,
                            query: it.billingCode,
                          });
                        }
                      }}
                      onKeyDown={(e) => {
                        if (ac.visible && ac.id === it.id) {
                          if (e.key === "ArrowDown") {
                            e.preventDefault();
                            setAc((s) => ({
                              ...s,
                              index: Math.min(s.index + 1, s.list.length - 1),
                            }));
                          } else if (e.key === "ArrowUp") {
                            e.preventDefault();
                            setAc((s) => ({
                              ...s,
                              index: Math.max(s.index - 1, 0),
                            }));
                          } else if (e.key === "Enter") {
                            e.preventDefault();
                            const sel = ac.list[ac.index];
                            if (sel) selectAc(it.id, sel);
                          }
                        }
                      }}
                      onBlur={() =>
                        setTimeout(
                          () => setAc((s) => ({ ...s, visible: false })),
                          150,
                        )
                      }
                      ref={(el) => {
                        refs.current[it.id] = refs.current[it.id] || {};
                        refs.current[it.id].billingCode = el;
                      }}
                    />

                    {ac.visible &&
                      ac.id === it.id &&
                      typeof document !== "undefined" &&
                      createPortal(
                        <ul
                          className="ac-list ac-list-portal"
                          role="listbox"
                          style={billingAcStyle || undefined}
                        >
                          {ac.list.map((opt, idx) => (
                            <li
                              key={`${opt.code}-${idx}`}
                              className={`${idx === ac.index ? "active" : ""} ${opt.disabled ? "disabled" : ""}`.trim()}
                              onMouseDown={(ev) => {
                                if (opt.disabled) return;
                                ev.preventDefault();
                                selectAc(it.id, opt);
                              }}
                              role="option"
                              aria-selected={idx === ac.index}
                              aria-disabled={Boolean(opt.disabled)}
                            >
                              <div className="ac-option">
                                <div className="ac-code">{opt.code}</div>
                                {opt.desc && (
                                  <div className="ac-desc">{opt.desc}</div>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>,
                        document.body,
                      )}
                  </td>
                  <td>
                    <input
                      aria-label={"Description, line " + (index + 1)}
                      value={it.description}
                      onChange={(e) =>
                        updateItem(it.id, "description", e.target.value)
                      }
                      ref={(el) => {
                        refs.current[it.id] = refs.current[it.id] || {};
                        refs.current[it.id].description = el;
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      aria-label={"Rate, line " + (index + 1)}
                      value={it.rate}
                      onChange={(e) =>
                        updateItem(it.id, "rate", e.target.value)
                      }
                      ref={(el) => {
                        refs.current[it.id] = refs.current[it.id] || {};
                        refs.current[it.id].rate = el;
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      aria-label={"Quantity, line " + (index + 1)}
                      value={it.qty}
                      onChange={(e) => updateItem(it.id, "qty", e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Tab" && !e.shiftKey) {
                          const last = items[items.length - 1];
                          if (last && last.id === it.id) {
                            e.preventDefault();
                            const newId = addItem();
                            setTimeout(() => {
                              const node = refs.current?.[newId]?.billingCode;
                              if (node && typeof node.focus === "function")
                                node.focus();
                            }, 0);
                          }
                        }
                      }}
                      ref={(el) => {
                        refs.current[it.id] = refs.current[it.id] || {};
                        refs.current[it.id].qty = el;
                      }}
                    />
                  </td>
                  <td className="right">{itemAmount(it).toFixed(2)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn danger"
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="line-footer">
          <div className="subtotal-card">
            <p>Subtotal</p>
            <strong>${subtotal.toFixed(2)}</strong>
          </div>
        </div>
        <div className="action-row">
          <button type="button" className="btn ghost" onClick={internalCancel}>
            {saveFeedback?.success ? "Back to Invoices" : "Cancel"}
          </button>
          <button
            className="btn primary"
            type="button"
            onClick={handleSaveInvoice}
            disabled={!canSave}
          >
            {saveLoading ? "Creating..." : "Create Invoice"}
          </button>
        </div>
        {saveFeedback && <p className={saveFeedback.success ? "inline-success" : "inline-error"}
          role={saveFeedback.success ? "status" : "alert"}>{saveFeedback.message}</p>}
      </section>
      </fieldset>}
    </div>
  );
}

export default CreateInvoice;
