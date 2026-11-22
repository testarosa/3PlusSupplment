import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { findApBillingCodes } from '../api/accountsPayable'

export default function ApBillingCodeAutocomplete({ label, value, onChange, onSelect, onBlur, required, disabled, inputId, describedBy }) {
  const id = useId()
  const input = useRef(null)
  const popup = useRef(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [response, setResponse] = useState(null)
  const query = value.trim()
  const expanded = !disabled && open && Boolean(query)
  const result = response?.query === query ? response : null
  const matches = result?.matches ?? []
  const activeId = expanded && matches[active] ? id + '-' + matches[active].code : undefined

  useEffect(() => {
    if (!expanded) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      findApBillingCodes(query, controller.signal)
        .then((matches) => { if (!controller.signal.aborted) setResponse({ query, matches }) })
        .catch(() => { if (!controller.signal.aborted) setResponse({ query, failed: true }) })
    }, 200)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [expanded, query])

  useLayoutEffect(() => {
    if (!expanded || !popup.current || !input.current) return
    const menu = popup.current
    const anchor = input.current

    // Render outside the scrolling charge table so it cannot clip the suggestions.
    function position() {
      const rect = anchor.getBoundingClientRect()
      const bounds = anchor.closest('.line-table-wrapper')?.getBoundingClientRect()
      const gutter = 8
      const width = Math.min(Math.max(rect.width, 260), window.innerWidth - gutter * 2)
      const below = window.innerHeight - rect.bottom - gutter
      const above = rect.top - gutter
      const placeAbove = below < 180 && above > below
      Object.assign(menu.style, {
        width: width + 'px',
        left: Math.max(gutter, Math.min(rect.left, window.innerWidth - width - gutter)) + 'px',
        top: placeAbove ? 'auto' : rect.bottom + 4 + 'px',
        bottom: placeAbove ? window.innerHeight - rect.top + 4 + 'px' : 'auto',
        maxHeight: Math.max(0, Math.min(245, (placeAbove ? above : below) - 4)) + 'px',
        visibility: bounds && (rect.bottom <= bounds.top || rect.top >= bounds.bottom ||
          rect.right <= bounds.left || rect.left >= bounds.right) ? 'hidden' : 'visible',
      })
    }

    position()
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    return () => {
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
    }
  }, [expanded])

  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' })
  }, [activeId])

  function close() {
    setOpen(false)
    setActive(-1)
  }

  function select(item) {
    onSelect(item)
    close()
  }

  function onKeyDown(event) {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Escape' && expanded) {
      event.preventDefault()
      close()
    } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && query) {
      event.preventDefault()
      setOpen(true)
      if (matches.length) setActive((index) => event.key === 'ArrowDown'
        ? Math.min(index + 1, matches.length - 1)
        : index <= 0 ? matches.length - 1 : index - 1)
    } else if (event.key === 'Enter' && expanded) {
      event.preventDefault()
      if (matches[active]) select(matches[active])
      else close()
    }
  }

  return (
    <>
      <input ref={input} id={inputId} aria-label={label} aria-describedby={describedBy}
        role="combobox" aria-autocomplete="list" aria-expanded={expanded}
        aria-controls={expanded ? id : undefined} aria-activedescendant={activeId}
        autoComplete="off" spellCheck={false} maxLength={20} required={required} disabled={disabled}
        placeholder="Code or description" value={value}
        onChange={(event) => {
          setActive(-1)
          setOpen(true)
          onChange(event.target.value)
        }}
        onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onBlur={() => {
          close()
          onBlur?.()
        }} onKeyDown={onKeyDown} />
      {expanded && createPortal(
        <div ref={popup} className="billing-user-popup ap-code-popup">
          <ul id={id} role="listbox" aria-label="Matching AP billing codes">
            {matches.map((item, index) => (
              <li key={item.code} id={id + '-' + item.code} role="option" aria-selected={index === active}
                onMouseDown={(event) => event.preventDefault()} onClick={() => select(item)}>
                <strong>{item.code}</strong><small>{item.description}</small>
              </li>
            ))}
          </ul>
          {!matches.length && <p role="status">{!result ? 'Looking up billing codes...'
            : result.failed ? 'Billing code suggestions are unavailable.' : 'No matching AP billing codes.'}</p>}
        </div>,
        document.body,
      )}
    </>
  )
}
