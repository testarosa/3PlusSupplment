import { Buffer } from "node:buffer";
import contract from "./crdrExtractionContract.json" with { type: "json" };

const MAX_BYTES = 10 * 1024 * 1024;
const signatures = new Map([
  ["application/pdf", Buffer.from("%PDF-")],
  ["image/png", Buffer.from("89504e470d0a1a0a", "hex")],
  ["image/jpeg", Buffer.from("ffd8ff", "hex")],
]);

const { instructions, schema } = contract;

export function createCrdrExtractionHandler(env, fetchAzure = fetch) {
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

    if (req.method !== "POST") return error(405, "Use POST to extract a note.");
    if (!configured) return error(503, "Azure AI extraction is not configured on this server.");
    const mime = req.headers["content-type"];
    const signature = signatures.get(mime);
    if (!signature) return error(415, "Choose a PDF, PNG, or JPEG file.");
    if (Number(req.headers["content-length"]) > MAX_BYTES) return error(413, "The note must be 10 MB or smaller.");
    if (extracting) return error(429, "Another note is being extracted. Try again shortly.");

    extracting = true;
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req.iterator({ destroyOnReturn: false })) {
        size += chunk.length;
        if (size > MAX_BYTES) {
          req.resume();
          return error(413, "The note must be 10 MB or smaller.");
        }
        chunks.push(chunk);
      }
      const file = Buffer.concat(chunks, size);
      if (!file.subarray(0, signature.length).equals(signature)) return error(415, "The file content does not match its type.");
      const dataUrl = `data:${mime};base64,${file.toString("base64")}`;
      const document = mime === "application/pdf"
        ? { type: "input_file", filename: "credit-debit-note.pdf", file_data: dataUrl }
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
          text: { format: { type: "json_schema", name: "credit_debit_note", strict: true, schema } },
          max_output_tokens: 5000,
        }),
      });
      if (!response.ok) return error(502, "Azure AI could not process the note. Check the deployment or try again.");
      const result = await response.json();
      const output = result.output?.flatMap((item) => item.type === "message" ? item.content : [])
        .find((part) => part?.type === "output_text")?.text;
      if (result.status !== "completed" || !output) return error(422, "Azure AI did not return a complete extraction.");
      const draft = JSON.parse(output);
      if (draft.noteType === "unknown" || !draft.lines?.length || draft.lines.some((line) =>
        !line.description?.trim() || !Number.isFinite(line.debit) || !Number.isFinite(line.credit) ||
        line.debit < 0 || line.credit < 0 || (!line.debit && !line.credit)
      )) return error(422, "No reliable charge lines were found. Check the note or enter it manually.");
      return send(200, draft);
    } catch (err) {
      if (!res.destroyed) return error(err.name === "TimeoutError" ? 504 : 502, "Extraction failed. Try again or enter the note manually.");
    } finally {
      extracting = false;
    }
  };
}
