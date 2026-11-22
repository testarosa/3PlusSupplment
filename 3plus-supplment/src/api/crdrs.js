import axios from "axios";
import { PLUS_SERVICE_PATH, PORTAL_API_PATH, buildInvoiceApiUrl } from "./config";

const parseMaybeJson = (payload) => {
  if (typeof payload !== "string") return payload;
  try {
    return JSON.parse(payload);
  } catch {
    return payload;
  }
};

export const supportsCrdrUserSearch = Boolean(PLUS_SERVICE_PATH);

export async function searchCrdrs(filters, page, pageSize, signal) {
  const supplied = (value) => value?.trim() || undefined;
  const params = {
    agentName: supplied(filters.agentName),
    startDate: supplied(filters.startDate),
    endDate: supplied(filters.endDate),
  };
  if (supportsCrdrUserSearch) {
    const { data } = await axios.get(PLUS_SERVICE_PATH + "/api/credit-debit-memos/memos", {
      params: { ...params, memoNumber: supplied(filters.crdrNo), userName: supplied(filters.userName), page, pageSize },
      signal, timeout: 30_000,
    });
    if (!Array.isArray(data?.items) || !Number.isInteger(data.totalCount) || !Number.isInteger(data.totalPages))
      throw new Error("The billing service returned an unexpected credit/debit list.");
    return data;
  }

  const { data } = await axios.get(buildInvoiceApiUrl("/Crdr/GetCrdrs"), {
    params: { ...params, crdrNo: supplied(filters.crdrNo) },
    headers: { accept: "text/plain, application/json" },
    signal, timeout: 30_000,
  });
  const payload = parseMaybeJson(data);
  const rows = Array.isArray(payload) ? payload : payload?.data;
  if (!Array.isArray(rows)) throw new Error("The billing service returned an unexpected credit/debit list.");
  const offset = (page - 1) * pageSize;
  return {
    items: rows.slice(offset, offset + pageSize).map((row) => ({
      id: row.fId, memoNumber: row.fCrDbNo, agentCompanyName: row.fsName,
      postDate: row.fPostDate, invoiceDate: row.fInvoiceDate, dueDate: row.fDueDate, total: row.fTotal, currency: "USD",
    })),
    totalCount: rows.length,
    totalPages: Math.ceil(rows.length / pageSize),
  };
}

export async function getCrdrById(crdrId) {
  if (crdrId === undefined || crdrId === null || String(crdrId).trim() === "") {
    throw new Error("crdrId is required");
  }

  const endpoint = buildInvoiceApiUrl(`/Crdr/GetCrdrById/${encodeURIComponent(String(crdrId))}`);

  try {
    const resp = await axios.get(endpoint, {
      headers: { accept: "text/plain, application/json" },
    });

    return parseMaybeJson(resp?.data);
  } catch (err) {
    console.warn("[getCrdrById] error", err?.message || err);
    throw err;
  }
}

//reference number
export async function getCrdrByRefNumber(refNo) {
  const trimmed = String(refNo ?? "").trim();
  if (!trimmed) {
    throw new Error("refNo is required");
  }
  const endpoint = buildInvoiceApiUrl("/Crdr/GetCRDRByRefNumber");
  try {
    const resp = await axios.get(endpoint, {
      params: { refNo: trimmed },
      headers: { accept: "text/plain" },
      responseType: "text",
    });

    return parseMaybeJson(resp?.data);
  } catch (err) {
    console.warn("[getCrdrByRefNumber] error", err?.message || err);
    throw err;
  }
}

export async function findCrdrAirShipment(search) {
  const endpoint = buildInvoiceApiUrl("/Crdr/GetAirImportShipment");
  const { data } = await axios.get(endpoint, { params: { search }, timeout: 25_000 }).catch((error) => {
    if (error.response?.status === 404) return { data: null };
    throw error;
  });
  if (data !== null && (typeof data?.referenceNumber !== "string" ||
      !Number.isInteger(data?.master?.id) || !Array.isArray(data.houses))) {
    throw new Error("The service returned an unexpected air shipment.");
  }
  return data;
}

export async function saveCrdr(payload, { userId = "" } = {}) {
  if (!payload || typeof payload !== "object") {
    throw new Error("payload is required");
  }

  const endpoint = buildInvoiceApiUrl(
    `/Crdr/SaveCrdr?userId=${encodeURIComponent(String(userId))}`
  );

  try {
    const resp = await axios.post(endpoint, payload, {
      headers: { accept: "text/plain", "Content-Type": "application/json" },
      responseType: "text",
    });

    return parseMaybeJson(resp?.data);
  } catch (err) {
    console.warn("[saveCrdr] error", err?.message || err);
    throw err;
  }
}

export async function extractCrdrDocument(file) {
  const response = await axios.post(`${PORTAL_API_PATH}/crdr-ai/extract`, file, {
    headers: { "Content-Type": file.type },
    timeout: 100_000,
  });
  if (!Array.isArray(response.data?.lines) || !response.data.lines.length) {
    throw new Error("3Plus AI extraction is unavailable on this portal.");
  }
  return response.data;
}

export default {
  searchCrdrs,
  getCrdrById,
  getCrdrByRefNumber,
  saveCrdr,
};
