import axios from 'axios'
import { PLUS_SERVICE_PATH, PORTAL_API_PATH } from './config'

const basePath = PLUS_SERVICE_PATH + '/api/accounts-payable/invoices'
export const canSaveApEdits = Boolean(PORTAL_API_PATH)

export async function createApInvoice(invoice) {
  if (!PORTAL_API_PATH) throw new Error('Creating PLUS invoices requires the authenticated portal.')
  const { data } = await axios.post(basePath + '/from-shipment', invoice, { timeout: 30_000 })
  if (!Number.isInteger(data?.id) || data.id <= 0) throw new Error('The AP service did not confirm which invoice was saved.')
  return data.id
}

export async function findApBillingCodes(search, signal) {
  const { data } = await axios.get(PLUS_SERVICE_PATH + '/api/accounts-payable/billing-codes', {
    params: { search }, signal, timeout: 10_000,
  })
  if (!Array.isArray(data) || data.some((item) => typeof item?.code !== 'string' ||
    !item.code.trim() || typeof item.description !== 'string')) {
    throw new Error('The AP service returned an unexpected billing code response.')
  }
  return data
}

export async function findApVendors(search, signal) {
  const { data } = await axios.get(PLUS_SERVICE_PATH + '/api/accounts-payable/vendors', {
    params: { search }, signal, timeout: 10_000,
  })
  if (!Array.isArray(data) || data.some((vendor) => !Number.isInteger(vendor?.id) ||
    vendor.id <= 0 || typeof vendor.name !== 'string' || !vendor.name.trim())) {
    throw new Error('The AP service returned an unexpected vendor response.')
  }
  return data
}

export async function findApAirShipment(reference) {
  const { data } = await axios.get(PLUS_SERVICE_PATH + '/api/air-import/shipment-by-reference', {
    params: { reference }, timeout: 30_000,
  }).catch((error) => {
    if (error.response?.status === 404) return { data: null }
    throw error
  })
  return data
}

function editUrl(id) {
  return basePath + '/' + encodeURIComponent(id) + '/edit'
}

export async function getApInvoiceEdit(id, signal) {
  const { data } = await axios.get(editUrl(id), { signal, timeout: 30_000 })
  if (String(data?.invoice?.id) !== id || !Array.isArray(data?.lines) || typeof data?.revision !== 'string') {
    throw new Error('The AP service returned an unexpected edit snapshot.')
  }
  return data
}

export async function updateApInvoice(id, changes) {
  if (!canSaveApEdits) throw new Error('Saving PLUS invoices requires the authenticated portal.')
  await axios.put(editUrl(id), changes, { timeout: 30_000 })
}

export async function searchApInvoices({ invoiceNo, vendor, userName, startDate, endDate }, page, pageSize, signal) {
  const { data } = await axios.get(basePath, {
    params: {
      invoiceNumber: invoiceNo.trim() || undefined,
      vendor: vendor.trim() || undefined,
      userName: userName?.trim() || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      page, pageSize,
    },
    signal,
    timeout: 30_000,
  })
  if (!Array.isArray(data?.items) || !Number.isInteger(data.totalCount) || !Number.isInteger(data.totalPages)) {
    throw new Error('The AP service returned an unexpected list response.')
  }
  return data
}

export function apApiError(error) {
  if (error.response?.status === 401) return 'Sign in again to access billing records.'
  if (error.response?.status === 404) return 'The AP invoice or service was not found.'
  const problem = error.response?.data
  const validation = Object.values(problem?.errors ?? {}).flat().find((message) => typeof message === 'string')
  return validation || problem?.title || 'Could not load AP billing records. Try again.'
}

export function formatApAmount(value, currency) {
  const code = currency?.trim().toUpperCase() ?? ''
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '-'
  if (!/^[A-Z]{3}$/.test(code)) return amount.toLocaleString('en-US', { minimumFractionDigits: 2 })
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(amount) + ' ' + code
}
