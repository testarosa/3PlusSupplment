import api from "./auth";
import { buildApiUrl } from "./config";

const TEMPLATE_CREATE_PATH = buildApiUrl("/api/InvoiceTemplates");
const TEMPLATES_PATH = buildApiUrl("/api/InvoiceTemplates");

const normalizeTemplate = (tpl) => {
  if (!tpl || typeof tpl !== "object") return null;
  const items = Array.isArray(tpl.details)
    ? tpl.details.map((det, idx) => ({
        id: det?.id ?? idx + 1,
        billingCode: det?.billingCode ?? "",
        description: det?.description ?? "",
        rate: det?.rate ?? 0,
        qty: det?.qty ?? 1,
        amount: det?.amount ?? (det?.rate || 0) * (det?.qty || 0),
        invoiceHeaderTemplateId: det?.invoiceHeaderTemplateId ?? tpl.id,
      }))
    : [];

  return {
    ...tpl,
    customerId: tpl.billTo ?? tpl.customerId ?? null,
    customerName: tpl.billToName ?? tpl.customerName ?? "",
    netTerm: tpl.term ?? tpl.netTerm ?? 30,
    freightTypeCode: tpl.freightType ?? tpl.freightTypeCode ?? "",
    items,
  };
};

// POST /api/InvoiceTemplates
export async function saveInvoiceTemplate(payload) {
  try {
    const res = await api.post(TEMPLATE_CREATE_PATH, payload, {
      headers: { accept: "text/plain", "Content-Type": "application/json" },
    });
    const data = res?.data;
    return normalizeTemplate(data?.data ?? data);
  } catch (err) {
    console.warn("[saveInvoiceTemplate] error", err?.message || err);
    throw err;
  }
}

// PUT /api/InvoiceTemplates/{id}
export async function updateInvoiceTemplate(id, payload) {
  if (!id && id !== 0) throw new Error("Template id is required for update");
  try {
    const res = await api.put(`${TEMPLATES_PATH}/${id}`, payload, {
      headers: { accept: "text/plain", "Content-Type": "application/json" },
    });
    const data = res?.data;
    return normalizeTemplate(data?.data ?? data);
  } catch (err) {
    console.warn("[updateInvoiceTemplate] error", err?.message || err);
    throw err;
  }
}

// GET /api/InvoiceTemplates?customerName=...
export async function fetchInvoiceTemplates(customerName = "") {
  const params = new URLSearchParams();
  if (customerName) params.set("customerName", customerName);
  const query = params.toString() ? `?${params.toString()}` : "";
  try {
    const res = await api.get(`${TEMPLATES_PATH}${query}`, {
      headers: { accept: "text/plain" },
    });
    const payload = res?.data;
    const list = Array.isArray(payload?.data) ? payload.data : [];
    return { list, raw: payload };
  } catch (err) {
    console.warn("[fetchInvoiceTemplates] error", err?.message || err);
    throw err;
  }
}

// GET /api/InvoiceTemplates/{id}
export async function fetchInvoiceTemplateById(id) {
  if (!id && id !== 0) throw new Error("Template id is required");
  try {
    const res = await api.get(`${TEMPLATES_PATH}/${id}`, {
      headers: { accept: "text/plain" },
    });
    const payload = res?.data;
    return normalizeTemplate(payload?.data ?? payload);
  } catch (err) {
    console.warn("[fetchInvoiceTemplateById] error", err?.message || err);
    throw err;
  }
}

export async function fetchInvoiceTemplatesByCustomer(billToName) {
  if (!billToName) throw new Error("billToName is required");
  try {
    const endpoint = `${TEMPLATES_PATH}/by-customer?billToName=${encodeURIComponent(
      billToName
    )}`;
    const res = await api.get(endpoint, { headers: { accept: "text/plain" } });
    const payload = res?.data;
    const list = Array.isArray(payload?.data)
      ? payload.data.map(normalizeTemplate).filter(Boolean)
      : [];
    return list;
  } catch (err) {
    console.warn(
      "[fetchInvoiceTemplatesByCustomer] error",
      err?.message || err
    );
    throw err;
  }
}

// DELETE /api/InvoiceTemplates/{id}
export async function deleteInvoiceTemplate(id) {
  if (!id && id !== 0) throw new Error("Template id is required for delete");
  try {
    const res = await api.delete(`${TEMPLATES_PATH}/${id}`, {
      headers: { accept: "text/plain" },
    });
    return res?.data;
  } catch (err) {
    console.warn("[deleteInvoiceTemplate] error", err?.message || err);
    throw err;
  }
}

export default {
  saveInvoiceTemplate,
  updateInvoiceTemplate,
  fetchInvoiceTemplates,
  fetchInvoiceTemplateById,
  deleteInvoiceTemplate,
};
