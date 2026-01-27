import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './CreateCrdrTemplate.css'
import { getFreightTypes } from './api/freightTypes'
import { searchAgentCompaniesByName } from './api/agentCompanies'
import { insertCrdrTemplate } from './api/ListCrdrTemplate'

const DEFAULT_CRDR_TEMPLATE = {
  userName: 'POM',
  freightType: 'OI',
  agent: 0,
  agentName: '',
  term: 0,
  details: [
    {id: 'seed-0', description: '', debit: 0, credit: 0},
  ],
}

const toNumberOrZero = (value) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const createDetailRow = (overrides = {}) => ({
  id: overrides.id ?? `row-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  description: overrides.description ?? '',
  debit: overrides.debit ?? 0,
  credit: overrides.credit ?? 0,
})

function CreateCrdrTemplate({ template, onSave, onCancel }) {
  const navigate = useNavigate()

  const seed = useMemo(() => {
    if (template && typeof template === 'object') {
      return {
        ...DEFAULT_CRDR_TEMPLATE,
        ...template,
        details:
          Array.isArray(template.details) && template.details.length
            ? template.details.map((row, idx) => createDetailRow({ ...row, id: row.id ?? `seed-${idx}` }))
            : DEFAULT_CRDR_TEMPLATE.details,
      }
    }
    return DEFAULT_CRDR_TEMPLATE
  }, [template])

  const [form, setForm] = useState(seed)
  const [freightOptions, setFreightOptions] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const agentDebounce = useRef(null)
  const [agentAc, setAgentAc] = useState({ list: [], index: -1, visible: false, loading: false })

  useEffect(() => {
    return () => {
      if (agentDebounce.current) {
        clearTimeout(agentDebounce.current)
        agentDebounce.current = null
      }
    }
  }, [])

  useEffect(() => {
    setForm(seed)
  }, [seed])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const list = await getFreightTypes()
        if (!alive) return
        setFreightOptions(Array.isArray(list) ? list : [])
      } catch {
        // non-blocking
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const updateHeader = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const selectAgentCompany = (company) => {
    if (!company) return
    setForm((prev) => ({
      ...prev,
      agentName: company.companyName ?? prev.agentName,
      agent: company.companyId ?? prev.agent,
    }))
    setAgentAc((s) => ({ ...s, visible: false, index: -1 }))
  }

  const onAgentNameChange = (value) => {
    updateHeader('agentName', value)
    // Reset agent numeric id when typing freeform.
    updateHeader('agent', 0)

    const query = String(value ?? '').trim()
    if (agentDebounce.current) {
      clearTimeout(agentDebounce.current)
      agentDebounce.current = null
    }

    if (query.length < 2) {
      setAgentAc({ list: [], index: -1, visible: false, loading: false })
      return
    }

    setAgentAc((s) => ({ ...s, loading: true, visible: true }))
    agentDebounce.current = setTimeout(async () => {
      const list = await searchAgentCompaniesByName(query)
      setAgentAc({
        list,
        index: list.length ? 0 : -1,
        visible: true,
        loading: false,
      })
    }, 250)
  }

  const updateDetail = (index, field, value) => {
    setForm((prev) => {
      const next = Array.isArray(prev.details) ? [...prev.details] : []
      next[index] = { ...(next[index] || {}), [field]: value }
      return { ...prev, details: next }
    })
  }

  const addLine = () => {
    setForm((prev) => {
      const next = Array.isArray(prev.details) ? [...prev.details] : []
      next.push(createDetailRow())
      return { ...prev, details: next }
    })
  }

  const addLineIfLast = (index) => {
    setForm((prev) => {
      const next = Array.isArray(prev.details) ? [...prev.details] : []
      if (index !== next.length - 1) return prev
      next.push(createDetailRow())
      return { ...prev, details: next }
    })
  }

  const removeLine = (index) => {
    setForm((prev) => {
      const next = Array.isArray(prev.details) ? [...prev.details] : []
      next.splice(index, 1)
      return { ...prev, details: next.length ? next : [...DEFAULT_CRDR_TEMPLATE.details] }
    })
  }

  const normalizedPayload = useMemo(() => {
    const header = {
      userName: (form.userName || '').trim(),
      freightType: (form.freightType || '').trim(),
      agent: toNumberOrZero(form.agent),
      agentName: (form.agentName || '').trim(),
      term: toNumberOrZero(form.term),
      details: (form.details || []).map((d) => ({
        description: (d.description || '').trim(),
        debit: toNumberOrZero(d.debit),
        credit: toNumberOrZero(d.credit),
      })),
    }

    return header
  }, [form])

  const submit = async () => {
    setError(null)

    if (!normalizedPayload.userName) {
      setError('User name is required.')
      return
    }
    if (!normalizedPayload.agentName) {
      setError('Agent name is required.')
      return
    }
    if (!normalizedPayload.freightType) {
      setError('Freight type is required.')
      return
    }

    setSaving(true)
    try {
      const apiPayload = {
        userName: normalizedPayload.userName,
        freightType: normalizedPayload.freightType,
        agent: normalizedPayload.agent,
        agentName: normalizedPayload.agentName,
        term: normalizedPayload.term,
        details: normalizedPayload.details.map((d) => ({
          code: '',
          description: d.description,
          revenue: 0,
          cost: 0,
          ppcc: '',
          debit: d.debit,
          credit: d.credit,
          pShare: '0',
          pShareField: '0',
        })),
      }

      const response = await insertCrdrTemplate(apiPayload)
      if (response?.success === false) {
        throw new Error(response?.message || 'Failed to save CRDR template')
      }

      if (typeof onSave === 'function') {
        await onSave(normalizedPayload)
      }

      if (typeof onCancel === 'function') {
        onCancel()
      } else {
        navigate('/crdr-templates')
      }
    } catch (err) {
      setError(err?.message || 'Failed to save CRDR template')
    } finally {
      setSaving(false)
    }
  }

  const cancel = () => {
    if (typeof onCancel === 'function') return onCancel()
    navigate('/crdr-templates')
  }

  return (
    <div className="template-builder-page crdr-template-builder">
      <section className="panel builder-hero">
        <div className="hero-copy">
          <p className="eyebrow">CRDR TEMPLATE</p>
          <h2>Create CRDR Template</h2>
          <p>Define header metadata and detail lines, then save your template.</p>
          <div className="hero-badges">
            <span>Freight: {normalizedPayload.freightType || '—'}</span>
            <span>Lines: {normalizedPayload.details?.length ?? 0}</span>
            <span>Agent: {normalizedPayload.agentName || '—'}</span>
          </div>
        </div>

        <div className="hero-status">
          <ul className="progress-rail">
            <li className="complete">
              <span className="progress-bullet">1</span>
              <div>
                <p>Header</p>
                <small>User, agent, freight type</small>
              </div>
            </li>
            <li>
              <span className="progress-bullet">2</span>
              <div>
                <p>Details</p>
                <small>Codes, debit/credit, shares</small>
              </div>
            </li>
            <li>
              <span className="progress-bullet">3</span>
              <div>
                <p>Export / Save</p>
                <small>Copy payload or wire API</small>
              </div>
            </li>
          </ul>
        </div>
      </section>

      <section className="panel crdr-header-panel">
        <h3 style={{ marginTop: 0 }}>Header</h3>
        {error && <div className="error-row">{error}</div>}

        <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          <label className="field agent-name-field">
            <span>Agent Name</span>
            <div className="ac-wrapper">
              <input
                className="agent-name-input"
                value={form.agentName}
                onChange={(e) => onAgentNameChange(e.target.value)}
                onFocus={() => {
                  if ((agentAc.list?.length ?? 0) > 0) setAgentAc((s) => ({ ...s, visible: true }))
                }}
                onBlur={() => {
                  // Delay to allow option click via onMouseDown
                  window.setTimeout(() => setAgentAc((s) => ({ ...s, visible: false })), 150)
                }}
                onKeyDown={(e) => {
                  if (!agentAc.visible) return
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    setAgentAc((s) => ({ ...s, visible: false }))
                    return
                  }
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setAgentAc((s) => ({
                      ...s,
                      index: Math.min((s.list?.length ?? 1) - 1, (s.index ?? -1) + 1),
                    }))
                    return
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setAgentAc((s) => ({
                      ...s,
                      index: Math.max(0, (s.index ?? 0) - 1),
                    }))
                    return
                  }
                  if (e.key === 'Enter') {
                    if (agentAc.index >= 0 && agentAc.list?.[agentAc.index]) {
                      e.preventDefault()
                      selectAgentCompany(agentAc.list[agentAc.index])
                    }
                  }
                }}
                placeholder="Type 2+ chars (e.g., RAMSES)"
                autoComplete="off"
              />

              {agentAc.visible && (
                <div className="ac-menu" role="listbox" aria-label="Agent companies">
                  {agentAc.loading && <div className="ac-item muted">Searching…</div>}
                  {!agentAc.loading && (agentAc.list?.length ?? 0) === 0 && (
                    <div className="ac-item muted">No matches</div>
                  )}
                  {!agentAc.loading &&
                    (agentAc.list || []).map((item, idx) => (
                      <button
                        type="button"
                        key={item.companyId ?? `${item.companyName}-${idx}`}
                        className={`ac-item ${idx === agentAc.index ? 'active' : ''}`}
                        onMouseDown={(ev) => {
                          ev.preventDefault()
                          selectAgentCompany(item)
                        }}
                      >
                        <span className="ac-primary">{item.companyName}</span>
                        {item.companyId !== undefined && item.companyId !== null && (
                          <span className="ac-secondary">#{item.companyId}</span>
                        )}
                      </button>
                    ))}
                </div>
              )}
            </div>
          </label>
          
          <label className="field">
            <span>Term</span>
            <input
              type="number"
              value={form.term}
              onChange={(e) => updateHeader('term', e.target.value)}
            />
          </label>

          <label className="field">
            <span>Freight Type</span>
            {freightOptions.length ? (
              <select value={form.freightType} onChange={(e) => updateHeader('freightType', e.target.value)}>
                <option value="">Select…</option>
                {freightOptions.map((ft) => (
                  <option key={ft.id ?? ft.code ?? ft.value} value={ft.code ?? ft.value ?? ''}>
                    {ft.code ?? ft.value}
                  </option>
                ))}
              </select>
            ) : (
              <input value={form.freightType} onChange={(e) => updateHeader('freightType', e.target.value)} />
            )}
          </label>
        </div>
      </section>

      <section className="panel crdr-details-panel">
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem' }}>
          <div>
            <h3 style={{ marginTop: 0 }}>Details</h3>
            <p style={{ margin: 0, opacity: 0.75 }}>Add one row per CRDR line item.</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" className="btn outline" onClick={addLine}>
              + Add line
            </button>
          </div>
        </header>

        <div className="table-wrapper" style={{ overflowX: 'auto' }}>
          <table className="templates-table" style={{ minWidth: 560, marginTop: '1rem' }}>
            <thead>
              <tr>
                <th>Description</th>
                <th style={{ width: 300 }}>Debit</th>
                <th style={{ width: 300 }}>Credit</th>
                <th style={{ width: 90}} />
              </tr>
            </thead>
            <tbody>
              {(form.details || []).map((row, idx) => (
                <tr key={row.id ?? `row-${idx}`}>
                  <td>
                    <input
                      value={row.description ?? ''}
                      onChange={(e) => updateDetail(idx, 'description', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={row.debit ?? 0}
                      onChange={(e) => updateDetail(idx, 'debit', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={row.credit ?? 0}
                      onKeyDown={(e) => {
                        if (e.key === 'Tab' && !e.shiftKey) {
                          addLineIfLast(idx)
                        }
                      }}
                      onChange={(e) => updateDetail(idx, 'credit', e.target.value)}
                    />
                  </td>
                  <td>
                    <button type="button" className="btn danger" onClick={() => removeLine(idx)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel" style={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: '0.5rem' }}>
        <button type="button" className="btn ghost" onClick={cancel} disabled={saving}>
          Cancel
        </button>
        <button type="button" className="btn primary" onClick={submit} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </section>
    </div>
  )
}

export default CreateCrdrTemplate
