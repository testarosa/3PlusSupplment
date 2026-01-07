import axios from 'axios'
import { buildApiUrl } from './config'

export async function getCustomersByName(name) {
  const endpoint = buildApiUrl(`/Customer/GetCustomers?name=${encodeURIComponent(name || '')}`)
  try {
    console.debug('[getCustomersByName] GET', endpoint)
    const resp = await axios.get(endpoint, { headers: { accept: 'text/plain, application/json' } })
    console.debug('[getCustomersByName] resp status', resp.status)
    let data = resp && resp.data

    // If response wraps payload under `data` field (API returns { data: [...], success, message })
    if (data && typeof data === 'object' && !Array.isArray(data) && Array.isArray(data.data)) {
      data = data.data
    }

    // If the server returned a JSON string, parse it
    if (typeof data === 'string') {
      try { data = JSON.parse(data) } catch (e) { /* leave as string */ }
    }

    // Now normalize to array of { id, name }
    if (Array.isArray(data)) {
      return data.map((it, idx) => {
        if (!it) return { id: idx + 1, name: String(it) }
        return { id: it.id ?? it.Id ?? idx + 1, name: (it.name ?? it.Name ?? String(it)).toString() }
      })
    }

    // Unknown shape -> empty
    return []
  } catch (err) {
    console.warn('getCustomersByName error', err?.message || err)
    return []
  }
}
