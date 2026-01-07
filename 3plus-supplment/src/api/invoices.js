import axios from "axios";
import { buildInvoiceApiUrl } from "./config";

export async function getInvoiceByRef(referenceNumber) {
  if (!referenceNumber) {
    throw new Error("Reference number is required");
  }

  const endpoint = buildInvoiceApiUrl(
    `/Invoice/GetInvoice/${encodeURIComponent(referenceNumber)}`
  );

  const resp = await axios.get(endpoint, {
    headers: { accept: "text/plain, application/json" },
  });
  let data = resp?.data;

  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch (err) {
      // leave as string if parsing fails
    }
  }

  return data;
}

export async function saveInvoice(invoiceData) {
  const endpoint = buildInvoiceApiUrl('/Invoice/SaveInvoice');

  const resp = await axios.post(endpoint, invoiceData, {
    headers: {
      accept: "text/plain",
      "Content-Type": "application/json",
    },
  });

  let data = resp?.data;

  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch (err) {
      // leave as string if parsing fails
    }
  }

  return data;
}
