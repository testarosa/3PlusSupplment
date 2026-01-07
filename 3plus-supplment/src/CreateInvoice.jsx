import React, { useState, useMemo, useRef, useEffect } from "react";
import { useSelector } from "react-redux";
import "./CreateInvoice.css";
import "./CreateInvoiceTemplate.css";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { fetchInvoiceTemplatesByCustomer } from "./api/invoiceTemplates";
import { getInvoiceByRef, saveInvoice } from "./api/invoices";
import { getCustomersByName } from "./api/customers";
import { getBillingCodes } from "./api/billingCodes";
import { selectAuth } from "./store/slices/authSlice";

const TB_NAME_OIM = "T_OIMMAIN";
const TB_NAME_OIH = "T_OIHMAIN";

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
    initialData?.invoiceNumber ?? ""
  );
  // Ref/search state (re-added per request)
  const [refSearchTerm, setRefSearchTerm] = useState(initialData?.ref ?? "");
  const [selectedRef, setSelectedRef] = useState(initialData?.ref ?? "");
  const [refLookupError, setRefLookupError] = useState(null);
  const [refSearching, setRefSearching] = useState(false);

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
    const query = (refSearchTerm || "").trim();
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
        setAcBL({
          list: combinedList,
          index: combinedList.length ? 0 : -1,
          visible: false,
        });
        setBlMeta(metaMap);
        setSelectedBL("");
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

  const refs = useRef({});
  const billingDebounce = useRef({});

  // Billing code autocomplete options (sample/demo data)
  const billingCodeOptions = [];

  const [ac, setAc] = useState({
    id: null,
    list: [],
    index: -1,
    visible: false,
    query: "",
  });

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

    if (!q || q.length < 2) {
      const lowered = q.toLowerCase();
      const list = lowered
        ? billingCodeOptions.filter(
            (o) =>
              o.code.toLowerCase().includes(lowered) ||
              (o.desc && o.desc.toLowerCase().includes(lowered))
          )
        : billingCodeOptions.slice(0, 6);
      setAc({
        id,
        list,
        index: list.length ? 0 : -1,
        visible: list.length > 0,
        query: value,
      });
      return;
    }

    setAc({
      id,
      list: [{ code: "__loading", desc: "Searching..." }],
      index: 0,
      visible: true,
      query: value,
    });

    billingDebounce.current[id] = setTimeout(async () => {
      try {
        const results = await getBillingCodes(q);
        let list = (results || []).map((it) => ({
          code: (it?.value ?? it?.code ?? "").toString(),
          desc:
            (it?.name ?? it?.description ?? it?.desc ?? "").toString(),
        }));
        const seen = new Set();
        list = list.filter((it) => {
          const key = `${it.code.toLowerCase()}::${(it.desc || "").toLowerCase()}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return Boolean(it.code);
        });
        setAc({
          id,
          list,
          index: list.length ? 0 : -1,
          visible: list.length > 0,
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
    <div className="create-invoice-root">
      <h2>{title}</h2>

      <div style={{ marginTop: "1rem" }}>
        <div className="invoice-header-box">
          <form onSubmit={doRefSearch} className="create-ref-form">
            <div className="field" style={{ width: "100%" }}>
              <label>Reference Number</label>
              <div
                style={{
                  display: "flex",
                  gap: "0.65rem",
                  alignItems: "flex-start",
                  width: "100%",
                }}
              >
                <div className="ac-wrap ref-wrap" style={{ flex: 1 }}>
                  <input
                    className="ref-input"
                    placeholder="Reference number"
                    value={refSearchTerm}
                    onChange={(e) => handleRefChange(e.target.value)}
                  />
                </div>

                <button
                  className="search-btn ref-search-btn"
                  type="submit"
                  disabled={refSearching}
                >
                  {refSearching ? "Searching..." : "Search"}
                </button>
              </div>

              <div style={{ marginTop: "0.75rem" }}>
                <select
                  className="bl-dropdown"
                  value={selectedBL || ""}
                  onChange={(e) => setSelectedBL(e.target.value)}
                  aria-label="Select BL"
                  style={{ width: "100%" }}
                >
                  <option value="">Select BL</option>
                  {acBL.list.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>

              {refLookupError && (
                <div className="error-row" style={{ marginTop: "0.5rem" }}>
                  {refLookupError}
                </div>
              )}
            </div>
          </form>
          {/* Editable invoice header row */}
          <div className="invoice-readonly-row" style={{ marginTop: "1rem" }}>
            <div className="field">
              <label>Bill To</label>
              <div
                className="ac-wrap bill-wrap"
                style={{ position: "relative" }}
              >
                <input
                  className="readonly-input"
                  placeholder="Bill To"
                  value={billTo}
                  onChange={(e) => handleBillChange(e.target.value)}
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
                      120
                    )
                  }
                />

                {acBill.visible && (
                  <ul
                    className="ac-list"
                    role="listbox"
                    style={{ top: "calc(100% + 6px)" }}
                  >
                    {acBill.list.map((opt, idx) => {
                      const label = optionLabel(opt) || "Unnamed";
                      const key = `${opt?.value || label}-${idx}`;
                      const disabled = Boolean(
                        opt?.disabled || opt?.value === "__loading"
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
                  </ul>
                )}
              </div>
              <button
                type="button"
                className="auto-pop-btn"
                style={{ marginTop: "0.5rem" }}
                onClick={handleAutoPopulate}
                title="Auto populate invoice number"
              >
                Auto Populate
              </button>
            </div>

            <div className="field">
              <label>Invoice Post Date</label>
              <DatePicker
                className="readonly-input"
                selected={invoicePostDate}
                onChange={(d) => setInvoicePostDate(d)}
                dateFormat="yyyy-MM-dd"
              />
            </div>

            <div className="field">
              <label>Invoice Date</label>
              <DatePicker
                className="readonly-input"
                selected={invoiceDate}
                onChange={(d) => setInvoiceDate(d)}
                dateFormat="yyyy-MM-dd"
              />
            </div>

            <div className="field">
              <label>Term (days)</label>
              <input
                type="number"
                className="readonly-input"
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
                className="readonly-input"
                selected={dueDate}
                onChange={(d) => setDueDate(d)}
                dateFormat="yyyy-MM-dd"
              />
            </div>

            <div className="field">
              <label>Invoice Number</label>
              <input
                className="readonly-input"
                readOnly
                value={invoiceNumber}
              />
            </div>
          </div>
          {/* Line items area (copied from CreateInvoiceTemplate) */}
          <div className="items-area" style={{ marginTop: "1rem" }}>
            <div className="items-header">
              <h3>Line Items</h3>
            </div>

            <table className="items-table">
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
                            150
                          )
                        }
                        ref={(el) => {
                          refs.current[it.id] = refs.current[it.id] || {};
                          refs.current[it.id].billingCode = el;
                        }}
                      />

                      {ac.visible && ac.id === it.id && (
                        <ul className="ac-list" role="listbox">
                          {ac.list.map((opt, idx) => (
                            <li
                              key={opt.code}
                              className={idx === ac.index ? "active" : ""}
                              onMouseDown={(ev) => {
                                ev.preventDefault();
                                selectAc(it.id, opt);
                              }}
                              role="option"
                              aria-selected={idx === ac.index}
                            >
                              <div className="ac-code">{opt.code}</div>
                              {opt.desc && (
                                <div className="ac-desc">{opt.desc}</div>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td>
                      <input
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
                        value={it.qty}
                        onChange={(e) =>
                          updateItem(it.id, "qty", e.target.value)
                        }
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
                        className="remove-btn"
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

            <div className="subtotal-row">
              <div className="subtotal">Subtotal: ${subtotal.toFixed(2)}</div>
            </div>

            <div className="form-actions invoice-actions-centered">
              <button
                type="button"
                className="remove-btn"
                onClick={internalCancel}
              >
                Cancel
              </button>
              <button
                className="save-btn"
                type="button"
                onClick={handleSaveInvoice}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CreateInvoice;
