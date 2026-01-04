import React, { useState, useEffect } from 'react'
import './Dashboard.css'
import ListInvoiceTemplate from './ListInvoiceTemplate'
import CreateInvoiceTemplate from './CreateInvoiceTemplate'
import EditInvoiceTemplate from './EditInvoiceTemplate'
import CreateInvoice from './CreateInvoice'
import EditInvoice from './EditInvoice'
import { Routes, Route, NavLink, useNavigate, useLocation, useParams } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { selectAuth } from './store/slices/authSlice'
import { selectCurrentTemplate, setCurrentTemplate, clearCurrentTemplate } from './store/slices/templateSlice'
import { fetchInvoiceTemplateById } from './api/invoiceTemplates'

function Dashboard({ onLogout, user: propUser }) {
  const navigate = useNavigate()
  const location = useLocation()
  const dispatch = useDispatch()
  const auth = useSelector(selectAuth)
  const user = auth?.user ?? propUser
  const displayName =
    user?.userName ??
    user?.username ??
    user?.name ??
    user?.userId ??
    user?.F_UserName ??
    'User'

  // Small invoices list component with Ref# and Invoice# search inputs
  const InvoiceList = () => {
    const [custQ, setCustQ] = useState('')
    const [refQ, setRefQ] = useState('')
    const [invQ, setInvQ] = useState('')

    // customer autocomplete state
    const [acCust, setAcCust] = useState({ list: [], index: -1, visible: false, query: '' })

    // build customer options from sessionStorage.templates or fallback demo
    let customerOptions = []
    try {
      const templates = JSON.parse(sessionStorage.getItem('templates') || 'null')
      if (Array.isArray(templates) && templates.length) {
        customerOptions = Array.from(new Set(templates.map((t) => ((t.customerName || t.customer || '').toString().trim())).filter(Boolean)))
      }
    } catch (e) {
      /* ignore */
    }
    if (!customerOptions.length) customerOptions = ['ABC Co.', 'XYZ Ltd.', 'Acme Inc.']

    const initial = [
      { id: '#1001', customer: 'ABC Co.', ref: 'REF-1001', invoiceNumber: 'INV-1001', postDate: '2025-10-01', invoiceDate: '2025-10-02', dueDate: '2025-11-01', amount: 1200.0, status: 'Paid' },
      { id: '#1002', customer: 'XYZ Ltd.', ref: 'REF-2002', invoiceNumber: 'INV-2002', postDate: '2025-10-15', invoiceDate: '2025-10-16', dueDate: '2025-11-15', amount: 420.0, status: 'Due' },
      { id: '#1003', customer: 'Acme Inc.', ref: 'REF-3003', invoiceNumber: 'INV-3003', postDate: '2025-09-20', invoiceDate: '2025-09-21', dueDate: '2025-10-21', amount: 980.0, status: 'Due' }
    ]

    const [rows, setRows] = useState(initial)

    // Show all rows unfiltered — search inputs are present but do not filter the list per request
    const filtered = rows

    const handleEdit = (row) => {
      // Navigate to the Edit Invoice page and pass the selected row via location.state
      try {
        navigate(`/invoices/edit/${encodeURIComponent(row.id)}`, { state: row })
      } catch (err) {
        // fallback: store in sessionStorage and change location hash
        try { sessionStorage.setItem('editingInvoice', JSON.stringify(row)) } catch (e) { /* ignore */ }
        window.location.hash = `#/invoices/edit/${encodeURIComponent(row.id)}`
        window.dispatchEvent(new HashChangeEvent('hashchange'))
      }
    }

    const handleDelete = (id) => {
      const ok = window.confirm('Delete this invoice?')
      if (!ok) return
      setRows((prev) => prev.filter((r) => r.id !== id))
    }

    const doSearch = (e) => { if (e && e.preventDefault) e.preventDefault(); /* filtering happens on render */ }

    const handleCustChange = (val) => {
      setCustQ(val)
      const q = (val || '').trim().toLowerCase()
      const list = q ? customerOptions.filter((o) => (o || '').toLowerCase().includes(q)) : customerOptions.slice(0, 6)
      setAcCust({ list, index: list.length ? 0 : -1, visible: list.length > 0, query: val })
    }

    const selectCust = (val) => {
      if (!val) return
      setCustQ(val)
      setAcCust({ list: [], index: -1, visible: false, query: '' })
    }

    return (
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <h2 style={{ margin: 0 }}>Invoices</h2>
          <div>
            <button className="create-btn" onClick={() => navigate(`/invoices/edit/${encodeURIComponent('new')}`, { state: {} })}>Create Invoice</button>
          </div>
        </div>

        <form className="invoice-search" onSubmit={doSearch} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ position: 'relative' }}>
            <input
              placeholder="Customer"
              value={custQ}
              onChange={(e) => handleCustChange(e.target.value)}
              onKeyDown={(e) => {
                if (acCust.visible) {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setAcCust((s) => ({ ...s, index: Math.min(s.index + 1, s.list.length - 1) })) }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setAcCust((s) => ({ ...s, index: Math.max(s.index - 1, 0) })) }
                  else if (e.key === 'Enter') { e.preventDefault(); const sel = acCust.list[acCust.index]; if (sel) selectCust(sel) }
                }
              }}
              onBlur={() => setTimeout(() => setAcCust((s) => ({ ...s, visible: false })), 120)}
            />

            {acCust.visible && (
              <ul className="ac-list" role="listbox" style={{ top: 'calc(100% + 6px)', left: 0, width: 220 }}>
                {acCust.list.map((opt, idx) => (
                  <li key={opt} className={idx === acCust.index ? 'active' : ''} onMouseDown={(ev) => { ev.preventDefault(); selectCust(opt) }} role="option" aria-selected={idx === acCust.index}>{opt}</li>
                ))}
              </ul>
            )}
          </div>

          <input placeholder="Ref #" value={refQ} onChange={(e) => setRefQ(e.target.value)} />
          <input placeholder="Invoice #" value={invQ} onChange={(e) => setInvQ(e.target.value)} />
          <button type="submit" className="search-btn">Search</button>
        </form>

        <table className="invoice-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Ref #</th>
              <th>Invoice #</th>
              <th>Post Date</th>
              <th>Invoice Date</th>
              <th>Due Date</th>
              <th className="right">Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td>{r.customer}</td>
                <td>{r.ref}</td>
                <td>{r.invoiceNumber}</td>
                <td>{r.postDate}</td>
                <td>{r.invoiceDate}</td>
                <td>{r.dueDate}</td>
                <td className="right">{typeof r.amount === 'number' ? `$${r.amount.toFixed(2)}` : r.amount}</td>
                <td>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <div style={{ fontWeight: 600, marginRight: '0.5rem' }}>{r.status}</div>
                    <button className="edit-btn" onClick={() => handleEdit(r)} aria-label={`Edit invoice ${r.invoiceNumber}`}>
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path d="M3 21v-3.75L14.06 6.19l3.75 3.75L6.75 21H3z" fill="currentColor" opacity="0.9"/>
                        <path d="M20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor"/>
                      </svg>
                      <span className="btn-label">Edit</span>
                    </button>

                    <button className="delete-btn" onClick={() => handleDelete(r.id)} aria-label={`Delete invoice ${r.invoiceNumber}`}>
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path d="M6 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M19 7l-1 12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <span className="btn-label">Delete</span>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    )
  }

  const EditWrapper = () => {
    const { id } = useParams()
    const currentTemplate = useSelector(selectCurrentTemplate)
    const [loadingTemplate, setLoadingTemplate] = useState(false)
    const [templateError, setTemplateError] = useState(null)

    useEffect(() => {
      let active = true
      const targetId = id

      if (!targetId || targetId === 'new') {
        dispatch(clearCurrentTemplate())
        setTemplateError(null)
        return () => { active = false }
      }

      if (currentTemplate && String(currentTemplate.id) === String(targetId)) {
        return () => { active = false }
      }

      setLoadingTemplate(true)
      setTemplateError(null)
      fetchInvoiceTemplateById(targetId)
        .then((data) => { if (!active) return; dispatch(setCurrentTemplate(data)) })
        .catch((err) => { if (!active) return; setTemplateError(err?.message || 'Failed to load template') })
        .finally(() => { if (active) setLoadingTemplate(false) })

      return () => { active = false }
    }, [id, currentTemplate, dispatch])

    if (loadingTemplate && !currentTemplate) {
      return <div>Loading template...</div>
    }

    if (templateError) {
      return <div className="error-row">{templateError}</div>
    }

    return (
      <EditInvoiceTemplate
        template={currentTemplate ?? {}}
        onSave={(tpl) => { console.log('Updated template', tpl); alert('Saved (demo)'); navigate('/templates') }}
        onCancel={() => navigate('/templates')}
      />
    )
  }

  return (
    <div className="dashboard-root">
      <header className="dashboard-header">
        <div className="header-inner">
          <div className="brand-area">
            <h1>Dashboard</h1>
            <div className="welcome">Welcome, {displayName}</div>
          </div>
          <div className="header-controls">
            <button className="btn-logout" onClick={onLogout}>Logout</button>
          </div>
        </div>
      </header>

      <div className="dashboard-layout">
        <aside className="dashboard-sidebar">
          <nav>
            <ul>
              <li>
                <NavLink to="/" className={({isActive}) => isActive ? 'active' : ''}>Overview</NavLink>
              </li>
              <li>
                <NavLink to="/templates" className={({isActive}) => isActive ? 'active' : ''}>Invoice Templates</NavLink>
              </li>
              <li>
                {/* Create Template link removed per request */}
              </li>
              <li>
                <NavLink to="/invoices" className={({isActive}) => isActive ? 'active' : ''}>Invoices</NavLink>
              </li>
              <li>
                <NavLink to="/invoices/create" className={({isActive}) => isActive ? 'active' : ''}>Create Invoice</NavLink>
              </li>
              <li className="sep" />
              <li className="logout-link" onClick={onLogout}>Logout</li>
            </ul>
          </nav>
        </aside>

        <main className="dashboard-main">
          <div className="content-column">
            <Routes location={location}>
              <Route path="/" element={<section className="panel"><h2>Overview</h2><p>This is a demo dashboard page shown after successful login.</p></section>} />
              <Route path="/templates" element={<section className="panel"><ListInvoiceTemplate /></section>} />
              <Route path="/templates/create" element={<section className="panel"><CreateInvoiceTemplate onSave={(tpl) => { console.log('Saved template', tpl); alert('Saved (demo)'); navigate('/templates') }} /></section>} />
              <Route path="/templates/edit/:id" element={<section className="panel"><EditWrapper /></section>} />
              <Route path="/invoices" element={<section className="panel"><InvoiceList /></section>} />
              <Route path="/invoices/create" element={<section className="panel"><CreateInvoice /></section>} />
              <Route path="/invoices/edit/:id" element={<section className="panel"><EditInvoice /></section>} />
            </Routes>
          </div>
        </main>
      </div>
    </div>
  )
}

export default Dashboard
