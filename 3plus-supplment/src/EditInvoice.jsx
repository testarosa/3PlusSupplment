import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import './CreateInvoice.css'
import { getInvoiceByInvoiceId } from './api/invoices'

const DatePickerPopperContainer = ({ children }) => {
  if (typeof document === 'undefined') return children
  return createPortal(children, document.body)
}

const parseDate = (v) => {
  if (!v) return null
  try {
    const d = v instanceof Date ? v : new Date(v)
    return Number.isNaN(d.getTime()) ? null : d
  } catch (e) {
    return null
  }
}

export default function EditInvoice() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [payload, setPayload] = useState(() => {
    // list navigation state may contain summary fields; still fetch details.
    const state = location.state
    return state?.data ?? state ?? null
  })

  useEffect(() => {
    let alive = true
    if (!id) return () => { alive = false }

    setLoading(true)
    setError(null)
    getInvoiceByInvoiceId(id)
      .then((res) => {
        if (!alive) return
        if (res && typeof res === 'object' && res.success === false) {
          throw new Error(res.message || 'Failed to load invoice')
        }
        setPayload(res?.data ?? res)
      })
      .catch((err) => {
        if (!alive) return
        setError(err?.message || String(err))
      })
      .finally(() => {
        if (!alive) return
        setLoading(false)
      })

    return () => { alive = false }
  }, [id])

  const invoice = useMemo(() => {
    const details = Array.isArray(payload?.details) ? payload.details : []
    const mappedDetails = details.map((d, idx) => {
      const rate = Number(d?.rate) || 0
      const qty = Number(d?.qty) || 0
      const amount = d?.amount != null ? Number(d.amount) : rate * qty
      return {
        invoiceDetailId: d?.invoiceDetailId ?? idx + 1,
        billingCode: (d?.billingCode ?? '').toString(),
        description: (d?.description ?? '').toString(),
        rate,
        qty,
        amount: Number.isFinite(amount) ? amount : 0,
      }
    })

    const total = payload?.invoiceAmount != null
      ? Number(payload.invoiceAmount) || 0
      : mappedDetails.reduce((s, row) => s + (Number(row.amount) || 0), 0)

    return {
      companyId: payload?.companyId ?? null,
      companyName: payload?.companyName ?? '',
      invoiceId: payload?.invoiceId ?? payload?.id ?? null,
      invoiceNo: payload?.invoiceNo ?? '',
      invoiceDate: parseDate(payload?.invoiceDate),
      postDate: parseDate(payload?.postDate),
      dueDate: parseDate(payload?.dueDate),
      invoiceAmount: total,
      details: mappedDetails,
    }
  }, [payload])

  const [form, setForm] = useState(() => ({
    companyName: '',
    invoiceNo: '',
    invoiceDate: null,
    postDate: null,
    dueDate: null,
    details: [],
  }))

  useEffect(() => {
    setForm({
      companyName: invoice.companyName,
      invoiceNo: invoice.invoiceNo,
      invoiceDate: invoice.invoiceDate,
      postDate: invoice.postDate,
      dueDate: invoice.dueDate,
      details: invoice.details,
    })
  }, [invoice.companyName, invoice.invoiceNo, invoice.invoiceDate, invoice.postDate, invoice.dueDate, invoice.details])

  const subtotal = useMemo(() => {
    return (form.details || []).reduce((s, row) => s + (Number(row.amount) || 0), 0)
  }, [form.details])

  const updateDetail = (invoiceDetailId, field, value) => {
    setForm((prev) => ({
      ...prev,
      details: (prev.details || []).map((row) => {
        if (row.invoiceDetailId !== invoiceDetailId) return row
        const next = { ...row, [field]: value }
        const rate = Number(next.rate) || 0
        const qty = Number(next.qty) || 0
        next.amount = rate * qty
        return next
      }),
    }))
  }

  return (
    <div className="create-invoice-page">
      <section className="panel invoice-hero">
        <div className="hero-copy">
          <p className="eyebrow">Invoice</p>
          <h3>Edit invoice {invoice.invoiceNo ? `#${invoice.invoiceNo}` : id ? `ID ${id}` : ''}</h3>
        </div>
      </section>

      {loading && (
        <section className="panel">
          <div>Loading invoice…</div>
        </section>
      )}

      {error && (
        <section className="panel">
          <div style={{ marginBottom: '0.75rem' }}>Failed to load invoice: {error}</div>
          <button type="button" className="btn ghost" onClick={() => navigate('/invoices')}>Back to invoices</button>
        </section>
      )}

      {!loading && !error && (
        <>
          <section className="panel header-panel">
            <header className="panel-heading">
              <div>
                <h3>Invoice header</h3>
              </div>
            </header>

            <div className="header-grid">
              <div className="field span-2 customer-field">
                <label>Bill To</label>
                <input className="input-control" value={form.companyName || ''} readOnly />
              </div>

              <div className="field">
                <label>Invoice Post Date</label>
                <DatePicker
                  className="input-control"
                  selected={form.postDate}
                  onChange={(d) => setForm((s) => ({ ...s, postDate: d }))}
                  dateFormat="yyyy-MM-dd"
                  popperContainer={DatePickerPopperContainer}
                  popperClassName="datepicker-popper-portal"
                />
              </div>

              <div className="field">
                <label>Invoice Date</label>
                <DatePicker
                  className="input-control"
                  selected={form.invoiceDate}
                  onChange={(d) => setForm((s) => ({ ...s, invoiceDate: d }))}
                  dateFormat="yyyy-MM-dd"
                  popperContainer={DatePickerPopperContainer}
                  popperClassName="datepicker-popper-portal"
                />
              </div>

              <div className="field">
                <label>Due Date</label>
                <DatePicker
                  className="input-control"
                  selected={form.dueDate}
                  onChange={(d) => setForm((s) => ({ ...s, dueDate: d }))}
                  dateFormat="yyyy-MM-dd"
                  popperContainer={DatePickerPopperContainer}
                  popperClassName="datepicker-popper-portal"
                />
              </div>

              <div className="field">
                <label>Invoice Number</label>
                <input
                  className="input-control"
                  value={form.invoiceNo || ''}
                  onChange={(e) => setForm((s) => ({ ...s, invoiceNo: e.target.value }))}
                />
              </div>
            </div>
          </section>

          <section className="panel line-panel">
            <header className="panel-heading">
              <div>
                <h3>Invoice Items</h3>
              </div>
            </header>

            <div className="line-table-wrapper">
              <table className="line-table">
                <thead>
                  <tr>
                    <th>Billing Code</th>
                    <th>Description</th>
                    <th>Rate</th>
                    <th>Qty</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(form.details || []).map((row) => (
                    <tr key={row.invoiceDetailId}>
                      <td>
                        <input
                          value={row.billingCode}
                          onChange={(e) => updateDetail(row.invoiceDetailId, 'billingCode', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          value={row.description}
                          onChange={(e) => updateDetail(row.invoiceDetailId, 'description', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={row.rate}
                          onChange={(e) => updateDetail(row.invoiceDetailId, 'rate', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={row.qty}
                          onChange={(e) => updateDetail(row.invoiceDetailId, 'qty', e.target.value)}
                        />
                      </td>
                      <td className="right">{Number(row.amount || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="line-footer">
              <div className="subtotal-card">
                <p>Subtotal</p>
                <strong>${subtotal.toFixed(2)}</strong>
              </div>
            </div>

            <div className="action-row">
              <button type="button" className="btn ghost" onClick={() => navigate('/invoices')}>
                Back
              </button>
              <button
                type="button"
                className="btn primary"
                disabled
                title="Update endpoint not wired yet"
                onClick={() => {}}
              >
                Save changes
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
