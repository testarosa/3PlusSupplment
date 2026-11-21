import axios from 'axios'
import { API_BASE_URL, PORTAL_API_PATH, buildApiUrl } from './config'

// Shared axios instance pinned to the on-prem API base.
const baseURL = API_BASE_URL

const buildLoginUrlWithQuery = (username, password) => {
  
  if (!username || !password) return null
  const userParam = encodeURIComponent(username)
  const passwordParam = encodeURIComponent(password)
  
  return `${buildApiUrl('/Auth/Login')}?userId=${userParam}&password=${passwordParam}`
}

const api = axios.create({
  baseURL: PORTAL_API_PATH ? undefined : baseURL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: false,
})

export async function login({ username, password, url }) {
  if (PORTAL_API_PATH && !url) {
    return api.post(`${PORTAL_API_PATH}/session/login`, { username, password })
  }
  // If a full url is provided and contains query params ("?"), perform a GET request
  // allowing backends that expect credentials in the query string.
  // Otherwise default to POST to the given endpoint (or `/api/login`).

  const derivedUrl = buildLoginUrlWithQuery(username, password)
  const endpoint = url || derivedUrl || '/api/login'

  // Full absolute URL (starts with http) -> use axios directly against it
  const isAbsolute = typeof endpoint === 'string' && endpoint.match(/^https?:\/\//i)
  const usesQuery = typeof endpoint === 'string' && endpoint.indexOf('?') !== -1

  if (isAbsolute && usesQuery) {
    // POST to full absolute URL including query string with empty body,
    // matching the curl the user provided.
    return axios.post(endpoint, '', { headers: { accept: 'text/plain' } })
  }

  if (usesQuery) {
    // Relative URL with querystring -> use POST with empty body and accept header
    return api.post(endpoint, '', { headers: { accept: 'text/plain' } })
  }

  
  // Default: POST with username/password payload
  return api.post(endpoint, { username, password })
}

export async function endPortalSession() {
  if (PORTAL_API_PATH) await api.post(`${PORTAL_API_PATH}/session/logout`, null, { timeout: 5000 })
}

export default api
