import { useEffect, useId, useState } from 'react'
import { findApVendors } from '../api/accountsPayable'

export default function ApVendorAutocomplete({ value, onChange, requireSelection = false, invalid = false, disabled = false, notice }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [response, setResponse] = useState(null)
  const query = value.trim()
  const expanded = !disabled && open && (query.length >= 2 || /^[1-9]$/.test(query))
  const result = response?.query === query ? response : null
  const vendors = result?.vendors ?? []
  const activeId = expanded && vendors[active] ? id + '-vendor-' + active : undefined

  useEffect(() => {
    if (!expanded) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      findApVendors(query, controller.signal)
        .then((vendors) => { if (!controller.signal.aborted) setResponse({ query, vendors }) })
        .catch(() => { if (!controller.signal.aborted) setResponse({ query, failed: true }) })
    }, 200)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [expanded, query])

  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' })
  }, [activeId])

  function close() {
    setOpen(false)
    setActive(-1)
  }

  function select(vendor) {
    onChange(vendor.name, vendor.id)
    close()
  }

  function onKeyDown(event) {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      close()
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      if (query.length < 2 && !/^[1-9]$/.test(query)) return
      event.preventDefault()
      setOpen(true)
      if (!vendors.length) return
      setActive((index) => event.key === 'ArrowDown'
        ? Math.min(index + 1, vendors.length - 1)
        : index <= 0 ? vendors.length - 1 : index - 1)
    } else if (event.key === 'Enter' && expanded) {
      event.preventDefault()
      if (vendors[active]) select(vendors[active])
      else close()
    }
  }

  return (
    <div className="field ap-vendor-field">
      <label htmlFor={id}>Vendor</label>
      <div className="ap-vendor-anchor">
        <input id={id} role="combobox" type="text" autoComplete="off" spellCheck={false} disabled={disabled}
          required={!requireSelection} aria-invalid={invalid || undefined}
          aria-autocomplete="list" aria-expanded={expanded} aria-controls={id + '-vendors'}
          aria-activedescendant={activeId} aria-describedby={invalid || notice ? id + '-vendor-help' : undefined}
          placeholder="Vendor name or ID" value={value}
          onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onBlur={close} onKeyDown={onKeyDown}
          onChange={(event) => {
            setActive(-1)
            setOpen(true)
            onChange(event.target.value, null)
          }} />
        <div className="billing-user-popup" hidden={!expanded}>
          <ul id={id + '-vendors'} role="listbox" aria-label="Matching PLUS vendors">
            {vendors.map((vendor, index) => (
              <li key={vendor.id} id={id + '-vendor-' + index} role="option" aria-selected={active === index}
                onMouseDown={(event) => event.preventDefault()} onClick={() => select(vendor)}>
                <strong>{vendor.name}</strong><small>PLUS ID {vendor.id}</small>
              </li>
            ))}
          </ul>
          {expanded && !vendors.length && <p role="status">{!result ? 'Looking up vendors...'
            : result.failed ? 'Vendor suggestions are unavailable.'
              : 'No matching vendors.'}</p>}
        </div>
      </div>
      {(invalid || notice) && <small id={id + '-vendor-help'} role="status">
        {notice || 'Select a PLUS vendor from the suggestions before saving.'}
      </small>}
    </div>
  )
}
