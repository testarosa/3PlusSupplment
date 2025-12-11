import React, { useState, useMemo, useRef, useEffect } from 'react'
import { useSelector } from 'react-redux'
import { selectAuth } from './store/slices/authSlice'
import './CreateInvoiceTemplate.css'
import { getCustomersByName } from './api/customers'
import { getBillingCodes } from './api/billingCodes'
import { getFreightTypes } from './api/freightTypes'
import { saveInvoiceTemplate, updateInvoiceTemplate } from './api/invoiceTemplates'

function CreateInvoiceTemplate({ onSave, template, onCancel }) {
  const [customerName, setCustomerName] = useState(template?.customerName ?? template?.customer ?? '')
  const [customerId, setCustomerId] = useState(template?.customerId ?? template?.billTo ?? null)
  const [netTerm, setNetTerm] = useState(template?.netTerm ?? template?.term ?? 30)
  // store selected freight type code (e.g. 'OI', 'OE')
  const [freightType, setFreightType] = useState(template?.freightTypeCode ?? template?.freightType ?? '')
  const [freightOptions, setFreightOptions] = useState([])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const list = await getFreightTypes()
        if (!mounted) return
        setFreightOptions(list)
        // if no selection yet, default to first option code
        if (!freightType && list && list.length) setFreightType(list[0].code)
      } catch (err) {
        console.warn('Failed to load freight types', err)
      }
    })()
    return () => { mounted = false }
  }, [])
  const [items, setItems] = useState(
    (template?.items && template.items.length)
      ? template.items.map((it, idx) => ({ id: it.id ?? idx + 1, billingCode: it.billingCode ?? '', description: it.description ?? '', rate: it.rate ?? 0, qty: it.qty ?? 1 }))
      : [{ id: 1, billingCode: '', description: '', rate: 0, qty: 1 }]
  )

  // Sync incoming template prop once data loads (e.g., editing)
  useEffect(() => {
    if (!template) return
    setCustomerName(template.customerName ?? template.billToName ?? '')
    setCustomerId(template.customerId ?? template.billTo ?? null)
    setNetTerm(template.netTerm ?? template.term ?? 30)
    setFreightType(template.freightTypeCode ?? template.freightType ?? '')
    setItems((template.items && template.items.length)
      ? template.items.map((it, idx) => ({ id: it.id ?? idx + 1, billingCode: it.billingCode ?? '', description: it.description ?? '', rate: it.rate ?? 0, qty: it.qty ?? 1 }))
      : [{ id: 1, billingCode: '', description: '', rate: 0, qty: 1 }])
  }, [template])

  const updateItem = (id, field, value) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, [field]: value } : it)))
  }

  //Ref Number
  const refs = useRef({})

  // Customer options come from the API; start empty and load a small list on mount
  const [customerOptions, setCustomerOptions] = useState([])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const res = await getCustomersByName('SL')
        if (!mounted) return
        setCustomerOptions(uniqueByName(res))
      } catch (err) {
        console.warn('Failed to load initial customer options', err)
      }
    })()
    return () => { mounted = false }
  }, [])

  const [acCustomer, setAcCustomer] = useState({ list: [], index: -1, visible: false, query: '' })
  const custDebounce = useRef(null)
  useEffect(() => {
    return () => {
      if (custDebounce.current) {
        clearTimeout(custDebounce.current)
        custDebounce.current = null
      }
    }
  }, [])

  // Deduplicate customer list by name (case-insensitive)
  const uniqueByName = (list) => {
    const seen = new Set()
    const out = []
    for (const it of list || []) {
      const name = (typeof it === 'string' ? it : it?.name ?? '').toString().trim()
      if (!name) continue
      const key = name.toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        out.push(typeof it === 'string' ? { id: undefined, name } : it)
      }
    }
    return out
  }

  // Billing code autocomplete options (sample/demo data)
  const billingCodeOptions = []

  const [ac, setAc] = useState({ id: null, list: [], index: -1, visible: false, query: '' })
  const billingDebounce = useRef({})
  useEffect(() => {
    return () => {
      // clear any billing debounce timers
      Object.values(billingDebounce.current || {}).forEach((t) => clearTimeout(t))
      billingDebounce.current = {}
    }
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (!ac.visible) return
      // If Escape pressed anywhere while open, close
      if (e.key === 'Escape') setAc((s) => ({ ...s, visible: false }))
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [ac.visible])

  // close acCustomer with Escape as well
  useEffect(() => {
    const onKey = (e) => {
      if (!acCustomer.visible) return
      if (e.key === 'Escape') setAcCustomer((s) => ({ ...s, visible: false }))
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [acCustomer.visible])

  const handleAcChange = (id, value) => {
    updateItem(id, 'billingCode', value)
    const q = (value || '').trim()

    // cancel previous debounce for this id
    if (billingDebounce.current[id]) {
      clearTimeout(billingDebounce.current[id])
      billingDebounce.current[id] = null
    }

    // short queries -> local fallback list
    if (q.length < 2) {
      const list = q ? billingCodeOptions.filter((o) => o.code.toLowerCase().includes(q.toLowerCase()) || (o.desc && o.desc.toLowerCase().includes(q.toLowerCase()))) : billingCodeOptions.slice(0, 6)
      setAc({ id, list, index: list.length ? 0 : -1, visible: list.length > 0, query: value })
      return
    }

    // show loading placeholder
    setAc({ id, list: [{ code: '__loading', desc: 'Searching...' }], index: 0, visible: true, query: value })

    // debounce remote lookup
    billingDebounce.current[id] = setTimeout(async () => {
      try {
        console.debug('[CreateInvoiceTemplate] lookup billing codes for', q)
        const results = await getBillingCodes(q)
        // map API items {name, value} -> { code: value, desc: name }
        let list = (results || []).map((it) => ({ code: it.value, desc: it.name }))
        // deduplicate by code (value) then desc
        const seen = new Set()
        list = list.filter((it) => {
          const key = `${(it.code || '').toString()}::${(it.desc || '').toString()}`.toLowerCase()
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        setAc((s) => ({ id, list, index: list.length ? 0 : -1, visible: list.length > 0, query: value }))
      } catch (err) {
        console.warn('[CreateInvoiceTemplate] billing code lookup failed', err)
        setAc((s) => ({ id, list: [], index: -1, visible: false, query: value }))
      } finally {
        billingDebounce.current[id] = null
      }
    }, 300)
  }

  const selectAc = (id, opt) => {
    if (!opt) return
    // cancel pending debounce for this id
    if (billingDebounce.current[id]) {
      clearTimeout(billingDebounce.current[id])
      billingDebounce.current[id] = null
    }
    updateItem(id, 'billingCode', opt.code)
    updateItem(id, 'description', opt.desc || '')
    setAc({ id: null, list: [], index: -1, visible: false, query: '' })
    // focus description after selecting
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

  // Prevent removing the last remaining row — always keep at least one line item
  const removeItem = (id) => setItems((prev) => (prev.length > 1 ? prev.filter((i) => i.id !== id) : prev))

  const itemAmount = (it) => {
    const r = parseFloat(it.rate) || 0
    const q = parseFloat(it.qty) || 0
    return r * q
  }

  const subtotal = useMemo(() => items.reduce((s, it) => s + itemAmount(it), 0), [items])

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  const { user: currentUser } = useSelector(selectAuth)
  const isEditing = Boolean(template?.id)

  const handleSubmit = async (e) => {
    e.preventDefault()
    // Use the logged-in user's userId for the `userName` field as requested
    const userNameForApi = currentUser?.userId ?? currentUser?.userName ?? ''
    const tpl = {
      id: 0, // backend expects 0 even when updating (ID comes from route)
      userName: userNameForApi,
      billTo: customerId || 0,
      billToName: customerName || '',
      term: Number(netTerm),
      freightType: freightType || '',
      details: items.map((it) => ({
        id: 0,
        billingCode: it.billingCode || '',
        description: it.description || '',
        rate: Number(it.rate) || 0,
        qty: Number(it.qty) || 0,
        amount: itemAmount(it) || 0,
        invoiceHeaderTemplateId: 0,
      })),
      subtotal,
    }
    setSaving(true)
    setSaveError(null)
    try {
      const res = isEditing
        ? await updateInvoiceTemplate(template.id, tpl)
        : await saveInvoiceTemplate(tpl)
      console.log('saveInvoiceTemplate response', res)
      // call parent callback with the saved template or original payload
      onSave?.(res ?? tpl)
    } catch (err) {
      console.error('Failed to save template', err)
      setSaveError(err?.message || String(err))
    } finally {
      setSaving(false)
    }
  }

  // Customer autocomplete handlers
  const handleCustomerChange = (value) => {
    setCustomerName(value)
    setCustomerId(null)
    const q = (value || '').trim()
    // Cancel any pending debounce
    if (custDebounce.current) clearTimeout(custDebounce.current)

    // If query is short, fallback to demo list
    if (q.length < 2) {
      const list = q ? customerOptions.filter((c) => c.name.toLowerCase().includes(q.toLowerCase())) : customerOptions.slice(0, 6)
      const uniq = uniqueByName(list)
      setAcCustomer({ list: uniq, index: uniq.length ? 0 : -1, visible: uniq.length > 0, query: value })
      return
    }

    // show immediate loading placeholder while debouncing
    setAcCustomer({ list: [{ id: '__loading', name: 'Searching...' }], index: 0, visible: true, query: value })

    // Debounce remote lookup to avoid spamming API
    custDebounce.current = setTimeout(async () => {
      try {
        console.debug('[CreateInvoiceTemplate] lookup customers for', q)
        const results = await getCustomersByName(q)
        const list = (results && results.length) ? results : []
        const uniq = uniqueByName(list)
        setAcCustomer({ list: uniq, index: uniq.length ? 0 : -1, visible: uniq.length > 0, query: value })
      } catch (err) {
        console.warn('[CreateInvoiceTemplate] customer lookup failed', err)
        setAcCustomer({ list: [], index: -1, visible: false, query: value })
      } finally {
        custDebounce.current = null
      }
    }, 300)
  }

  const selectCustomer = (c) => {
    if (!c) return
    // cancel pending remote lookup
    if (custDebounce.current) {
      clearTimeout(custDebounce.current)
      custDebounce.current = null
    }
    setCustomerName(c.name)
    setCustomerId(c.id)
    setAcCustomer({ list: [], index: -1, visible: false, query: '' })
    // focus Term input after select
    setTimeout(() => {
      const node = refs.current?.term
      if (node && typeof node.focus === 'function') node.focus()
    }, 0)
  }

  return (
    <div className="create-template">
      <h2>Create Invoice Template</h2>
      <form onSubmit={handleSubmit} className="create-form">
        <div className="field-row">
          <label>Customer Name</label>
          <div className="ac-wrap">
            <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
            <input
              className="customer-input"
              value={customerName}
              onChange={(e) => handleCustomerChange(e.target.value)}
              onKeyDown={(e) => {
                if (acCustomer.visible) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setAcCustomer((s) => ({ ...s, index: Math.min(s.index + 1, s.list.length - 1) }))
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setAcCustomer((s) => ({ ...s, index: Math.max(s.index - 1, 0) }))
                  } else if (e.key === 'Enter') {
                    e.preventDefault()
                    const sel = acCustomer.list[acCustomer.index]
                    if (sel) selectCustomer(sel)
                  }
                }
              }}
              onBlur={() => setTimeout(() => setAcCustomer((s) => ({ ...s, visible: false })), 400)}
              placeholder="Customer name"
              ref={(el) => { refs.current.term = refs.current.term || el }}
            />
            {customerId != null && (
              <div className="customer-id">ID: {customerId}</div>
            )}
            </div>

            {acCustomer.visible && (
              <ul className="ac-list" role="listbox">
                {acCustomer.list.map((c, idx) => (
                  <li key={c.id}
                      className={idx === acCustomer.index ? 'active' : ''}
                      onMouseDown={(ev) => { ev.preventDefault(); selectCustomer(c) }}
                      role="option"
                      aria-selected={idx === acCustomer.index}
                  >
                    {c.name}
                  </li>
                ))}
              </ul>
            )}

          </div>
        </div>

        <div className="field-row">
          <label>Term (days)</label>
          <input type="number" value={netTerm} onChange={(e) => setNetTerm(e.target.value)} />
        </div>

        <div className="field-row">
          <label>Freight Type</label>
            <select className="field-select" value={freightType} onChange={(e) => setFreightType(e.target.value)}>
              {freightOptions.map((opt) => (
                <option key={opt?.id ?? opt?.code} value={opt?.code ?? opt?.value ?? ''}>
                  {opt?.value ?? opt?.code ?? ''}
                </option>
              ))}
            </select>
        </div>

        <div className="items-area">
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
                                    <div style={{display: 'flex', flexDirection: 'column'}}>
                                      <div className="ac-code" style={{fontWeight:600}}>{opt.code}</div>
                                      {opt.desc && <div className="ac-desc" style={{color: '#6b7280', fontSize: '13px'}}>{opt.desc}</div>}
                                    </div>
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
                        // If user tabs forward on the last row's last input, add a new row and focus its first field
                        if (e.key === 'Tab' && !e.shiftKey) {
                          const last = items[items.length - 1]
                          if (last && last.id === it.id) {
                            e.preventDefault()
                            const newId = addItem()
                            // focus the billingCode input of the newly added row after DOM updates
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

          <div className="items-actions">
            <div className="subtotal">Subtotal: ${subtotal.toFixed(2)}</div>
          </div>
        </div>

        <div className="form-actions">
          {onCancel && <button type="button" className="remove-btn" onClick={() => onCancel?.()}>Cancel</button>}
          <button className="save-btn" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Template'}</button>
        </div>
        {saveError && (
          <div className="save-error" role="alert">{saveError}</div>
        )}
      </form>
    </div>
  )
}

export default CreateInvoiceTemplate
