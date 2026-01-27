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

const normalizeCrdrTemplateHeader = (header) => {
  if (!header || typeof header !== "object") return null;

  return {
    headerId: header.headerId ?? header.HeaderId ?? header.id ?? header.Id,
    userName: header.userName ?? header.UserName ?? "",
    freightType: header.freightType ?? header.FreightType ?? "",
    agent: header.agent ?? header.Agent ?? null,
    agentName: header.agentName ?? header.AgentName ?? "",
    term: header.term ?? header.Term ?? 0,
    details: Array.isArray(header.details)
      ? header.details.map((det, idx) => ({
          detailId: det?.detailId ?? det?.DetailId ?? det?.id ?? det?.Id ?? idx + 1,
          code: det?.code ?? det?.Code ?? null,
          description: det?.description ?? det?.Description ?? "",
          revenue: det?.revenue ?? det?.Revenue ?? 0,
          cost: det?.cost ?? det?.Cost ?? 0,
          ppcc: det?.ppcc ?? det?.PPCC ?? null,
          debit: det?.debit ?? det?.Debit ?? 0,
          credit: det?.credit ?? det?.Credit ?? 0,
          pShare: det?.pShare ?? det?.PShare ?? "0",
          pShareField: det?.pShareField ?? det?.PShareField ?? "0",
        }))
      : [],
  };
};

// GET /CrdrTemplate/GetByAgentName?agentName=...
export async function getCrdrTemplateByAgentName(agentName) {
  if (!agentName || !String(agentName).trim().length) {
    throw new Error("agentName is required");
  }

  const endpoint = buildInvoiceApiUrl(
    `/CrdrTemplate/GetByAgentName?agentName=${encodeURIComponent(String(agentName).trim())}`
  );

  try {
    const resp = await axios.get(endpoint, {
      headers: { accept: "text/plain, application/json" },
    });

    const parsed = parseMaybeJson(resp?.data);
    const list = Array.isArray(parsed?.data) ? parsed.data : [];

    return list.map(normalizeCrdrTemplateHeader).filter(Boolean);
  } catch (err) {
    console.warn("[getCrdrTemplateByAgentName] error", err?.message || err);
    throw err;
  }
}

// POST /CrdrTemplate/Insert
export async function insertCrdrTemplate(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("payload is required");
  }

  const endpoint = buildInvoiceApiUrl("/CrdrTemplate/Insert");

  try {
    const resp = await axios.post(endpoint, payload, {
      headers: { accept: "text/plain", "Content-Type": "application/json" },
    });

    const parsed = parseMaybeJson(resp?.data);
    return parsed;
  } catch (err) {
    console.warn("[insertCrdrTemplate] error", err?.message || err);
    throw err;
  }
}

export default {
  getCrdrTemplateByAgentName,
  insertCrdrTemplate,
};
