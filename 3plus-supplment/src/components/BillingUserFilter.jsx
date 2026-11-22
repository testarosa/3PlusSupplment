import { useEffect, useId, useRef, useState } from 'react'
import { findBillingUsers } from '../api/billingUsers'

export default function BillingUserFilter({ value, onChange }) {
  const id = useId()
  const input = useRef(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [response, setResponse] = useState(null)
  const query = value.trim()
  const result = response?.query === query ? response : null
  const users = result?.users ?? []
  const expanded = open && Boolean(query)

  useEffect(() => {
    if (!expanded) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      findBillingUsers(query, controller.signal)
        .then((users) => { if (!controller.signal.aborted) setResponse({ query, users }) })
        .catch(() => {
          if (!controller.signal.aborted) setResponse({ query, error: true })
        })
    }, 180)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [expanded, query])

  function close() {
    setOpen(false)
    setActive(-1)
  }

  function select(user) {
    onChange(user.id)
    close()
  }

  function onKeyDown(event) {
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      close()
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!query) return
      event.preventDefault()
      setOpen(true)
      if (!users.length) return
      setActive((index) => event.key === 'ArrowDown'
        ? Math.min(index + 1, users.length - 1)
        : index <= 0 ? users.length - 1 : index - 1)
    } else if (event.key === 'Enter' && expanded && users[active]) {
      event.preventDefault()
      select(users[active])
    }
  }

  return (
    <div className="field billing-user-filter">
      <label htmlFor={id}>Created by</label>
      <div className="billing-user-input">
        <input id={id} ref={input} role="combobox" type="text" autoComplete="off" spellCheck={false}
          aria-autocomplete="list" aria-expanded={expanded} aria-controls={id + '-users'}
          aria-activedescendant={expanded && users[active] ? id + '-user-' + active : undefined}
          placeholder="Name or user ID" value={value} maxLength={80}
          onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onBlur={close} onKeyDown={onKeyDown}
          onChange={(event) => {
            setActive(-1)
            setOpen(true)
            onChange(event.target.value)
          }} />
        {value && (
          <button className="btn ghost" type="button" aria-label="Clear Created by filter" onClick={() => {
            onChange('')
            input.current?.focus()
            close()
          }}>Clear</button>
        )}
      </div>
      <div className="billing-user-popup" hidden={!expanded}>
        <ul id={id + '-users'} role="listbox" aria-label="Matching PLUS users">
          {users.map((user, index) => (
            <li key={user.id} id={id + '-user-' + index} role="option" aria-selected={active === index}
              onMouseDown={(event) => event.preventDefault()} onClick={() => select(user)}>
              <strong>{user.name || user.id}</strong>
              {user.name && user.name !== user.id && <small>{user.id}</small>}
            </li>
          ))}
        </ul>
        {expanded && !users.length && <p role="status">{!result ? 'Looking up users...'
          : result.error ? 'Suggestions unavailable. Enter a user ID to search.'
            : 'No matching users.'}</p>}
      </div>
    </div>
  )
}
