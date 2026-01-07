import axios from 'axios'
import { buildApiUrl } from './config'

export async function getFreightTypes() {
  const endpoint = buildApiUrl('/api/FreightType')
  try {
    console.debug('[getFreightTypes] GET', endpoint)
    const resp = await axios.get(endpoint, { headers: { accept: '*/*' } })
    let data = resp && resp.data
    if (data && typeof data === 'object' && !Array.isArray(data) && Array.isArray(data.data)) {
      data = data.data
    }
    if (typeof data === 'string') {
      try { data = JSON.parse(data) } catch (e) { /* ignore */ }
    }
    if (Array.isArray(data)) {
      return data.map((it) => ({ id: it.id ?? it.Id, code: it.code ?? it.Code, value: it.value ?? it.Value }))
    }
    return []
  } catch (err) {
    console.warn('getFreightTypes error', err?.message || err)
    return []
  }
}
