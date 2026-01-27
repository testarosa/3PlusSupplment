import axios from 'axios'
import { buildInvoiceApiUrl } from './config'

const parseMaybeJson = (payload) => {
  if (typeof payload !== 'string') return payload
  try {
    return JSON.parse(payload)
  } catch {
    return payload
  }
}

const normalizeAgentCompany = (row) => {
  if (!row || typeof row !== 'object') return null
  return {
    companyId: row.companyId ?? row.CompanyId ?? row.id ?? row.Id,
    companyName: row.companyName ?? row.CompanyName ?? row.name ?? row.Name ?? '',
  }
}

// GET /AgentCompany/SearchByName?companyName=...
export async function searchAgentCompaniesByName(companyName) {
  const trimmed = String(companyName ?? '').trim()
  if (!trimmed) return []

  const endpoint = buildInvoiceApiUrl(
    `/AgentCompany/SearchByName?companyName=${encodeURIComponent(trimmed)}`
  )

  try {
    const resp = await axios.get(endpoint, {
      headers: { accept: 'text/plain, application/json' },
    })

    const parsed = parseMaybeJson(resp?.data)
    const list = Array.isArray(parsed?.data) ? parsed.data : []

    return list.map(normalizeAgentCompany).filter(Boolean)
  } catch (err) {
    console.warn('[searchAgentCompaniesByName] error', err?.message || err)
    return []
  }
}

export default {
  searchAgentCompaniesByName,
}
