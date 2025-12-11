import axios from 'axios'

// Simple axios instance; change baseURL as needed or pass full URL to login
// Use Vite's `import.meta.env` in the browser instead of `process.env`.
// Guard with `typeof window` so the expression doesn't reference import in unexpected contexts.
const baseURL = (typeof window !== 'undefined' && import.meta && import.meta.env && import.meta.env.VITE_API_BASE_URL)
  ? import.meta.env.VITE_API_BASE_URL
  : ''

const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: false,
})

export async function login({ username, password, url }) {
  // If a full url is provided and contains query params ("?"), perform a GET request
  // allowing backends that expect credentials in the query string.
  // Otherwise default to POST to the given endpoint (or `/api/login`).
  const endpoint = url || '/api/login'

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

export default api
