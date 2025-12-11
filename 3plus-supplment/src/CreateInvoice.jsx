import React, { useState, useMemo, useRef, useEffect } from 'react'
import './CreateInvoice.css'
import './CreateInvoiceTemplate.css'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { getBillingCodes } from './api/billingCodes'

const normalizeCustomerOption = (input) => {
  if (!input) return null
  if (typeof input === 'string') {
    const trimmed = input.trim()
    return trimmed ? { name: trimmed, value: trimmed } : null
  }
  const name = (input.name ?? input.Name ?? input.customerName ?? input.customer ?? '').toString().trim()
  const valueRaw = input.value ?? input.Value ?? input.code ?? input.Code
  const value = valueRaw != null ? valueRaw.toString() : name
  if (!name && !value) return null
  return { name: name || value, value: value || name }
}

const dedupeCustomerOptions = (list) => {
  const seen = new Set()
  const out = []
  for (const item of list || []) {
    const normalized = normalizeCustomerOption(item)
    if (!normalized) continue
    const key = `${normalized.name.toLowerCase()}::${normalized.value.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(normalized)
  }
  return out
}

const optionLabel = (opt) => {
  if (!opt) return ''
  if (typeof opt === 'string') return opt
  return opt.name || opt.value || ''
}

function CreateInvoice({ initialData = {}, title = 'Create Invoice', onCancel = null }) {
  // BL list is populated from templates or demo fallback (no Ref input in this UI)
  const [acBL, setAcBL] = useState({ list: [], index: -1, visible: false })
  const [selectedBL, setSelectedBL] = useState('')
  // editable header fields
  const [billTo, setBillTo] = useState(initialData?.billTo ?? '')
  const [acBill, setAcBill] = useState({ list: [], index: -1, visible: false, query: '' })
  const [customerOptions, setCustomerOptions] = useState([])
  const billLookupRef = useRef(null)
  const parseDate = (v) => {
    if (!v) return null
    try {
      const d = new Date(v)
      return Number.isNaN(d.getTime()) ? null : d
    } catch (e) { return null }
  }

  const [invoicePostDate, setInvoicePostDate] = useState(parseDate(initialData?.invoicePostDate) ?? new Date())
  const [invoiceDate, setInvoiceDate] = useState(parseDate(initialData?.invoiceDate) ?? new Date())
  const [dueDate, setDueDate] = useState(parseDate(initialData?.dueDate) ?? (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d })())
  const [invoiceNumber, setInvoiceNumber] = useState(initialData?.invoiceNumber ?? '')
  // Ref/search state (re-added per request)
  const [refSearchTerm, setRefSearchTerm] = useState(initialData?.ref ?? '')
  const [selectedRef, setSelectedRef] = useState(initialData?.ref ?? '')

  // Populate BL list on mount: prefer sessionStorage templates -> fallback generated demo BLs
  React.useEffect(() => {
    try {
      const templates = JSON.parse(sessionStorage.getItem('templates') || 'null')
      if (Array.isArray(templates) && templates.length) {
        const bls = Array.from(new Set(templates.flatMap((t) => (Array.isArray(t.blNumbers) ? t.blNumbers : [])).filter(Boolean)))
        if (bls.length) {
          setAcBL({ list: bls.slice(0, 50), index: 0, visible: false })
          return
        }
      }
    } catch (err) {
      // ignore
    }
    // fallback demo BLs
    const generated = Array.from({ length: 5 }, (_, i) => `BL-${(i + 1).toString().padStart(3, '0')}`)
    setAcBL((s) => ({ ...s, list: generated, index: generated.length ? 0 : -1, visible: false }))
  }, [])

  useEffect(() => {
    return () => {
      if (billLookupRef.current) {
        clearTimeout(billLookupRef.current)
        billLookupRef.current = null
      }
    }
  }, [])

  React.useEffect(() => {
    try {
      const templates = JSON.parse(sessionStorage.getItem('templates') || 'null')
      if (Array.isArray(templates) && templates.length) {
        const customers = Array.from(new Set(templates.map((t) => (t.customer || t.customerName || '').trim()).filter(Boolean)))
        setCustomerOptions(dedupeCustomerOptions(customers))
        return
      }
    } catch (e) {
      /* ignore */
    }
    setCustomerOptions(dedupeCustomerOptions(['ABC Co.', 'XYZ Ltd.', 'Acme Inc.']))
  }, [])

  // Ref handlers: autocomplete + search
  const handleRefChange = (val) => {
    setRefSearchTerm(val)
  }

  const doRefSearch = (e) => {
    if (e && e.preventDefault) e.preventDefault()
    setSelectedRef(refSearchTerm)
    // Populate BL list for this ref. Try to read from sessionStorage templates (key: 'templates')
    try {
      const templates = JSON.parse(sessionStorage.getItem('templates') || 'null')
      if (Array.isArray(templates)) {
        const t = templates.find((it) => (it.ref || '').toLowerCase() === (refSearchTerm || '').toLowerCase())
        if (t && Array.isArray(t.blNumbers) && t.blNumbers.length) {
          const list = t.blNumbers.slice(0, 50)
          setAcBL({ list, index: 0, visible: false })
          setSelectedBL('')
          return
        }
      }
    } catch (err) {
      // ignore
    }

    // Fallback: generate demo BL numbers based on the ref string
    const refKey = (refSearchTerm || 'REF').replace(/[^a-zA-Z0-9-]/g, '') || 'REF'
    const generated = Array.from({ length: 5 }, (_, i) => `${refKey}-BL-${(i + 1).toString().padStart(3, '0')}`)
    setAcBL({ list: generated, index: 0, visible: false })
    setSelectedBL('')
  }

  // initialize header fields when selectedRef or selectedBL change
  const refreshHeader = (refVal, blVal) => {
    // compute defaults
  const today = new Date()

    // billTo from templates if available
    let bt = ''
    let term = 30
    try {
      const templates = JSON.parse(sessionStorage.getItem('templates') || 'null')
      if (Array.isArray(templates)) {
        // try to find a template that matches ref or includes the selected BL, otherwise fall back to the first template
        let t = null
        if (refVal) t = templates.find((it) => (it.ref || '').toLowerCase() === (refVal || '').toLowerCase())
        if (!t && blVal) t = templates.find((it) => Array.isArray(it.blNumbers) && it.blNumbers.includes(blVal))
        if (!t && templates.length) t = templates[0]
        if (t) {
          if (t.customer) bt = t.customer
          if (Number.isFinite(Number(t.netTerm))) term = Number(t.netTerm)
        }
      }
    } catch (err) { /* ignore */ }

  const post = today
  const inv = today
  const dueD = (() => { const d = new Date(); d.setDate(d.getDate() + term); return d })()
    const invNum = blVal ? `${blVal}-INV-${Date.now().toString().slice(-6)}` : (refVal ? `${refVal}-INV-${Date.now().toString().slice(-6)}` : `INV-${Date.now().toString().slice(-6)}`)

    setBillTo(bt)
  setInvoicePostDate(post)
  setInvoiceDate(inv)
  setDueDate(dueD)
    setInvoiceNumber(invNum)
  }

  React.useEffect(() => {
    refreshHeader(selectedRef, selectedBL)
  }, [selectedRef, selectedBL])

  const handleBillChange = (val) => {
    setBillTo(val)
    if (billLookupRef.current) {
      clearTimeout(billLookupRef.current)
      billLookupRef.current = null
    }

    const q = (val || '').trim()
    if (!q) {
      const list = customerOptions.slice(0, 8)
      setAcBill({ list, index: list.length ? 0 : -1, visible: list.length > 0, query: val })
      return
    }

    if (q.length < 2) {
      const lower = q.toLowerCase()
      const list = customerOptions.filter((opt) => optionLabel(opt).toLowerCase().includes(lower)).slice(0, 8)
      setAcBill({ list, index: list.length ? 0 : -1, visible: list.length > 0, query: val })
      return
    }

    setAcBill({ list: [{ name: 'Searching...', value: '__loading', disabled: true }], index: 0, visible: true, query: val })

    billLookupRef.current = setTimeout(async () => {
      try {
        const results = await getBillingCodes(q)
        const normalized = dedupeCustomerOptions(results)
        setAcBill({ list: normalized, index: normalized.length ? 0 : -1, visible: normalized.length > 0, query: val })
      } catch (err) {
        console.warn('[CreateInvoice] billing code lookup failed', err)
        setAcBill({ list: [], index: -1, visible: false, query: val })
      } finally {
        billLookupRef.current = null
      }
    }, 300)
  }

  const selectBill = (val) => {
    if (!val || val.value === '__loading') return
    const normalized = normalizeCustomerOption(val)
    if (!normalized) return
    setBillTo(normalized.name)
    setAcBill({ list: [], index: -1, visible: false, query: '' })
  }

  const handleAutoPopulate = () => {
    const invNum = selectedBL
      ? `${selectedBL}-INV-${Date.now().toString().slice(-6)}`
      : `INV-${Date.now().toString().slice(-8)}`
    setInvoiceNumber(invNum)

    try {
      const templates = JSON.parse(sessionStorage.getItem('templates') || 'null')
      if (Array.isArray(templates) && (billTo || '').trim()) {
        const cust = (billTo || '').trim().toLowerCase()
        const match = templates.find((t) => {
          const name = (t.customerName || t.customer || '').toString().trim().toLowerCase()
          return name && name === cust
        })
        if (match && Array.isArray(match.items) && match.items.length) {
          const mapped = match.items.map((it, idx) => ({
            id: idx + 1,
            billingCode: it.billingCode || it.code || '',
            description: it.description || it.desc || '',
            rate: typeof it.rate !== 'undefined' ? it.rate : (it.amount || 0),
            qty: typeof it.qty !== 'undefined' ? it.qty : 1
          }))
          setItems(mapped)
          return
        }
      }
    } catch (err) {
      // ignore; leave items as-is
    }
  }

  // Line items (reused from CreateInvoiceTemplate)
  const [items, setItems] = useState(
    (initialData?.items && initialData.items.length)
      ? initialData.items.map((it, idx) => ({ id: it.id ?? idx + 1, billingCode: it.billingCode ?? it.code ?? '', description: it.description ?? it.desc ?? '', rate: it.rate ?? it.amount ?? 0, qty: it.qty ?? 1 }))
      : [{ id: 1, billingCode: '', description: '', rate: 0, qty: 1 }]
  )
  const updateItem = (id, field, value) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, [field]: value } : it)))
  }

  const refs = useRef({})

  // Billing code autocomplete options (sample/demo data)
  const billingCodeOptions = [
    { code: 'BC-001', desc: 'Standard Item A' },
    { code: 'BC-002', desc: 'Standard Item B' },
    { code: 'SERV-100', desc: 'Consulting Service' },
    { code: 'PROD-200', desc: 'Product 200' },
    { code: 'CONSULT', desc: 'Consulting (hourly)' },
    { code: 'SETUP', desc: 'Setup Fee' },
    { code: 'MAINT', desc: 'Maintenance' },
    { code: 'DISCOUNT', desc: 'Discount / Credit' }
  ]

  const [ac, setAc] = useState({ id: null, list: [], index: -1, visible: false, query: '' })

  useEffect(() => {
    const onKey = (e) => {
      if (!ac.visible) return
      if (e.key === 'Escape') setAc((s) => ({ ...s, visible: false }))
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [ac.visible])

  const handleAcChange = (id, value) => {
    updateItem(id, 'billingCode', value)
    const q = (value || '').trim().toLowerCase()
    const list = q
      ? billingCodeOptions.filter((o) => o.code.toLowerCase().includes(q) || (o.desc && o.desc.toLowerCase().includes(q)))
      : billingCodeOptions.slice(0, 6)
    setAc({ id, list, index: list.length ? 0 : -1, visible: list.length > 0, query: value })
  }

  const selectAc = (id, opt) => {
    if (!opt) return
    updateItem(id, 'billingCode', opt.code)
    updateItem(id, 'description', opt.desc || '')
    setAc({ id: null, list: [], index: -1, visible: false, query: '' })
    setTimeout(() => {
      const node = refs.current?.[id]?.description
      if (node && typeof node.focus === 'function') node.focus()
    }, 0)
  }

  const addItem = () => {
    const nextId = items.length ? Math.max(...items.map((i) => i.id)) + 1 : 1
    setItems((prev) => [...prev, { id: nextId, billingCode: '', description: '', rate: 0, qty: 1 }])
    return nextId
  }

  // Keep at least one line item — don't remove if there's only one left
  const removeItem = (id) => setItems((prev) => (prev.length > 1 ? prev.filter((i) => i.id !== id) : prev))

  const itemAmount = (it) => {
    const r = parseFloat(it.rate) || 0
    const q = parseFloat(it.qty) || 0
    return r * q
  }

  const subtotal = useMemo(() => items.reduce((s, it) => s + itemAmount(it), 0), [items])

  const handleSaveInvoice = (e) => {
    e?.preventDefault()
    const fmt = (d) => (d ? (d instanceof Date ? d.toISOString().slice(0,10) : new Date(d).toISOString().slice(0,10)) : null)
    const invoice = {
      ref: selectedRef,
      bl: selectedBL,
      billTo,
      invoicePostDate: fmt(invoicePostDate),
      invoiceDate: fmt(invoiceDate),
      dueDate: fmt(dueDate),
      invoiceNumber,
      items: items.map((it) => ({ ...it, rate: Number(it.rate), qty: Number(it.qty), amount: itemAmount(it) })),
      subtotal
    }
    console.log('Save Invoice (demo):', invoice)
    alert('Invoice saved (demo) — check console')
  }

  // default cancel behavior navigates back to invoices list if no onCancel provided
  const internalCancel = () => {
    try {
      if (typeof onCancel === 'function') return onCancel()
      // attempt to navigate using history if available
      window.location.hash = '#/invoices'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    } catch (err) {
      // final fallback: set location
      window.location.href = '/#/invoices'
    }
  }

  return (
    <div className="create-invoice-root">
      <h2>{title}</h2>

      <div style={{ marginTop: '1rem' }}>
        <div className="invoice-header-box">
          <form onSubmit={doRefSearch} className="create-ref-form">
            <div className="field" style={{ width: '100%' }}>
              <label>Reference Number</label>
              <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'flex-start', width: '100%' }}>
                <div className="ac-wrap ref-wrap" style={{ flex: 1 }}>
                  <input
                    className="ref-input"
                    placeholder="Reference number"
                    value={refSearchTerm}
                    onChange={(e) => handleRefChange(e.target.value)}
                  />
                </div>

                <button className="search-btn ref-search-btn" onClick={doRefSearch}>Search</button>
              </div>

              <div style={{ marginTop: '0.75rem' }}>
                <select
                  className="bl-dropdown"
                  value={selectedBL || ''}
                  onChange={(e) => setSelectedBL(e.target.value)}
                  aria-label="Select BL"
                  style={{ width: '100%' }}
                >
                  <option value="">Select BL</option>
                  {acBL.list.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
            </div>
          </form>
          {/* Editable invoice header row */}
          <div className="invoice-readonly-row" style={{ marginTop: '1rem' }}>
          <div className="field">
            <label>Bill To</label>
            <div className="ac-wrap bill-wrap" style={{ position: 'relative' }}>
              <input
                className="readonly-input"
                placeholder="Bill To"
                value={billTo}
                onChange={(e) => handleBillChange(e.target.value)}
                onFocus={() => { if (!acBill.visible && customerOptions.length) { setAcBill((s) => ({ ...s, list: customerOptions.slice(0, 6), index: customerOptions.length ? 0 : -1, visible: true })) } }}
                onKeyDown={(e) => {
                  if (acBill.visible) {
                    if (e.key === 'ArrowDown') { e.preventDefault(); setAcBill((s) => ({ ...s, index: Math.min(s.index + 1, s.list.length - 1) })) }
                    else if (e.key === 'ArrowUp') { e.preventDefault(); setAcBill((s) => ({ ...s, index: Math.max(s.index - 1, 0) })) }
                    else if (e.key === 'Enter') {
                      e.preventDefault()
                      const sel = acBill.list[acBill.index]
                      if (sel && sel.value !== '__loading') selectBill(sel)
                    }
                  }
                }}
                onBlur={() => setTimeout(() => setAcBill((s) => ({ ...s, visible: false })), 120)}
              />

              {acBill.visible && (
                <ul className="ac-list" role="listbox" style={{ top: 'calc(100% + 6px)' }}>
                  {acBill.list.map((opt, idx) => {
                    const label = optionLabel(opt) || 'Unnamed'
                    const key = `${opt?.value || label}-${idx}`
                    const disabled = Boolean(opt?.disabled || opt?.value === '__loading')
                    return (
                      <li
                        key={key}
                        className={`${idx === acBill.index ? 'active' : ''} ${disabled ? 'disabled' : ''}`.trim()}
                        onMouseDown={(ev) => {
                          if (disabled) return
                          ev.preventDefault()
                          selectBill(opt)
                        }}
                        role="option"
                        aria-selected={idx === acBill.index}
                        aria-disabled={disabled}
                      >
                        {label}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
            <button
              type="button"
              className="auto-pop-btn"
              style={{ marginTop: '0.5rem' }}
              onClick={handleAutoPopulate}
              title="Auto populate invoice number"
            >
              Auto Populate
            </button>
          </div>

          <div className="field">
            <label>Invoice Post Date</label>
            <DatePicker className="readonly-input" selected={invoicePostDate} onChange={(d) => setInvoicePostDate(d)} dateFormat="yyyy-MM-dd" />
          </div>

          <div className="field">
            <label>Invoice Date</label>
            <DatePicker className="readonly-input" selected={invoiceDate} onChange={(d) => setInvoiceDate(d)} dateFormat="yyyy-MM-dd" />
          </div>

          <div className="field">
            <label>Due Date</label>
            <DatePicker className="readonly-input" selected={dueDate} onChange={(d) => setDueDate(d)} dateFormat="yyyy-MM-dd" />
          </div>

          <div className="field">
            <label>Invoice Number</label>
            <input className="readonly-input" readOnly value={invoiceNumber} />
            </div>
          </div>
          {/* Line items area (copied from CreateInvoiceTemplate) */}
          <div className="items-area" style={{ marginTop: '1rem' }}>
            <div className="items-header">
              <h3>Line Items</h3>
            </div>

            <table className="items-table">
              <thead>
                <tr>
                  <th>Billing Code</th>
                  <th>Description</th>
                  <th>Rate</th>
                  <th>Qty</th>
                  <th>Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td className="billing-cell">
                      <input
                        value={it.billingCode}
                        onChange={(e) => handleAcChange(it.id, e.target.value)}
                        onKeyDown={(e) => {
                          if (ac.visible && ac.id === it.id) {
                            if (e.key === 'ArrowDown') {
                              e.preventDefault()
                              setAc((s) => ({ ...s, index: Math.min(s.index + 1, s.list.length - 1) }))
                            } else if (e.key === 'ArrowUp') {
                              e.preventDefault()
                              setAc((s) => ({ ...s, index: Math.max(s.index - 1, 0) }))
                            } else if (e.key === 'Enter') {
                              e.preventDefault()
                              const sel = ac.list[ac.index]
                              if (sel) selectAc(it.id, sel)
                            }
                          }
                        }}
                        onBlur={() => setTimeout(() => setAc((s) => ({ ...s, visible: false })), 150)}
                        ref={(el) => { refs.current[it.id] = refs.current[it.id] || {}; refs.current[it.id].billingCode = el }}
                      />

                      {ac.visible && ac.id === it.id && (
                        <ul className="ac-list" role="listbox">
                          {ac.list.map((opt, idx) => (
                            <li
                              key={opt.code}
                              className={idx === ac.index ? 'active' : ''}
                              onMouseDown={(ev) => { ev.preventDefault(); selectAc(it.id, opt) }}
                              role="option"
                              aria-selected={idx === ac.index}
                            >
                              <div className="ac-code">{opt.code}</div>
                              {opt.desc && <div className="ac-desc">{opt.desc}</div>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td>
                      <input
                        value={it.description}
                        onChange={(e) => updateItem(it.id, 'description', e.target.value)}
                        ref={(el) => { refs.current[it.id] = refs.current[it.id] || {}; refs.current[it.id].description = el }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={it.rate}
                        onChange={(e) => updateItem(it.id, 'rate', e.target.value)}
                        ref={(el) => { refs.current[it.id] = refs.current[it.id] || {}; refs.current[it.id].rate = el }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={it.qty}
                        onChange={(e) => updateItem(it.id, 'qty', e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Tab' && !e.shiftKey) {
                            const last = items[items.length - 1]
                            if (last && last.id === it.id) {
                              e.preventDefault()
                              const newId = addItem()
                              setTimeout(() => {
                                const node = refs.current?.[newId]?.billingCode
                                if (node && typeof node.focus === 'function') node.focus()
                              }, 0)
                            }
                          }
                        }}
                        ref={(el) => { refs.current[it.id] = refs.current[it.id] || {}; refs.current[it.id].qty = el }}
                      />
                    </td>
                    <td className="right">{itemAmount(it).toFixed(2)}</td>
                    <td>
                      <button
                        type="button"
                        className="remove-btn"
                        onClick={() => removeItem(it.id)}
                        disabled={items.length === 1}
                        title={items.length === 1 ? 'At least one line item is required' : 'Remove this line'}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="subtotal-row">
              <div className="subtotal">Subtotal: ${subtotal.toFixed(2)}</div>
            </div>

            <div className="form-actions invoice-actions-centered">
              <button type="button" className="remove-btn" onClick={internalCancel}>Cancel</button>
              <button className="save-btn" type="button" onClick={handleSaveInvoice}>Save</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CreateInvoice
