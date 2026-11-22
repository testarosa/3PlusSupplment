const DEFAULT_API_BASE_URL = 'http://api.e3pl.com/'
//const DEFAULT_API_BASE_URL = "http://192.168.20.151:5048/";

export const PORTAL_API_PATH =
  globalThis.location?.origin === "https://e3pl.com" ? "/portal-api" : "";

export const PLUS_SERVICE_PATH = import.meta.env?.DEV ? "/ap-backend" : PORTAL_API_PATH;

const pickEnvUrl = (value, fallback) =>
  typeof value === "string" && value.trim().length ? value.trim() : fallback;

export const API_BASE_URL = PORTAL_API_PATH || pickEnvUrl(
  import.meta?.env?.VITE_API_BASE_URL,
  DEFAULT_API_BASE_URL,
);

export const INVOICE_API_BASE_URL = PORTAL_API_PATH || pickEnvUrl(
  import.meta?.env?.DEFAULT_API_BASE_URL,
  DEFAULT_API_BASE_URL,
);

export const buildApiUrl = (path = "") => {
  const base = API_BASE_URL.replace(/\/$/, "");
  const suffix = path.replace(/^\//, "");
  return suffix ? `${base}/${suffix}` : base;
};

export const buildInvoiceApiUrl = (path = "") => {
  const base = INVOICE_API_BASE_URL.replace(/\/$/, "");
  const suffix = path.replace(/^\//, "");
  return suffix ? `${base}/${suffix}` : base;
};

export default API_BASE_URL;
