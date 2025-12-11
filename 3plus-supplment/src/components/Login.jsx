import React, { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { login, selectAuth, logout } from '../store/slices/authSlice'
import './Login.css'

export default function Login({ onSuccess } = {}) {
  const dispatch = useDispatch()
  const { token, user, loading, error } = useSelector(selectAuth)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [formErrors, setFormErrors] = useState({})

  const onSubmit = async (e) => {
    e.preventDefault()
    // Client-side validation
    const isValid = validate()
    if (!isValid) return

    try {
      // Build the external login URL the user provided if needed.
      // Using the provided example endpoint which expects query params.
      const externalUrl = `http://192.168.20.240:5048/Auth/Login?userId=${encodeURIComponent(
        username
      )}&password=${encodeURIComponent(password)}`

      const resultAction = await dispatch(login({ username, password, url: externalUrl }))
      if (login.fulfilled.match(resultAction)) {
        // login succeeded
        console.log('Logged in:', resultAction.payload)
        if (typeof onSuccess === 'function') {
          onSuccess(resultAction.payload?.user ?? null)
        }
      } else {
        console.log('Login failed:', resultAction.payload)
      }
    } catch (err) {
      console.error('Login error', err)
    }
  }

  const handleLogout = () => {
    dispatch(logout())
  }

  function validate() {
    const errs = {}
    if (!username || username.trim().length === 0) {
      errs.username = 'Please enter a username.'
    }
    if (!password || password.length === 0) {
      errs.password = 'Please enter a password.'
    } else if (password.length < 4) {
      errs.password = 'Password must be at least 4 characters.'
    }
    setFormErrors(errs)
    return Object.keys(errs).length === 0
  }

  return (
    <div className="login-card">
      {token ? (
        <div>
          <h2>Welcome</h2>
          <p>Signed in as <strong>{user?.name || user?.username || 'User'}</strong></p>
          <div className="login-actions">
            <button className="btn btn-secondary" onClick={handleLogout}>Logout</button>
          </div>
        </div>
      ) : (
        <form className="login-form" onSubmit={onSubmit}>
          <h2>Sign in</h2>
          <div className="form-row">
            <label>Username</label>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              aria-invalid={!!formErrors.username}
            />
            {formErrors.username && <div className="field-error">{formErrors.username}</div>}
          </div>
          <div className="form-row">
            <label>Password</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            {formErrors.password && <div className="field-error">{formErrors.password}</div>}
          </div>
          <div className="login-actions">
            <button type="button" className="btn btn-secondary" onClick={() => { setUsername(''); setPassword('') }}>Clear</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Logging...' : 'Login'}</button>
          </div>
          {error && <div className="login-error">{error.message || JSON.stringify(error)}</div>}
          <div className="login-meta">Demo app — use your API credentials to log in.</div>
        </form>
      )}
    </div>
  )
}
