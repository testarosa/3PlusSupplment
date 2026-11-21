import { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { NavLink, useLocation } from 'react-router-dom'
import Login from './components/Login'
import Dashboard from './Dashboard'
import { PortalIcon, portalSections } from './components/PortalNav'
import { logout, selectAuth } from './store/slices/authSlice'
import { endPortalSession } from './api/auth'
import './App.css'

function Brand() {
  return (
    <div className="portal-brand">
      <img src="/orange-3.svg" alt="" width="36" height="36" />
      <div><strong>3Plus</strong><span>Forwarding</span></div>
    </div>
  )
}

function App() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const { pathname } = useLocation()
  const { user } = useSelector(selectAuth)
  const dispatch = useDispatch()

  if (!loggedIn) {
    return (
      <main className="sign-in-screen">
        <div className="sign-in-content">
          <Brand />
          <div className="sign-in-form">
            <h1>Employee portal</h1>
            <p>Use your 3Plus account to access the billing workspace.</p>
            <Login onSuccess={() => setLoggedIn(true)} />
          </div>
          <p className="sign-in-help">Need access? Contact your operations team.</p>
        </div>
        <div className="sign-in-photo" aria-hidden="true" />
      </main>
    )
  }

  const displayName = user?.userName ?? user?.username ?? user?.name ??
    user?.userId ?? user?.F_UserName ?? 'User'
  const initials = String(displayName).trim().split(/\s+/).slice(0, 2)
    .map((part) => part[0]).join('').toUpperCase() || 'U'
  const activeSection = portalSections.flatMap((group) => group.links)
    .find(({ to }) => pathname === to || pathname.startsWith(`${to}/`))
  const action = pathname.endsWith('/create') ? 'Create' : pathname.includes('/edit/') ? 'Edit' : ''

  const signOut = () => {
    void endPortalSession().catch(() => {})
    dispatch(logout())
    setMenuOpen(false)
    setLoggedIn(false)
  }

  return (
    <div className="portal">
      <aside className={`portal-sidebar${menuOpen ? ' is-open' : ''}`}>
        <NavLink className="portal-brand-link" to="/" onClick={() => setMenuOpen(false)} aria-label="3Plus overview">
          <Brand />
        </NavLink>
        <nav id="portal-navigation" aria-label="Main navigation">
          {portalSections.map(({ label, links }) => (
            <div className="portal-nav-group" key={label}>
              <p>{label}</p>
              {links.map(({ label: linkLabel, to, icon }) => (
                <NavLink key={to} to={to} end={to === '/'} onClick={() => setMenuOpen(false)}>
                  <PortalIcon name={icon} /><span>{linkLabel}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="portal-sidebar-footer">
          <span className="portal-avatar" aria-hidden="true">{initials}</span>
          <div className="portal-account"><strong title={displayName}>{displayName}</strong><button type="button" onClick={signOut}>Sign out</button></div>
        </div>
      </aside>
      <div className="portal-workspace">
        <header className="portal-topbar">
          <button className="portal-menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="portal-navigation" onClick={() => setMenuOpen((open) => !open)}>
            <PortalIcon name={menuOpen ? 'close' : 'menu'} /><span>Menu</span>
          </button>
          <div className="portal-breadcrumb">
            <span>Billing workspace</span>
            <span aria-hidden="true">/</span>
            <strong>{activeSection?.label ?? 'Page not found'}</strong>
            {action && <><span aria-hidden="true">/</span><strong>{action}</strong></>}
          </div>
        </header>
        <main id="workspace-content" className="workspace-content">
          <Dashboard embedLayout />
        </main>
      </div>
    </div>
  )
}

export default App
