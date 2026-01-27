import React, { useCallback, useState, useMemo, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
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

  // Billing code autocomplete cache (used for quick suggestions)
  const [billingCodeOptions, setBillingCodeOptions] = useState([])
  const [billingCodeBootstrapped, setBillingCodeBootstrapped] = useState(false)

  const [ac, setAc] = useState({ id: null, list: [], index: -1, visible: false, query: '' })
  const [billingAcStyle, setBillingAcStyle] = useState(null)
  const [customerAcStyle, setCustomerAcStyle] = useState(null)
  const billingDebounce = useRef({})

  useEffect(() => {
    let alive = true

    const normalizeCodes = (results) => {
      let list = (results || []).map((it) => ({
        code: (it?.value ?? it?.code ?? '').toString().trim(),
        desc: (it?.name ?? it?.description ?? it?.desc ?? '').toString().trim(),
      }))

      const seen = new Set()
      list = list.filter((item) => {
        if (!item.code) return false
        const key = `${item.code.toLowerCase()}::${(item.desc || '').toLowerCase()}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      // Keep a reasonable cap; the dropdown itself can scroll.
      return list.slice(0, 50)
    }

    ;(async () => {
      try {
        const results = await getBillingCodes('')
        if (!alive) return
        setBillingCodeOptions(normalizeCodes(results))
      } catch (err) {
        // ignore preload failures; live search still works
      } finally {
        if (alive) setBillingCodeBootstrapped(true)
      }
    })()

    return () => { alive = false }
  }, [])

  const updateBillingAcStyle = useCallback(() => {
    const id = ac?.id
    if (!id) return
    const node = refs.current?.[id]?.billingCode
    if (!node) return

    const rect = node.getBoundingClientRect()
    const margin = 12
    const preferredWidth = 320

    let width = Math.min(preferredWidth, window.innerWidth - margin * 2)
    width = Math.max(240, width)

    let left = rect.left
    if (left + width > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - margin - width)
    }

    const top = rect.bottom + 6

    const maxHeight = Math.max(140, Math.min(260, window.innerHeight - top - margin))

    setBillingAcStyle({
      position: 'fixed',
      top,
      left,
      width,
      maxHeight,
      zIndex: 3000,
    })
  }, [ac?.id])

  const updateCustomerAcStyle = useCallback(() => {
    const node = refs.current?.customerName
    if (!node) return

    const rect = node.getBoundingClientRect()
    const margin = 12

    let width = rect.width
    width = Math.min(Math.max(width, 260), window.innerWidth - margin * 2)

    let left = rect.left
    if (left + width > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - margin - width)
    }

    const top = rect.bottom + 6
    const maxHeight = Math.max(140, Math.min(260, window.innerHeight - top - margin))

    setCustomerAcStyle({
      position: 'fixed',
      top,
      left,
      width,
      maxHeight,
      zIndex: 3000,
    })
  }, [])

  useEffect(() => {
    if (!ac.visible || !ac.id) return
    updateBillingAcStyle()
    const handle = () => updateBillingAcStyle()
    window.addEventListener('scroll', handle, true)
    window.addEventListener('resize', handle)
    return () => {
      window.removeEventListener('scroll', handle, true)
      window.removeEventListener('resize', handle)
    }
  }, [ac.visible, ac.id, updateBillingAcStyle])

  useEffect(() => {
    if (!acCustomer.visible) return
    updateCustomerAcStyle()
    const handle = () => updateCustomerAcStyle()
    window.addEventListener('scroll', handle, true)
    window.addEventListener('resize', handle)
    return () => {
      window.removeEventListener('scroll', handle, true)
      window.removeEventListener('resize', handle)
    }
  }, [acCustomer.visible, updateCustomerAcStyle])
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

    // empty query -> show cached suggestions
    if (!q) {
      const list = billingCodeOptions.slice(0, 20)
      setAc({ id, list, index: list.length ? 0 : -1, visible: list.length > 0, query: value })
      return
    }

    // short queries -> local fallback; if no cached match, fall through to API
    if (q.length < 2) {
      const lowered = q.toLowerCase()
      const list = billingCodeOptions.filter((o) => o.code.toLowerCase().includes(lowered) || (o.desc && o.desc.toLowerCase().includes(lowered)))
      if (list.length) {
        setAc({ id, list, index: list.length ? 0 : -1, visible: true, query: value })
        return
      }
    }

    // show loading placeholder
    setAc({ id, list: [{ code: '__loading', desc: 'Searching...', disabled: true }], index: 0, visible: true, query: value })

    // debounce remote lookup
    billingDebounce.current[id] = setTimeout(async () => {
      try {
        console.debug('[CreateInvoiceTemplate] lookup billing codes for', q)
        const results = await getBillingCodes(q)
        let list = (results || []).map((it) => ({
          code: (it?.value ?? it?.code ?? '').toString().trim(),
          desc: (it?.name ?? it?.description ?? it?.desc ?? '').toString().trim(),
        }))

        const seen = new Set()
        list = list.filter((item) => {
          if (!item.code) return false
          const key = `${item.code.toLowerCase()}::${(item.desc || '').toLowerCase()}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })

        list = list.slice(0, 50)
        if (!list.length) list = [{ code: '__empty', desc: 'No matching billing codes', disabled: true }]

        setAc({ id, list, index: list.length ? 0 : -1, visible: true, query: value })
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
    if (opt.disabled || opt.code === '__loading' || opt.code === '__empty') return
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

  const lineStats = useMemo(() => {
    const filled = items.filter((it) => it.billingCode && it.description).length
    const zeroTotals = items.filter((it) => itemAmount(it) <= 0).length
    return {
      total: items.length,
      ready: filled,
      pending: Math.max(items.length - filled, 0),
      zeroTotals,
    }
  }, [items])

  const readiness = useMemo(() => ({
    customer: Boolean(customerName && customerId),
    logistics: Boolean((freightType || '').trim() && Number(netTerm) > 0),
    lines: lineStats.total > 0 && lineStats.ready === lineStats.total,
  }), [customerName, customerId, freightType, netTerm, lineStats.total, lineStats.ready])

  const progressSteps = useMemo(() => [
    {
      label: 'Customer match',
      complete: readiness.customer,
      detail: readiness.customer ? `Linked ID #${customerId}` : 'Search ERP directory',
    },
    {
      label: 'Logistics rules',
      complete: readiness.logistics,
      detail: readiness.logistics ? `${netTerm || 0}-day • ${freightType || 'Freight TBD'}` : 'Add net terms & freight',
    },
    {
      label: 'Line items',
      complete: readiness.lines,
      detail: `${lineStats.ready}/${lineStats.total} ready`,
    },
  ], [readiness, customerId, netTerm, freightType, lineStats.ready, lineStats.total])

  const avgLineAmount = useMemo(() => (
    lineStats.total ? subtotal / lineStats.total : 0
  ), [lineStats.total, subtotal])

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
      console.log('Submitting template', isEditing ? 'update' : 'create', tpl) 
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
    <div className="template-builder-page">
      <section className="panel builder-hero">
        <div className="hero-copy">
          <p className="eyebrow">Template studio</p>
          <h2>{isEditing ? 'Tune your invoice template' : 'Create invoice templates in minutes'}</h2>
        </div>
      </section>


      <form onSubmit={handleSubmit} className="template-builder" autoComplete="off">
        <section className="panel builder-form">
          <header className="panel-heading">
            <div>
              <p className="eyebrow">Template details</p>
              <h3>Customer &amp; logistics</h3>
            </div>
          </header>

          <div className="form-grid">
            <div className="field span-2">
              <label htmlFor="customerName">Customer name</label>
              <p className="field-hint">Begin typing to pull customers from the ERP directory.</p>
              <div className="ac-wrap customer-ac">
                <div className="customer-input-row">
                  <input
                    id="customerName"
                    className="customer-input"
                    name="customerName"
                    value={customerName}
                    onChange={(e) => handleCustomerChange(e.target.value)}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
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
                    placeholder="Search by customer name"
                    ref={(el) => { refs.current.customerName = el }}
                  />
                  {customerId != null && (
                    <span className="customer-id-chip">ID #{customerId}</span>
                  )}
                </div>

                {acCustomer.visible && typeof document !== 'undefined' &&
                  createPortal(
                    <ul className="ac-list ac-list-portal" role="listbox" style={customerAcStyle || undefined}>
                      {acCustomer.list.map((c, idx) => (
                        <li
                          key={`${c.id ?? c.name}-${idx}`}
                          className={idx === acCustomer.index ? 'active' : ''}
                          onMouseDown={(ev) => { ev.preventDefault(); selectCustomer(c) }}
                          role="option"
                          aria-selected={idx === acCustomer.index}
                        >
                          {c.name}
                        </li>
                      ))}
                    </ul>,
                    document.body
                  )}
              </div>
            </div>

            <div className="field">
              <label htmlFor="netTerm">Net terms (days)</label>
              <p className="field-hint">Used to generate due dates for invoices.</p>
              <input
                id="netTerm"
                type="number"
                value={netTerm}
                onChange={(e) => setNetTerm(e.target.value)}
                ref={(el) => { refs.current.term = el }}
              />
            </div>

            <div className="field">
              <label htmlFor="freightType">Freight type</label>
              <p className="field-hint">Drives default freight billing rules.</p>
              <select
                id="freightType"
                className="field-select"
                value={freightType}
                onChange={(e) => setFreightType(e.target.value)}
              >
                {freightOptions.map((opt) => (
                  <option key={opt?.id ?? opt?.code} value={opt?.code ?? opt?.value ?? ''}>
                    {opt?.value ?? opt?.code ?? ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className="panel builder-line-items">
          <header className="panel-heading">
            <div>
              <p className="eyebrow">Line items</p>
              <h3>Build the charge stack</h3>
            </div>
            <button
              type="button"
              className="btn outline"
              onClick={() => {
                const newId = addItem()
                setTimeout(() => {
                  const node = refs.current?.[newId]?.billingCode
                  if (node && typeof node.focus === 'function') node.focus()
                }, 0)
              }}
            >
              + Add row
            </button>
          </header>
          <p className="panel-hint">Billing codes auto-complete; use Tab on the final quantity to spawn another line.</p>

          <div className="line-table-wrapper">
            <table className="items-table">
              <thead>
                <tr>
                  <th>Billing code</th>
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
                        onFocus={() => {
                          if (ac.visible && ac.id === it.id) return
                          if (billingCodeOptions.length) {
                            const list = billingCodeOptions.slice(0, 6)
                            setAc({ id: it.id, list, index: list.length ? 0 : -1, visible: list.length > 0, query: it.billingCode })
                            return
                          }

                          if (!billingCodeBootstrapped) {
                            setAc({ id: it.id, list: [{ code: '__loading', desc: 'Loading...', disabled: true }], index: 0, visible: true, query: it.billingCode })
                          }
                        }}
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

                      {ac.visible && ac.id === it.id && typeof document !== 'undefined' &&
                        createPortal(
                          <ul className="ac-list ac-list-portal" role="listbox" style={billingAcStyle || undefined}>
                            {ac.list.map((opt, idx) => (
                              <li
                                key={`${opt.code}-${idx}`}
                                className={`${idx === ac.index ? 'active' : ''} ${opt.disabled ? 'disabled' : ''}`.trim()}
                                onMouseDown={(ev) => {
                                  if (opt.disabled) return
                                  ev.preventDefault();
                                  selectAc(it.id, opt)
                                }}
                                role="option"
                                aria-selected={idx === ac.index}
                                aria-disabled={Boolean(opt.disabled)}
                              >
                                <div className="ac-option">
                                  <div className="ac-code">{opt.code}</div>
                                  {opt.desc && <div className="ac-desc">{opt.desc}</div>}
                                </div>
                              </li>
                            ))}
                          </ul>,
                          document.body
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
                        className="btn danger"
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
          </div>

          <div className="line-footer">
            <div className="line-metrics">
            </div>
            <div className="subtotal-card">
              <p>Subtotal</p>
              <strong>${subtotal.toFixed(2)}</strong>
            </div>
          </div>
        </section>

        <section className="panel action-panel">
          <div className="action-grid">
            {onCancel && (
              <button type="button" className="btn ghost" onClick={() => onCancel?.()}>
                Cancel
              </button>
            )}
            <button className="btn primary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : isEditing ? 'Update template' : 'Save template'}
            </button>
          </div>
          {saveError && (
            <div className="save-error" role="alert">{saveError}</div>
          )}
        </section>
      </form>
    </div>
  )
}

export default CreateInvoiceTemplate
