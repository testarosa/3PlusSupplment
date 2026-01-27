import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import './ListInvoiceTemplate.css'
import { fetchInvoiceTemplates, fetchInvoiceTemplateById, deleteInvoiceTemplate } from './api/invoiceTemplates'
import {
  setTemplates,
  setLoading,
  setError,
  setCurrentTemplate,
  clearCurrentTemplate,
  selectAllTemplates,
  selectLoading,
  selectError,
} from './store/slices/templateSlice'

const PAGE_SIZE = 10

const describeRelativeTime = (moment) => {
  if (!moment) return 'awaiting sync'
  const delta = Date.now() - moment.getTime()
  const abs = Math.abs(delta)
  const suffix = delta >= 0 ? 'ago' : 'from now'
  const seconds = Math.floor(abs / 1000)
  if (seconds < 60) return `${seconds}s ${suffix}`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${suffix}`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ${suffix}`
  const days = Math.floor(hours / 24)
  return `${days}d ${suffix}`
}

function ListInvoiceTemplate({ templates: initialTemplates }) {
  const dispatch = useDispatch()
  const rows = useSelector(selectAllTemplates)
  const loading = useSelector(selectLoading)
  const error = useSelector(selectError)
  const [searchTerm, setSearchTerm] = useState('')
  const [lastQuery, setLastQuery] = useState('')
  const [detailLoadingId, setDetailLoadingId] = useState(null)
  const [deleteLoadingId, setDeleteLoadingId] = useState(null)
  const [lastRefresh, setLastRefresh] = useState(null)
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (initialTemplates && initialTemplates.length) {
      dispatch(setTemplates(initialTemplates))
    }
  }, [initialTemplates, dispatch])

  const loadTemplates = async (customerName) => {
    const trimmed = (customerName || '').trim()
    if (!trimmed) {
      dispatch(setError('Enter a customer name to search.'))
      dispatch(setTemplates([]))
      setLastQuery('')
      setPage(1)
      return
    }
    dispatch(setLoading(true))
    dispatch(setError(null))
    try {
      const result = await fetchInvoiceTemplates(trimmed)
      dispatch(setTemplates(result.list))
      setLastQuery(trimmed)
      setLastRefresh(new Date())
      setPage(1)
    } catch (err) {
      dispatch(setError(err?.message || 'Failed to load invoice templates'))
      dispatch(setTemplates([]))
      setLastQuery(trimmed)
      setPage(1)
    } finally {
      dispatch(setLoading(false))
    }
  }

  const doSearch = (e) => {
    if (e && e.preventDefault) e.preventDefault()
    setPage(1)
    loadTemplates(searchTerm)
  }



  const handleDelete = async (id) => {
    const ok = window.confirm('Delete this template?')
    if (!ok) return
    setDeleteLoadingId(id)
    try {
      await deleteInvoiceTemplate(id)
      dispatch(setTemplates(rows.filter((r) => r.id !== id)))
    } catch (err) {
      dispatch(setError(err?.message || 'Failed to delete template'))
    } finally {
      setDeleteLoadingId(null)
    }
  }

  const nav = useNavigate()

  const handleEdit = async (row) => {
    if (!row?.id) return
    setDetailLoadingId(row.id)
    try {
      const data = await fetchInvoiceTemplateById(row.id)
      dispatch(setCurrentTemplate(data))
      nav(`/templates/edit/${row.id}`)
    } catch (err) {
      dispatch(setError(err?.message || 'Failed to load template details'))
    } finally {
      setDetailLoadingId(null)
    }
  }

  // Navigate to the Create Template page (Dashboard handles routing)
  // Prefer using the provided navigate() prop for a reliable transition.
  const handleCreate = () => {
    dispatch(clearCurrentTemplate())
    try {
      nav('/templates/create')
    } catch (err) {
      const hash = '#/create'
      if (window.location.hash !== hash) window.location.hash = hash
      else window.dispatchEvent(new HashChangeEvent('hashchange'))
    }
  }

  const stats = useMemo(() => {
    if (!rows.length) {
      return {
        total: 0,
        avgTerm: 0,
        expressCount: 0,
        topFreight: 'Unspecified',
        uniqueCustomers: 0,
      }
    }

    let termSum = 0
    let termEntries = 0
    let expressCount = 0
    const freightCounter = {}
    const customerSet = new Set()

    rows.forEach((row) => {
      const termValue = Number(row.term)
      if (!Number.isNaN(termValue)) {
        termSum += termValue
        termEntries += 1
        if (termValue <= 15) expressCount += 1
      }

      const freight = row.freightType || 'Unspecified'
      freightCounter[freight] = (freightCounter[freight] || 0) + 1

      const customerKey = row.billToName || row.userName || row.id
      if (customerKey) customerSet.add(customerKey)
    })

    const topFreight = Object.entries(freightCounter)
      .sort((a, b) => b[1] - a[1])
      .map(([key]) => key)[0] || 'Unspecified'

    return {
      total: rows.length,
      avgTerm: termEntries ? termSum / termEntries : 0,
      expressCount,
      topFreight,
      uniqueCustomers: customerSet.size,
    }
  }, [rows])

  const totalPages = useMemo(() => Math.max(1, Math.ceil(rows.length / PAGE_SIZE)), [rows.length])

  useEffect(() => {
    setPage((prev) => Math.min(Math.max(prev, 1), totalPages))
  }, [totalPages])

  const pageRange = useMemo(() => {
    const total = rows.length
    if (!total) return { start: 0, end: 0, total }
    const start = (page - 1) * PAGE_SIZE + 1
    const end = Math.min(page * PAGE_SIZE, total)
    return { start, end, total }
  }, [rows.length, page])

  const pagedRows = useMemo(() => {
    const startIndex = (page - 1) * PAGE_SIZE
    return rows.slice(startIndex, startIndex + PAGE_SIZE)
  }, [rows, page])

  return (
    <div className="templates-shell">
      <section className="panel template-hero">
        <div className="hero-text">
          <p className="eyebrow"></p>
          <h2>Invoice Templates</h2>
        </div>
      </section>

      <section className="panel template-search">
        <form className="search-form" onSubmit={doSearch}>
          <label className="field">
            <span>Customer name</span>
            <input
              className="search-input"
              placeholder="Try HYUNDAI, ABC Logistics..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </label>
          <div className="search-actions">
            <button type="submit" className="btn primary" disabled={loading}>
              {loading ? 'Searching…' : 'Search templates'}
            </button>
          </div>
        </form>
      </section>

      <section className="panel table-panel">
        <header className="table-header">
          <div>
            <h3>Invoice Template Item(s)</h3>
            <p>{stats.total} record(s) • showing user, bill-to, terms, and freight.</p>
          </div>
          <div className="search-actions">
            <button type="button" className="btn outline" onClick={handleCreate}>
              Create Template
            </button>
            <button type="button" className="btn ghost" onClick={doSearch} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh list'}
            </button>
          </div>
        </header>
        <div className={`table-wrapper ${loading ? 'is-loading' : ''}`}>
          {!loading && !error && rows.length > 0 && (
            <div className="pagination-bar" role="navigation" aria-label="Template pages">
              <div className="pagination-meta">
                Rows per page: {PAGE_SIZE} • {pageRange.start}-{pageRange.end} of {pageRange.total}
              </div>
              <div className="pagination-controls">
                <button
                  type="button"
                  className="btn outline pagination-btn"
                  onClick={() => setPage(1)}
                  disabled={page <= 1}
                >
                  First
                </button>
                <button
                  type="button"
                  className="btn outline pagination-btn"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={page <= 1}
                >
                  Prev
                </button>
                <span className="pagination-page" aria-live="polite">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  className="btn outline pagination-btn"
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={page >= totalPages}
                >
                  Next
                </button>
                <button
                  type="button"
                  className="btn outline pagination-btn"
                  onClick={() => setPage(totalPages)}
                  disabled={page >= totalPages}
                >
                  Last
                </button>
              </div>
            </div>
          )}
          <table>
            <thead>
              <tr>
                <th>User / Customer</th>
                <th>Bill To Name</th>
                <th>Net Terms</th>
                <th>Freight Type</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="loading-row">Loading invoice templates…</td>
                </tr>
              )}
              {!loading && error && (
                <tr>
                  <td colSpan={5} className="error-row">{error}</td>
                </tr>
              )}
              {!loading && !error && rows.length === 0 && lastQuery && (
                <tr>
                  <td colSpan={5} className="empty-row">No templates found for "{lastQuery}".</td>
                </tr>
              )}
              {!loading && !error && !lastQuery && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty-row">Enter a customer name to load templates.</td>
                </tr>
              )}
              {!loading && !error && pagedRows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div className="cell-stack">
                      <span className="cell-primary">{row.userName || 'Unassigned user'}</span>
                      <small>ID #{row.id}</small>
                    </div>
                  </td>
                  <td>
                    <div className="cell-stack">
                      <span className="cell-primary">{row.billToName || '—'}</span>
                      <small>{row.companyName || 'Bill-to customer'}</small>
                    </div>
                  </td>
                  <td className="number-cell">
                    <span className="term-chip">{row.term ?? '—'} days</span>
                  </td>
                  <td>
                    <span className="freight-pill">{row.freightType || '—'}</span>
                  </td>
                  <td>
                    <div className="action-btns">
                      <button
                        className="edit-btn"
                        onClick={() => handleEdit(row)}
                        aria-label={`Edit template ${row.id}`}
                        disabled={detailLoadingId === row.id}
                      >
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                          <path d="M3 21v-3.75L14.06 6.19l3.75 3.75L6.75 21H3z" fill="currentColor" opacity="0.9"/>
                          <path d="M20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor"/>
                        </svg>
                        <span className="btn-label">{detailLoadingId === row.id ? 'Loading…' : 'Edit'}</span>
                      </button>

                      <button
                        className="delete-btn"
                        onClick={() => handleDelete(row.id)}
                        aria-label={`Delete template ${row.id}`}
                        disabled={deleteLoadingId === row.id}
                      >
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                          <path d="M6 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M19 7l-1 12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <span className="btn-label">{deleteLoadingId === row.id ? 'Deleting…' : 'Delete'}</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

export default ListInvoiceTemplate
