import axios from "axios";
import { PORTAL_API_PATH, buildInvoiceApiUrl } from "./config";

const parseMaybeJson = (payload) => {
  if (typeof payload !== "string") return payload;
  try {
    return JSON.parse(payload);
  } catch {
    return payload;
  }
};

export async function searchCrdrs(filters = {}) {
  const params = new URLSearchParams();

  Object.entries({
    crdrNo: filters.crdrNo,
    agentName: filters.agentName,
    startDate: filters.startDate,
    endDate: filters.endDate,
  }).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim().length) {
      params.append(key, value);
    }
  });

  const query = params.toString();
  const endpoint = buildInvoiceApiUrl(
    query ? `/Crdr/GetCrdrs?${query}` : "/Crdr/GetCrdrs"
  );

  try {
    const resp = await axios.get(endpoint, {
      headers: { accept: "text/plain, application/json" },
    });

    const parsed = parseMaybeJson(resp?.data);
    return parsed;
  } catch (err) {
    console.warn("[searchCrdrs] error", err?.message || err);
    throw err;
  }
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
    throw new Error("Azure AI extraction is unavailable on this portal.");
  }
  return response.data;
}

export default {
  searchCrdrs,
  getCrdrById,
  getCrdrByRefNumber,
  saveCrdr,
};
