const DEFAULT_API_BASE_URL = 'http://192.168.20.240'

const pickEnvUrl = (value, fallback) =>
  typeof value === 'string' && value.trim().length ? value.trim() : fallback

export const API_BASE_URL = pickEnvUrl(
  import.meta?.env?.VITE_API_BASE_URL,
  DEFAULT_API_BASE_URL
)

export const INVOICE_API_BASE_URL = pickEnvUrl(
  import.meta?.env?.DEFAULT_API_BASE_URL,
  DEFAULT_API_BASE_URL
)

export const buildApiUrl = (path = '') => {
  const base = API_BASE_URL.replace(/\/$/, '')
  const suffix = path.replace(/^\//, '')
  return suffix ? `${base}/${suffix}` : base
}

export const buildInvoiceApiUrl = (path = '') => {
  const base = INVOICE_API_BASE_URL.replace(/\/$/, '')
  const suffix = path.replace(/^\//, '')
  return suffix ? `${base}/${suffix}` : base
}

export default API_BASE_URL
