import axios from "axios";
import { PLUS_SERVICE_PATH, buildInvoiceApiUrl } from "./config";

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

export const supportsInvoiceUserSearch = Boolean(PLUS_SERVICE_PATH);

export async function searchInvoices(filters, page, pageSize, signal) {
  const supplied = (value) => value?.trim() || undefined;
  const params = {
    userName: supplied(filters.userName),
    customerName: supplied(filters.customerName),
    invoiceFrom: supplied(filters.invoiceFrom),
    invoiceTo: supplied(filters.invoiceTo),
  };
  if (supportsInvoiceUserSearch) {
    const { data } = await axios.get(PLUS_SERVICE_PATH + '/api/accounts-receivable/invoices', {
      params: { ...params, invoiceNumber: supplied(filters.invoiceNo), page, pageSize },
      signal, timeout: 30_000,
    });
    if (!Array.isArray(data?.items) || !Number.isInteger(data.totalCount) || !Number.isInteger(data.totalPages))
      throw new Error('The billing service returned an unexpected invoice list.');
    return {
      ...data,
      items: data.items.map((row) => ({
        ...row,
        invoiceId: row.id, invoiceNo: row.invoiceNumber,
        companyId: row.billToCompanyId, companyName: row.billToCompanyName,
      })),
    };
  }

  const { data } = await axios.get(buildInvoiceApiUrl('/Invoice/SearchInvoices'), {
    params: { ...params, invoiceNo: supplied(filters.invoiceNo) },
    headers: { accept: 'text/plain, application/json' },
    signal, timeout: 30_000,
  });
  const payload = typeof data === 'string' ? JSON.parse(data) : data;
  const rows = Array.isArray(payload) ? payload : payload?.data;
  if (!Array.isArray(rows)) throw new Error('The billing service returned an unexpected invoice list.');
  const offset = (page - 1) * pageSize;
  return { items: rows.slice(offset, offset + pageSize), totalCount: rows.length, totalPages: Math.ceil(rows.length / pageSize) };
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
