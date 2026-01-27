import { useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import './App.css'
import Login from './components/Login'
import Dashboard from './Dashboard'
import Header from './components/Header'

function App() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [user, setUser] = useState(null)

  const highlights = useMemo(
    () => [
      { label: 'Visibility', detail: 'Real-time invoice readiness' },
      { label: 'Templates', detail: 'Reusable billing blueprints' },
      { label: '', detail: '' },
    ],
    []
  )

  const navLinks = useMemo(
    () => [
      { label: 'Overview', to: '/' },
      { label: 'Invoice Templates', to: '/templates' },
      { label: 'CRDR Templates', to: '/crdr-templates' },
      { label: 'CRDR', to: '/crdr' },
      { label: 'Invoices', to: '/invoices' },
    ],
    []
  )

  const logout = () => {
    setLoggedIn(false)
    setUser(null)
  }

  const onLoginSuccess = (userInfo) => {
    if (userInfo) setUser(userInfo)
    setLoggedIn(true)
  }

  if (!loggedIn) {
    return (
      <div className="app-shell">
        <div className="app-grid">
          <section className="app-hero">
            <p className="eyebrow">3Plus Forwarding</p>
            <h1>Employee Portal</h1>
            <p className="hero-copy">
              Build templates, generate invoices, and track readiness across your billing workflow.
            </p>

            <div className="hero-highlights">
              {highlights.map((item) => (
                <article key={item.label}>
                  <p>{item.label}</p>
                  <strong>{item.detail}</strong>
                </article>
              ))}
            </div>

            <p className="hero-hint">Secure sign-in required to continue.</p>
          </section>

          <section className="app-workspace">
            <div className="workspace-header">
              <div>
                <p className="eyebrow">Session</p>
                <h2>Authenticate to continue</h2>
                <p className="workspace-copy">Sign in to unlock your employee portal.</p>
              </div>
              <div className="workspace-status">
                <span className="status offline">Offline</span>
              </div>
            </div>

            <div className="workspace-panel">
              <div className="login-shell">
                <Login onSuccess={onLoginSuccess} />
                <p className="login-hint">
                  Need credentials? Contact operations or use your test account to explore the refreshed experience.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    )
  }

  const displayName =
    user?.userName ??
    user?.username ??
    user?.name ??
    user?.userId ??
    user?.F_UserName ??
    'User'

  return (
    <div className="app-frame">
      <header className="app-frame-header">
        <Header displayName={displayName} onLogout={logout} />
      </header>

      <div className="app-frame-body">
        <aside className="app-frame-side">
          <p className="side-label">Navigation</p>
          <nav>
            <ul>
              {navLinks.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to} className={({ isActive }) => (isActive ? 'pill active' : 'pill')}>
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="auth-side-footer">
            <p className="side-hint">Signed in as {displayName}</p>
            <button type="button"  onClick={logout}>
              Sign out
            </button>
          </div>
        </aside>

        <main className="app-frame-main">
          <Dashboard embedLayout onLogout={logout} user={user} />
        </main>
      </div>
    </div>
  )
}

export default App
