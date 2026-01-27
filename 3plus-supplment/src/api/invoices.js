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

export async function getInvoiceByInvoiceId(invoiceId) {
  if (invoiceId === undefined || invoiceId === null || String(invoiceId).trim() === "") {
    throw new Error("Invoice id is required");
  }

  const endpoint = buildInvoiceApiUrl(
    `/Invoice/GetInvoiceByInvoiceId/${encodeURIComponent(String(invoiceId))}`
  );

  const resp = await axios.get(endpoint, {
    headers: { accept: "text/plain, application/json" },
  });

  let data = resp?.data;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch (err) {
      // leave as string
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

export async function searchInvoices(filters = {}) {
  const params = new URLSearchParams();

  Object.entries({
    invoiceNo: filters.invoiceNo,
    customerName: filters.customerName,
    invoiceFrom: filters.invoiceFrom,
    invoiceTo: filters.invoiceTo,
  }).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim().length) {
      params.append(key, value);
    }
  });

  const query = params.toString();
  const endpoint = buildInvoiceApiUrl(
    query ? `/Invoice/SearchInvoices?${query}` : '/Invoice/SearchInvoices'
  );

  const resp = await axios.get(endpoint, {
    headers: { accept: 'text/plain, application/json' },
  });

  let data = resp?.data;

  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch (err) {
      // leave as string if parsing fails
    }
  }

  return data;
}

export async function deleteInvoice(invoiceId) {
  if (invoiceId === undefined || invoiceId === null || invoiceId === '') {
    throw new Error('Invoice id is required');
  }

  const id = encodeURIComponent(String(invoiceId));

  const attempts = [
    { method: 'delete', path: `/Invoice/DeleteInvoice/${id}` },
    { method: 'delete', path: `/Invoice/DeleteInvoice?id=${id}` },
    { method: 'post', path: '/Invoice/DeleteInvoice', data: { invoiceId } },
    { method: 'post', path: '/Invoice/DeleteInvoice', data: { id: invoiceId } },
  ];

  let lastErr = null;

  for (const attempt of attempts) {
    try {
      const endpoint = buildInvoiceApiUrl(attempt.path);
      const resp =
        attempt.method === 'delete'
          ? await axios.delete(endpoint, {
              headers: { accept: 'text/plain, application/json' },
            })
          : await axios.post(endpoint, attempt.data ?? {}, {
              headers: {
                accept: 'text/plain, application/json',
                'Content-Type': 'application/json',
              },
            });

      let data = resp?.data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch (err) {
          // leave as string
        }
      }

      return data;
    } catch (err) {
      lastErr = err;
    }
  }

  throw new Error(lastErr?.response?.data?.message || lastErr?.message || 'Failed to delete invoice');
}
