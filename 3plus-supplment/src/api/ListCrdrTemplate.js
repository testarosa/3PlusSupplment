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
    templateName: header.templateName ?? header.TemplateName ?? header.name ?? header.Name ?? "",
    name: header.name ?? header.Name ?? header.templateName ?? header.TemplateName ?? "",
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

const buildCrdrTemplateQuery = ({ name, agentName, userName }) => {
  const qp = new URLSearchParams();
  qp.set("name", String(name ?? "").trim());
  qp.set("agentName", String(agentName ?? "").trim());
  qp.set("userName", String(userName ?? "").trim());
  return qp.toString();
};

// GET /CrdrTemplate/GetTemplate?name=...&agentName=...&userName=...
export async function getCrdrTemplate({ name, agentName, userName }) {
  const query = buildCrdrTemplateQuery({ name, agentName, userName });
  const endpoint = buildInvoiceApiUrl(`/CrdrTemplate/GetTemplate?${query}`);

  try {
    const resp = await axios.get(endpoint, {
      headers: { accept: "text/plain, application/json" },
    });

    const parsed = parseMaybeJson(resp?.data);
    const list = Array.isArray(parsed?.data) ? parsed.data : [];

    return list.map(normalizeCrdrTemplateHeader).filter(Boolean);
  } catch (err) {
    console.warn("[getCrdrTemplate] error", err?.message || err);
    throw err;
  }
}

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

// GET /CrdrTemplate/GetByAgentId?agentId=...
export async function getCrdrTemplateByAgentId(agentId) {
  if (agentId === undefined || agentId === null || String(agentId).trim() === "") {
    throw new Error("agentId is required")
  }

  const endpoint = buildInvoiceApiUrl(
    `/CrdrTemplate/GetByAgentId?agentId=${encodeURIComponent(String(agentId).trim())}`
  )

  try {
    const resp = await axios.get(endpoint, {
      headers: { accept: "text/plain, application/json" },
    })

    const parsed = parseMaybeJson(resp?.data)
    const list = Array.isArray(parsed?.data) ? parsed.data : []

    return list.map(normalizeCrdrTemplateHeader).filter(Boolean)
  } catch (err) {
    console.warn("[getCrdrTemplateByAgentId] error", err?.message || err)
    throw err
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

// POST /CrdrTemplate/Update
export async function updateCrdrTemplate(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("payload is required");
  }

  const endpoint = buildInvoiceApiUrl("/CrdrTemplate/Update");

  try {
    const resp = await axios.post(endpoint, payload, {
      headers: { accept: "text/plain", "Content-Type": "application/json" },
      responseType: "text",
    });

    return parseMaybeJson(resp?.data);
  } catch (err) {
    console.warn("[updateCrdrTemplate] error", err?.message || err);
    throw err;
  }
}

// DELETE /CrdrTemplate/Delete/{id}
export async function deleteCrdrTemplate(headerId) {
  if (headerId === undefined || headerId === null || String(headerId).trim() === "") {
    throw new Error("headerId is required");
  }

  const endpoint = buildInvoiceApiUrl(
    `/CrdrTemplate/Delete/${encodeURIComponent(String(headerId).trim())}`
  );

  try {
    const resp = await axios.delete(endpoint, {
      headers: { accept: "text/plain, application/json" },
      responseType: "text",
    });

    return parseMaybeJson(resp?.data);
  } catch (err) {
    console.warn("[deleteCrdrTemplate] error", err?.message || err);
    throw err;
  }
}

export default {
  getCrdrTemplate,
  getCrdrTemplateByAgentName,
  getCrdrTemplateByAgentId,
  insertCrdrTemplate,
  updateCrdrTemplate,
  deleteCrdrTemplate,
};
