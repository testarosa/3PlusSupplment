import axios from "axios";
import { buildInvoiceApiUrl } from "./config";

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

export default {
  searchCrdrs,
  getCrdrById,
};
