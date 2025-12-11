import React, { useState, useEffect } from 'react'
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

function ListInvoiceTemplate({ templates: initialTemplates }) {
  const dispatch = useDispatch()
  const rows = useSelector(selectAllTemplates)
  const loading = useSelector(selectLoading)
  const error = useSelector(selectError)
  const [searchTerm, setSearchTerm] = useState('')
  const [lastQuery, setLastQuery] = useState('')
  const [detailLoadingId, setDetailLoadingId] = useState(null)
  const [deleteLoadingId, setDeleteLoadingId] = useState(null)

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
      return
    }
    dispatch(setLoading(true))
    dispatch(setError(null))
    try {
      const result = await fetchInvoiceTemplates(trimmed)
      dispatch(setTemplates(result.list))
      setLastQuery(trimmed)
    } catch (err) {
      dispatch(setError(err?.message || 'Failed to load invoice templates'))
      dispatch(setTemplates([]))
      setLastQuery(trimmed)
    } finally {
      dispatch(setLoading(false))
    }
  }

  const doSearch = (e) => {
    if (e && e.preventDefault) e.preventDefault()
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

  

  return (
    <div className="list-templates">
      <div className="list-header">
        <div className="title-col">
          <h2>Invoice Templates</h2>
          <p className="muted">Manage templates and view Net Term (days) per customer</p>
          <div className="header-actions">
            <button className="create-btn" onClick={handleCreate}>Create</button>
          </div>
        </div>

        <form className="search-wrap" onSubmit={doSearch}>
          <input
            className="search-input"
            placeholder="Search by customer..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <button type="submit" className="search-btn">Search</button>
        </form>
      </div>

      <table className="templates-table">
        <thead>
          <tr>
            <th>User Name</th>
            <th>Bill To Name</th>
            <th>Term (days)</th>
            <th>Freight Type</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={5}>Loading invoice templates...</td>
            </tr>
          )}
          {!loading && error && (
            <tr>
              <td colSpan={5} className="error-row">{error}</td>
            </tr>
          )}
          {!loading && !error && rows.length === 0 && lastQuery && (
            <tr>
              <td colSpan={5}>No templates found for "{lastQuery}".</td>
            </tr>
          )}
          {!loading && !error && !lastQuery && rows.length === 0 && (
            <tr>
              <td colSpan={5}>Enter a customer name above to load templates.</td>
            </tr>
          )}
          {!loading && !error && rows.map((row) => (
            <tr key={row.id}>
              <td>{row.userName || '-'}</td>
              <td>{row.billToName || '-'}</td>
              <td className="right">{row.term ?? '-'}</td>
              <td>{row.freightType || '-'}</td>
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
                    <span className="btn-label">{detailLoadingId === row.id ? 'Loading...' : 'Edit'}</span>
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
                    <span className="btn-label">{deleteLoadingId === row.id ? 'Deleting...' : 'Delete'}</span>
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default ListInvoiceTemplate
