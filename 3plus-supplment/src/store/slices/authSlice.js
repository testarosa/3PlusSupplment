import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { login as apiLogin } from '../../api/auth'

// Async thunk for login. payload: { username, password, url? }
export const login = createAsyncThunk(
  'auth/login',
  async ({ username, password, url }, { rejectWithValue }) => {
    try {
      const response = await apiLogin({ username, password, url })
      // The backend may return JSON or plain text. Normalize here:
      const data = response && response.data
      if (typeof data === 'string') {
        // try to parse JSON-looking strings
        try {
          return JSON.parse(data)
        } catch (e) {
          // not JSON — return as raw text under `raw` property
          return { raw: data }
        }
      }
      // Expect response.data = { token, user } or similar object
      return data
    } catch (err) {
      // axios errors have response.data or message
      if (err.response && err.response.data) {
        return rejectWithValue(err.response.data)
      }
      return rejectWithValue({ message: err.message || 'Network error' })
    }
  }
)

// Initialize token/user from localStorage when available
let persistedToken = null
let persistedUser = null
try {
  persistedToken = localStorage.getItem('auth_token')
  const raw = localStorage.getItem('auth_user')
  persistedUser = raw ? JSON.parse(raw) : null
} catch (e) {
  persistedToken = null
  persistedUser = null
}

const initialState = {
  token: persistedToken,
  user: persistedUser,
  loading: false,
  error: null,
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout: (state) => {
      state.token = null
      state.user = null
      state.error = null
      try { localStorage.removeItem('auth_token') } catch (e) {}
      try { localStorage.removeItem('auth_user') } catch (e) {}
    },
    setCredentials: (state, action) => {
      state.token = action.payload?.token ?? state.token
      state.user = action.payload?.user ?? state.user
      try { localStorage.setItem('auth_user', JSON.stringify(state.user)) } catch (e) {}
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(login.fulfilled, (state, action) => {
        state.loading = false
        state.error = null
        // Backend returns { data: { ...userFields }, success: true, message: '' }
        const payload = action.payload || {}
        // Extract token if present, otherwise keep null
        state.token = payload?.token ?? payload?.data?.token ?? null
        // Prefer payload.data for the user object, otherwise fallback to payload.user or payload itself
        const userObj = payload?.data ?? payload?.user ?? payload
        state.user = userObj ?? null
        try { localStorage.setItem('auth_token', state.token) } catch (e) {}
        try { localStorage.setItem('auth_user', JSON.stringify(state.user)) } catch (e) {}
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload || { message: 'Login failed' }
      })
  }
})

export const { logout, setCredentials } = authSlice.actions

export const selectAuth = (state) => ({ token: state.auth.token, user: state.auth.user, loading: state.auth.loading, error: state.auth.error })

export default authSlice.reducer
