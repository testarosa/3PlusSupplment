import React, { useCallback, useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useSelector } from "react-redux";
import "./CreateInvoice.css";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { fetchInvoiceTemplatesByCustomer } from "./api/invoiceTemplates";
import { getInvoiceByRef, saveInvoice } from "./api/invoices";
import { getCustomersByName } from "./api/customers";
import { getBillingCodes } from "./api/billingCodes";
import { selectAuth } from "./store/slices/authSlice";

const TB_NAME_OIM = "T_OIMMAIN";
const TB_NAME_OIH = "T_OIHMAIN";

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

const formatDisplayDate = (value) => {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

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
        row.fBillingcode
    );

    const description = normalizeText(
      row.billingDescription ??
        row.BillingDescription ??
        row.description ??
        row.Description ??
        row.desc ??
        row.fDescription ??
        row.fDesc ??
        row.fBillingDescription
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
          row.UnitPrice
      ) ?? 0;

    const qty =
      coerceNumber(
        row.qty ??
          row.Qty ??
          row.quantity ??
          row.Quantity ??
          row.fQty ??
          row.fQuantity
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
  const auth = useSelector(selectAuth);
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
  // BL list is populated from templates or demo fallback (no Ref input in this UI)
  const [acBL, setAcBL] = useState({ list: [], index: -1, visible: false });
  const [selectedBL, setSelectedBL] = useState("");
  // editable header fields
  const [billTo, setBillTo] = useState(initialData?.billTo ?? "");
  const [selectedCustomerId, setSelectedCustomerId] = useState(
    initialData?.customerId ?? null
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
    } catch (e) {
      return null;
    }
  };

  const [invoicePostDate, setInvoicePostDate] = useState(
    parseDate(initialData?.invoicePostDate) ?? new Date()
  );
  const [invoiceDate, setInvoiceDate] = useState(
    parseDate(initialData?.invoiceDate) ?? new Date()
  );
  const [dueDate, setDueDate] = useState(
    parseDate(initialData?.dueDate) ?? null
  );
  const [netTerm, setNetTerm] = useState(() => {
    if (initialData?.netTerm === 0) return 0;
    if (initialData?.netTerm) return Number(initialData.netTerm) || 0;
    return "";
  });
  const [invoiceNumber, setInvoiceNumber] = useState(
    initialData?.invoiceNo ?? initialData?.invoiceNumber ?? ""
  );
  // Ref/search state (re-added per request)
  const [refSearchTerm, setRefSearchTerm] = useState(initialData?.ref ?? "");
  const [selectedRef, setSelectedRef] = useState(initialData?.ref ?? "");
  const [refLookupError, setRefLookupError] = useState(null);
  const [refSearching, setRefSearching] = useState(false);

  // After a ref lookup, optionally auto-populate invoice items from templates once bill-to is known.
  const [autoPopulateAfterRef, setAutoPopulateAfterRef] = useState(false);

  // Populate BL list on mount: prefer sessionStorage templates -> fallback generated demo BLs
  React.useEffect(() => {
    try {
      const templates = JSON.parse(
        sessionStorage.getItem("templates") || "null"
      );
      if (Array.isArray(templates) && templates.length) {
        const bls = Array.from(
          new Set(
            templates
              .flatMap((t) => (Array.isArray(t.blNumbers) ? t.blNumbers : []))
              .filter(Boolean)
          )
        );
        if (bls.length) {
          setAcBL({ list: bls.slice(0, 50), index: 0, visible: false });
          setBlMeta({});
          return;
        }
      }
    } catch (err) {
      // ignore
    }
    // fallback demo BLs
    const generated = [];
    setAcBL((s) => ({
      ...s,
      list: generated,
      index: generated.length ? 0 : -1,
      visible: false,
    }));
    setBlMeta({});
  }, []);

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
        sessionStorage.getItem("templates") || "null"
      );
      if (Array.isArray(templates) && templates.length) {
        const customers = Array.from(
          new Set(
            templates
              .map((t) => (t.customer || t.customerName || "").trim())
              .filter(Boolean)
          )
        );
        setCustomerOptions(dedupeCustomerOptions(customers));
        return;
      }
    } catch (e) {
      /* ignore */
    }
    setCustomerOptions(
      dedupeCustomerOptions([])
    );
  }, []);

  // Ref handlers: autocomplete + search
  const handleRefChange = (val) => {
    setRefSearchTerm(val);
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

  const formatBillToFromMeta = (meta) => {
    const normalized = metaToCustomerOption(meta);
    return normalized ? optionLabel(normalized) : "";
  };

  const applyTemplateBLFallback = (refValue) => {
    let handled = false;
    try {
      const templates = JSON.parse(
        sessionStorage.getItem("templates") || "null"
      );
      if (Array.isArray(templates)) {
        const t = templates.find(
          (it) =>
            (it.ref || "").toLowerCase() === (refValue || "").toLowerCase()
        );
        if (t && Array.isArray(t.blNumbers) && t.blNumbers.length) {
          const list = t.blNumbers.slice(0, 50);
          setAcBL({ list, index: list.length ? 0 : -1, visible: false });
          setBlMeta({});
          handled = true;
        }
      }
    } catch (err) {
      // ignore fallback errors
    }

    if (!handled) {
      const refKey = (refValue || "REF").replace(/[^a-zA-Z0-9-]/g, "") || "REF";
      const generated = Array.from(
        { length: 5 },
        (_, i) => `${refKey}-BL-${(i + 1).toString().padStart(3, "0")}`
      );
      setAcBL({
        list: generated,
        index: generated.length ? 0 : -1,
        visible: false,
      });
      setBlMeta({});
    }

    setSelectedBL("");
    return handled;
  };

  const doRefSearch = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const rawQuery = (refSearchTerm || "").trim();
    const { refQuery: query, preferredBl: preferredBlFromInput } = parseCombinedRefInput(rawQuery);
    if (!query) {
      setSelectedRef("");
      setSelectedBL("");
      setAcBL((s) => ({ ...s, list: [], index: -1, visible: false }));
      setBlMeta({});
      setRefLookupError("Reference number is required");
      return;
    }

    setSelectedRef(query);
    setRefLookupError(null);
    const today = new Date();
    setInvoicePostDate(today);
    setInvoiceDate(today);
    setNetTerm("");
    setDueDate(null);
    setInvoiceNumber("");
    setItems([]);
    setRefSearching(true);
    
    try {
      const response = await getInvoiceByRef(query);
      let payload = response;
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch (err) {
          // leave payload as-is if parsing fails
        }
      }

      if (payload && typeof payload === "object" && payload.data) {
        payload = payload.data;
      }

      // Populate invoice items from the lookup payload when present.
      const extractedLines = extractInvoiceLineItemsFromLookup(payload);
      if (extractedLines.length) {
        setItems(
          extractedLines.map((line, idx) => ({
            id: idx + 1,
            billingCode: line.billingCode || "",
            description: line.description || "",
            rate: typeof line.rate !== "undefined" ? line.rate : 0,
            qty: typeof line.qty !== "undefined" ? line.qty : 1,
          }))
        );
        setAutoPopulateAfterRef(false);
      } else {
        // Keep UI usable while we possibly auto-populate from templates.
        setItems([{ id: 1, billingCode: "", description: "", rate: 0, qty: 1 }]);
      }

      const mbl = (payload?.tOIMMainDto?.fMblno || "").toString().trim();
      const hblRows = Array.isArray(payload?.tOIHMainDtos)
        ? payload.tOIHMainDtos
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
          const trimmedId =
            typeof rawId === "string" ? rawId.trim() : rawId;
          if (trimmedId !== "") {
            parsedCustomerId = coerceNumber(trimmedId);
          }
        }

        return {
          customerName: toTrimmedString(
            row.fCustomerName ??
              row.customerName ??
              row.fCname ??
              row.customer ??
              row.Customer ??
              ""
          ),
          customerShort: toTrimmedString(
            row.fCustomerSName ?? row.customerShort ?? row.customerSName ?? ""
          ),
          customerCode: toTrimmedString(rawCode),
          customerId: parsedCustomerId,
        };
      };
      const hblNumbers = hblRows
        .map((row) => ({
          number: (row?.fHblno || "").toString().trim(),
          meta: extractNames(row),
          recordId:
            row?.fId ??
            row?.FId ??
            row?.fid ??
            row?.id ??
            row?.Id ??
            null,
        }))
        .filter((entry) => entry.number);

      const metaMap = {};
      const firstHouse = hblNumbers[0];
      if (mbl) {
        const masterRecordId =
          payload?.tOIMMainDto?.fId ??
          payload?.tOIMMainDto?.FId ??
          payload?.tOIMMainDto?.fid ??
          payload?.tOIMMainDto?.id ??
          payload?.tOIMMainDto?.Id ??
          null;
        metaMap[mbl] = {
          kind: "MBL",
          recordId: coerceNumber(masterRecordId),
          tbName: TB_NAME_OIM,
          ...(firstHouse
            ? firstHouse.meta
            : { customerName: "", customerShort: "" }),
        };
      }
      hblNumbers.forEach(({ number, meta, recordId }) => {
        metaMap[number] = {
          kind: "HBL",
          recordId: coerceNumber(recordId),
          tbName: TB_NAME_OIH,
          ...meta,
        };
      });

      const combinedList = [];
      if (mbl) combinedList.push(mbl);
      combinedList.push(...hblNumbers.map((entry) => entry.number));

      if (combinedList.length) {
        const defaultPreferred = (hblNumbers[0]?.number || "").toString().trim() || mbl || combinedList[0];
        const preferredBl = preferredBlFromInput && combinedList.includes(preferredBlFromInput)
          ? preferredBlFromInput
          : defaultPreferred;

        setAcBL({
          list: combinedList,
          index: combinedList.length ? 0 : -1,
          visible: false,
        });
        setBlMeta(metaMap);

        // Auto-select the first HBL (preferred) to drive header population.
        setSelectedBL(preferredBl);

        // Populate header immediately (don't rely only on async blMeta state).
        const metaOverride = metaMap?.[preferredBl];
        if (metaOverride) {
          const normalizedMeta = metaToCustomerOption(metaOverride);
          const combined = normalizedMeta
            ? optionLabel(normalizedMeta)
            : formatBillToFromMeta(metaOverride);
          if (combined) setBillTo(combined);

          const normalizedId = normalizedMeta
            ? coerceNumber(normalizedMeta.id) ?? coerceNumber(normalizedMeta.value)
            : null;
          const derivedCustomerId =
            typeof normalizedId === "number"
              ? normalizedId
              : coerceNumber(metaOverride.customerId);
          setSelectedCustomerId(
            typeof derivedCustomerId === "number" ? derivedCustomerId : null
          );
        }

        // If lookup payload didn't include line items, try to auto-populate from templates.
        if (!extractedLines.length) {
          setAutoPopulateAfterRef(true);
        }
        return;
      }

      setRefLookupError("No BL information returned for this reference.");
      applyTemplateBLFallback(query);
    } catch (err) {
      console.warn("[CreateInvoice] invoice lookup failed", err);
      setRefLookupError(err?.message || "Unable to load invoice details");
      setBlMeta({});
      applyTemplateBLFallback(query);
    } finally {
      setRefSearching(false);
    }
  };

  // initialize header fields when selectedRef or selectedBL change
  const refreshHeader = (refVal, blVal) => {
    if (!refVal && !blVal) return;
    // billTo from templates if available
    let bt = "";
    try {
      const templates = JSON.parse(
        sessionStorage.getItem("templates") || "null"
      );
      if (Array.isArray(templates)) {
        let t = null;
        if (refVal)
          t = templates.find(
            (it) =>
              (it.ref || "").toLowerCase() === (refVal || "").toLowerCase()
          );
        if (!t && blVal)
          t = templates.find(
            (it) => Array.isArray(it.blNumbers) && it.blNumbers.includes(blVal)
          );
        if (!t && templates.length) t = templates[0];
        if (t && t.customer) bt = t.customer;
      }
    } catch (err) {
      /* ignore */
    }

    const metaOverride = blMeta?.[blVal];
    let derivedCustomerId = null;
    if (metaOverride) {
      const normalizedMeta = metaToCustomerOption(metaOverride);
      const combined = normalizedMeta
        ? optionLabel(normalizedMeta)
        : formatBillToFromMeta(metaOverride);
      if (combined) bt = combined;

      const normalizedId = normalizedMeta
        ? coerceNumber(normalizedMeta.id) ?? coerceNumber(normalizedMeta.value)
        : null;
      derivedCustomerId =
        typeof normalizedId === "number"
          ? normalizedId
          : coerceNumber(metaOverride.customerId);

      if (normalizedMeta) {
        setCustomerOptions((prev) => {
          const label = (optionLabel(normalizedMeta) || "").toLowerCase();
          const value = (normalizedMeta.value || "")
            .toString()
            .toLowerCase();
          const exists = prev.some(
            (opt) =>
              (optionLabel(opt) || "").toLowerCase() === label &&
              (opt.value || "").toString().toLowerCase() === value
          );
          if (exists) return prev;
          return [...prev, normalizedMeta];
        });
      }
    }

    setBillTo(bt);
    setSelectedCustomerId(
      typeof derivedCustomerId === "number" ? derivedCustomerId : null
    );
  };

  React.useEffect(() => {
    refreshHeader(selectedRef, selectedBL);
  }, [selectedRef, selectedBL, blMeta]);

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
    if (!val || val.value === "__loading" || val.value === "__empty")
      return;
    const normalized = normalizeCustomerOption(val);
    if (!normalized) return;
    setBillTo(normalized.name);
    const parsedId =
      coerceNumber(normalized.id) ?? coerceNumber(normalized.value);
    setSelectedCustomerId(parsedId ?? null);
    setAcBill({ list: [], index: -1, visible: false, query: "" });
  };

  const handleAutoPopulate = async () => {
    const normalizedBillTo = (billTo || "").trim();
    if (!normalizedBillTo) {
      setRefLookupError(
        "Bill To is required before auto-populating invoice details."
      );
      return;
    }

    try {
      const templates = await fetchInvoiceTemplatesByCustomer(normalizedBillTo);
      const template =
        Array.isArray(templates) && templates.length ? templates[0] : null;
      if (!template || !template.items?.length) {
        setRefLookupError("No invoice template found for this Bill To.");
        return;
      }

      const templateTerm = Number(template.netTerm);
      if (!Number.isNaN(templateTerm) && templateTerm >= 0) {
        setNetTerm(templateTerm);
        const baseDate =
          invoiceDate instanceof Date
            ? invoiceDate
            : new Date(invoiceDate || Date.now());
        const due = new Date(baseDate);
        due.setDate(due.getDate() + templateTerm);
        setDueDate(due);
      }

      const mapped = template.items.map((it, idx) => ({
        id: idx + 1,
        billingCode: it.billingCode || it.code || "",
        description: it.description || it.desc || "",
        rate: typeof it.rate !== "undefined" ? it.rate : it.amount || 0,
        qty: typeof it.qty !== "undefined" ? it.qty : 1,
      }));
      setItems(mapped);
      setRefLookupError(null);
    } catch (err) {
      console.warn("[CreateInvoice] auto populate lookup failed", err);
      setRefLookupError(
        err?.message || "Unable to load invoice template for this Bill To."
      );
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
      : [{ id: 1, billingCode: "", description: "", rate: 0, qty: 1 }]
  );
  const updateItem = (id, field, value) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, [field]: value } : it))
    );
  };

  useEffect(() => {
    if (!autoPopulateAfterRef) return;
    if (refSearching) return;
    const normalizedBillTo = (billTo || "").trim();
    if (!normalizedBillTo) return;

    const hasMeaningfulLines = (items || []).some((it) => {
      if (!it) return false;
      const code = (it.billingCode || "").toString().trim();
      const desc = (it.description || "").toString().trim();
      const rate = Number(it.rate) || 0;
      // qty defaults to 1 in the blank line; don't use it to decide if lines are populated.
      return Boolean(code || desc || rate > 0);
    });

    // If something already populated the lines, don't overwrite.
    if (hasMeaningfulLines) {
      setAutoPopulateAfterRef(false);
      return;
    }

    setAutoPopulateAfterRef(false);
    // Populate terms + items from templates.
    handleAutoPopulate();
  }, [autoPopulateAfterRef, billTo, items, refSearching]);

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
    const maxHeight = Math.max(120, Math.min(260, window.innerHeight - top - margin));

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
    const maxHeight = Math.max(140, Math.min(260, window.innerHeight - top - margin));

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
        const results = await getBillingCodes("");
        if (!alive) return;
        const normalized = normalizeCodes(results);
        setBillingCodeOptions(normalized);
      } catch (err) {
        // ignore preload failures; live search will still work.
      } finally {
        if (alive) setBillingCodeBootstrapped(true);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      Object.values(billingDebounce.current || {}).forEach((timer) =>
        clearTimeout(timer)
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
              (o.desc && o.desc.toLowerCase().includes(lowered))
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
        const results = await getBillingCodes(q);
        let list = (results || []).map((it) => ({
          code: (it?.value ?? it?.code ?? "").toString().trim(),
          desc: (it?.name ?? it?.description ?? it?.desc ?? "").toString().trim(),
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
          list = [{ code: "__empty", desc: "No matching billing codes", disabled: true }];
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
    if (opt.disabled || opt.code === "__loading" || opt.code === "__empty") return;
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
      prev.length > 1 ? prev.filter((i) => i.id !== id) : prev
    );

  const itemAmount = (it) => {
    const r = parseFloat(it.rate) || 0;
    const q = parseFloat(it.qty) || 0;
    return r * q;
  };

  const subtotal = useMemo(
    () => items.reduce((s, it) => s + itemAmount(it), 0),
    [items]
  );

  const lineStats = useMemo(() => {
    const ready = items.filter((it) => it.billingCode && it.description).length;
    const zeroTotals = items.filter((it) => itemAmount(it) <= 0).length;
    return {
      total: items.length,
      ready,
      pending: Math.max(items.length - ready, 0),
      zeroTotals,
    };
  }, [items]);

  const avgLineAmount = useMemo(
    () => (lineStats.total ? subtotal / lineStats.total : 0),
    [lineStats.total, subtotal]
  );

  const readiness = useMemo(
    () => ({
      reference: Boolean((selectedRef || refSearchTerm || "").trim()),
      customer: Boolean((billTo || "").trim() && selectedCustomerId),
      schedule: Boolean(invoicePostDate && invoiceDate && dueDate),
      lines: lineStats.total > 0 && lineStats.ready === lineStats.total,
    }),
    [selectedRef, refSearchTerm, billTo, selectedCustomerId, invoicePostDate, invoiceDate, dueDate, lineStats.total, lineStats.ready]
  );

  const progressSteps = useMemo(
    () => [
      {
        label: "Reference search",
        complete: readiness.reference,
        detail: readiness.reference
          ? selectedRef || refSearchTerm
          : "Search reference to load BLs",
      },
      {
        label: "Bill-to selection",
        complete: readiness.customer,
        detail: readiness.customer ? billTo || "Customer selected" : "Pick customer",
      },
      {
        label: "Schedule & terms",
        complete: readiness.schedule,
        detail: readiness.schedule
          ? `${netTerm || 0}-day • ${formatDisplayDate(dueDate)}`
          : "Set invoice dates",
      },
      {
        label: "Line validation",
        complete: readiness.lines,
        detail: `${lineStats.ready}/${lineStats.total || 0} ready`,
      },
    ],
    [readiness, selectedRef, refSearchTerm, billTo, netTerm, dueDate, lineStats.ready, lineStats.total]
  );

  const getSelectedBlMeta = () => {
    if (selectedBL && blMeta?.[selectedBL]) return blMeta[selectedBL];
    const keys = Object.keys(blMeta || {});
    return keys.length ? blMeta[keys[0]] : null;
  };

  const handleSaveInvoice = async (e) => {
    e?.preventDefault();

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

      const selectedMeta = getSelectedBlMeta();
      const resolvedCustomerId =
        coerceNumber(selectedCustomerId) ??
        coerceNumber(selectedMeta?.customerId) ??
        0;
      const resolvedTbId = coerceNumber(selectedMeta?.recordId) ?? 161909;
      const resolvedTbName =
        selectedMeta?.tbName ??
        (selectedMeta?.kind === "MBL"
          ? TB_NAME_OIM
          : selectedMeta?.kind === "HBL"
          ? TB_NAME_OIH
          : "T_OIHMAIN");

      // Prepare API payload
      const apiPayload = {
        branch: userBranch || "",
        tbId: resolvedTbId,
        tbName: resolvedTbName,
        invoiceNo: (invoiceNumber || "").toString().trim(),
        customerId: resolvedCustomerId,
        postDate: formatDateForAPI(invoicePostDate),
        invoiceDate: formatDateForAPI(invoiceDate),
        dueDate: formatDateForAPI(dueDate),
        invoiceAmount: invoiceAmount,
        customerRefNo: selectedRef || "",
        userID: userIdForPayload || "",
        oiRates: oiRates,
      };

      console.log("Saving invoice with data:", apiPayload);

      // Call the save API
      const response = await saveInvoice(apiPayload);

      if (response?.success) {
        alert(`Invoice saved successfully! ${response.message || ""}`);
        console.log("Invoice save response:", response);

        // Optional: Navigate back or clear form
        if (typeof onCancel === "function") {
          onCancel(); // Go back to previous page
        }
      } else {
        throw new Error(response?.message || "Failed to save invoice");
      }
    } catch (error) {
      console.error("Error saving invoice:", error);
      alert(
        `Error saving invoice: ${error.message || "Unknown error occurred"}`
      );
    }
  };

  // default cancel behavior navigates back to invoices list if no onCancel provided
  const internalCancel = () => {
    try {
      if (typeof onCancel === "function") return onCancel();
      // attempt to navigate using history if available
      window.location.hash = "#/invoices";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    } catch (err) {
      // final fallback: set location
      window.location.href = "/#/invoices";
    }
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
              onChange={(e) => setSelectedBL(e.target.value)}
            >
              <option value="">Select BL</option>
              {acBL.list.map((b) => (
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
        <header className="panel-heading">
          <div>
            <h3>Invoice header</h3>
          </div>
        </header>
        <div className="header-grid">
          <div className="field span-2 customer-field">
            <label>Bill To</label>
            <div className="ac-wrap">
              <input
                className="input-control"
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
                  setTimeout(() => setAcBill((s) => ({ ...s, visible: false })), 120)
                }
              />
              {selectedCustomerId && (
                <span className="customer-id-chip">ID #{selectedCustomerId}</span>
              )}
              {acBill.visible && typeof document !== "undefined" &&
                createPortal(
                  <ul
                    className="ac-list ac-list-portal"
                    role="listbox"
                    style={billToAcStyle || undefined}
                  >
                    {acBill.list.map((opt, idx) => {
                      const label = optionLabel(opt) || "Unnamed";
                      const key = `${opt?.value || label}-${idx}`;
                      const disabled = Boolean(opt?.disabled || opt?.value === "__loading");
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

          <div className="field with-action">
            <label>Invoice Number</label>
            <div className="input-row">
              <input
                className="input-control"
                type="text"
                inputMode="numeric"
                autoComplete="new-password"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="Enter invoice #"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
              />
              <button
                type="button"
                className="btn ghost"
                onClick={handleAutoPopulate}
                title="Auto populate line items from template"
              >
                Auto
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="panel line-panel">
        <header className="panel-heading">
          <div>
            <h3>Invoice Items</h3>
          </div>

        </header>
        <div className="line-table-wrapper">
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
              {items.map((it) => (
                <tr key={it.id}>
                  <td className="billing-cell">
                    <input
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
                            list: [{ code: "__loading", desc: "Loading...", disabled: true }],
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
                        setTimeout(() => setAc((s) => ({ ...s, visible: false })), 150)
                      }
                      ref={(el) => {
                        refs.current[it.id] = refs.current[it.id] || {};
                        refs.current[it.id].billingCode = el;
                      }}
                    />

                    {ac.visible && ac.id === it.id && typeof document !== "undefined" &&
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
                                {opt.desc && <div className="ac-desc">{opt.desc}</div>}
                              </div>
                            </li>
                          ))}
                        </ul>,
                        document.body
                      )}
                  </td>
                  <td>
                    <input
                      value={it.description}
                      onChange={(e) => updateItem(it.id, "description", e.target.value)}
                      ref={(el) => {
                        refs.current[it.id] = refs.current[it.id] || {};
                        refs.current[it.id].description = el;
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={it.rate}
                      onChange={(e) => updateItem(it.id, "rate", e.target.value)}
                      ref={(el) => {
                        refs.current[it.id] = refs.current[it.id] || {};
                        refs.current[it.id].rate = el;
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
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
                              if (node && typeof node.focus === "function") node.focus();
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
          <div className="line-metrics">
          </div>
          <div className="subtotal-card">
            <p>Subtotal</p>
            <strong>${subtotal.toFixed(2)}</strong>
          </div>
        </div>
        <div className="action-row">
          <button type="button" className="btn ghost" onClick={internalCancel}>
            Cancel
          </button>
          <button className="btn primary" type="button" onClick={handleSaveInvoice}>
            Save invoice
          </button>
        </div>
      </section>
    </div>
  );
}

export default CreateInvoice;
