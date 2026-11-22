import { Buffer } from "node:buffer";
import contract from "./crdrExtractionContract.json" with { type: "json" };
import apContract from "./apInvoiceExtractionContract.json" with { type: "json" };

const MAX_BYTES = 10 * 1024 * 1024;
const signatures = new Map([
  ["application/pdf", Buffer.from("%PDF-")],
  ["image/png", Buffer.from("89504e470d0a1a0a", "hex")],
  ["image/jpeg", Buffer.from("ffd8ff", "hex")],
]);

export function createCrdrExtractionHandler(env, fetchAzure = fetch) {
  return createExtractionHandler(env, fetchAzure, contract, "credit_debit_note", "note", (draft) =>
    ["credit", "debit", "mixed"].includes(draft?.noteType) && Array.isArray(draft.lines) && draft.lines.length > 0 &&
    draft.lines.every((line) => typeof line?.description === "string" && line.description.trim() &&
      Number.isFinite(line.debit) && Number.isFinite(line.credit) &&
      line.debit >= 0 && line.credit >= 0 && (line.debit || line.credit)));
}

export function createApInvoiceExtractionHandler(env, fetchAzure = fetch) {
  return createExtractionHandler(env, fetchAzure, apContract, "ap_invoice", "invoice", (draft) =>
    draft?.isInvoice === true && Array.isArray(draft.invoicePages) && draft.invoicePages.length > 0 &&
    draft.invoicePages.every((page) => Number.isSafeInteger(page) && page > 0) &&
    (draft.printedAmount === null ? draft.printedAmountKind === null
      : Number.isFinite(draft.printedAmount) && ["invoice_total", "balance"].includes(draft.printedAmountKind)) &&
    Array.isArray(draft.lines) && draft.lines.length > 0 &&
    draft.lines.every((line) => typeof line?.description === "string" && line.description.trim() &&
      Number.isFinite(line.amount)));
}

function createExtractionHandler(env, fetchAzure, { instructions, schema }, name, kind, isValid) {
  const key = env.AZURE_OPENAI_API_KEY?.trim();
  const deployment = env.AZURE_OPENAI_DEPLOYMENT?.trim();
  const endpoint = env.AZURE_OPENAI_ENDPOINT?.trim();
  const configured = key && deployment && /^https:\/\/[a-z0-9-]+\.(?:openai\.azure\.com|services\.ai\.azure\.com)\/?$/i.test(endpoint ?? "");
  let extracting = false;

  return async (req, res) => {
    const send = (status, payload) => {
      res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(payload));
    };
    const error = (status, message) => send(status, { message });

    if (req.method !== "POST") return error(405, "Use POST to extract a document.");
    if (!configured) return error(503, "3Plus AI extraction is not configured on this server.");
    const mime = req.headers["content-type"];
    const signature = signatures.get(mime);
    if (!signature) return error(415, "Choose a PDF, PNG, or JPEG file.");
    if (Number(req.headers["content-length"]) > MAX_BYTES) return error(413, "The file must be 10 MB or smaller.");
    if (extracting) return error(429, "Extraction is busy. Try again shortly.");

    extracting = true;
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req.iterator({ destroyOnReturn: false })) {
        size += chunk.length;
        if (size > MAX_BYTES) {
          req.resume();
          return error(413, "The file must be 10 MB or smaller.");
        }
        chunks.push(chunk);
      }
      const file = Buffer.concat(chunks, size);
      if (!file.subarray(0, signature.length).equals(signature)) return error(415, "The file content does not match its type.");
      const dataUrl = `data:${mime};base64,${file.toString("base64")}`;
      const document = mime === "application/pdf"
        ? { type: "input_file", filename: name + ".pdf", file_data: dataUrl }
        : { type: "input_image", image_url: dataUrl, detail: "high" };
      const response = await fetchAzure(`${endpoint.replace(/\/$/, "")}/openai/v1/responses`, {
        method: "POST",
        headers: { "api-key": key, "Content-Type": "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(90_000),
        body: JSON.stringify({
          model: deployment,
          store: false,
          instructions,
          input: [{ role: "user", content: [document] }],
          text: { format: { type: "json_schema", name, strict: true, schema } },
          max_output_tokens: 5000,
        }),
      });
      if (!response.ok) return error(502, "3Plus AI could not process the document. Check the deployment or try again.");
      const result = await response.json();
      const output = result.output?.flatMap((item) => item.type === "message" ? item.content : [])
        .find((part) => part?.type === "output_text")?.text;
      if (result.status !== "completed" || !output) return error(422, "3Plus AI did not return a complete extraction.");
      const draft = JSON.parse(output);
      if (!isValid(draft)) return error(422, "No reliable charge lines were found. Check the " + kind + " or enter it manually.");
      return send(200, draft);
    } catch (err) {
      if (!res.destroyed) return error(err.name === "TimeoutError" ? 504 : 502, "Extraction failed. Try again or enter charges manually.");
    } finally {
      extracting = false;
    }
  };
}
