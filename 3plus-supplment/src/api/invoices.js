import axios from "axios";

const BASE_URL = "http://192.168.20.207:5048";

export async function getInvoiceByRef(referenceNumber) {
  if (!referenceNumber) {
    throw new Error("Reference number is required");
  }

  const endpoint = `${BASE_URL}/Invoice/GetInvoice/${encodeURIComponent(
    referenceNumber
  )}`;

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
  const endpoint = `${BASE_URL}/Invoice/SaveInvoice`;

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
