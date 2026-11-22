import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apApiError, canSaveApEdits, formatApAmount, getApInvoiceEdit, updateApInvoice } from './api/accountsPayable'
import ApVendorAutocomplete from './components/ApVendorAutocomplete'
import ApBillingCodeAutocomplete from './components/ApBillingCodeAutocomplete'
import { getInvoiceTermDays } from './billingDates'
import './CreateInvoice.css'
import './CreateApInvoice.css'

const dateInput = (value) => value?.slice(0, 10) || ''
const listPath = '/ap-invoices'
const headerFields = [
  ['invoiceNumber', 'Vendor invoice number', 'text', 25],
  ['description', 'Description', 'text', 100],
  ['invoiceDate', 'Invoice date', 'date'],
  ['postDate', 'Post date', 'date'],
  ['dueDate', 'Due date', 'date'],
]

export default function EditApInvoice() {
  const { id } = useParams()
  return <InvoiceEditor key={id} id={id} />
}

function InvoiceEditor({ id }) {
  const [result, setResult] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    getApInvoiceEdit(id, controller.signal)
      .then((snapshot) => { if (!controller.signal.aborted) setResult({ snapshot }) })
      .catch((error) => { if (!controller.signal.aborted) setResult({ error: apApiError(error) }) })
    return () => controller.abort()
  }, [id])

  const snapshot = result?.snapshot
  return (
    <div className="create-invoice-page ap-invoice-page">
      <header className="panel ap-page-heading">
        <h1>Edit AP Invoice</h1>
        <Link to={listPath}>Back to AP invoices</Link>
      </header>
      {!result && <p role="status">Loading invoice...</p>}
      {(result?.error || snapshot?.lockedReason) && (
        <p className="inline-error" role="alert">{result?.error || snapshot.lockedReason}</p>
      )}
      {snapshot && !snapshot.lockedReason && <EditForm snapshot={snapshot} />}
    </div>
  )
}

function EditForm({ snapshot }) {
  const { invoice, revision } = snapshot
  const navigate = useNavigate()
  const [header, setHeader] = useState({
    invoiceNumber: invoice.invoiceNumber ?? '', description: invoice.description ?? '',
    invoiceDate: dateInput(invoice.invoiceDate), postDate: dateInput(invoice.postDate),
    dueDate: dateInput(invoice.dueDate), isInvoiced: invoice.isInvoiced,
  })
  const [lines, setLines] = useState(() => snapshot.lines.map((line) => ({
    id: line.id, billingCode: line.billingCode ?? '', description: line.description ?? '',
    amount: String(line.amount), postDate: dateInput(line.postDate),
  })))
  const [vendor, setVendor] = useState({
    name: invoice.payToCompanyName || '', id: invoice.payToCompanyId ?? 0,
  })
  const vendorUnselected = vendor.id === null
  const terms = getInvoiceTermDays(header.invoiceDate, header.dueDate)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [stale, setStale] = useState(false)
  const originalAmounts = new Map(snapshot.lines.map((line) => [line.id, line]))
  const amountChange = lines.reduce((sum, line) => sum + (Number(line.amount) - originalAmounts.get(line.id).amount), 0)
  const total = formatApAmount(invoice.invoiceAmount + amountChange, invoice.currency)

  function updateLine(id, name, value) {
    setLines((previous) => previous.map((line) => line.id === id ? { ...line, [name]: value } : line))
  }

  async function save(event) {
    event.preventDefault()
    if (saving || stale || !canSaveApEdits || vendorUnselected) return
    setError('')
    setSaving(true)
    try {
      await updateApInvoice(invoice.id, {
        ...header, revision, terms: terms ?? invoice.terms ?? 0,
        payToCompanyId: vendor.id > 0 && vendor.id !== invoice.payToCompanyId ? vendor.id : undefined,
        invoiceDate: header.invoiceDate || null, postDate: header.postDate || null, dueDate: header.dueDate || null,
        lines: lines.map((line) => ({ ...line, amount: Number(line.amount), postDate: line.postDate || null })),
      })
      navigate(listPath, { replace: true, state: { apInvoiceUpdated: true } })
    } catch (error) {
      if (error.response?.status === 409) setStale(true)
      setError(apApiError(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="ap-invoice-form" onSubmit={save}>
      <fieldset className="panel" disabled={saving} aria-label="Invoice details">
        <header className="panel-heading"><h2>Invoice details</h2></header>
        <div className="header-grid">
          <ApVendorAutocomplete value={vendor.name} onChange={(name, id) => setVendor({ name, id })}
            requireSelection invalid={vendorUnselected} disabled={saving} />
          <label className="field"><span>Currency</span><input readOnly value={invoice.currency || ''} /></label>
          {headerFields.map(([name, label, type, limit]) => (
            <label className="field" key={name}>
              <span>{label}</span>
              <input type={type} maxLength={limit} value={header[name]} required={name === 'invoiceNumber'}
                min={name === 'dueDate' ? header.invoiceDate || undefined : undefined}
                onChange={(event) => setHeader({ ...header, [name]: event.target.value })} />
            </label>
          ))}
          <label className="field"><span>Terms (days)</span><input type="number" readOnly value={terms ?? ''} /></label>
          <label className="ap-received">
            <input type="checkbox" checked={header.isInvoiced}
              onChange={(event) => setHeader({ ...header, isInvoiced: event.target.checked })} />
            Invoice received
          </label>
        </div>
      </fieldset>
      <fieldset className="panel line-panel" disabled={saving} aria-label="Invoice charges">
        <header className="panel-heading"><h2>Charges</h2></header>
        {lines.length ? (
          <div className="line-table-wrapper" role="region" aria-label="Editable charge lines" tabIndex={0}>
            <table className="line-table">
              <thead><tr>
                <th scope="col">Billing code</th><th scope="col">Description</th>
                <th scope="col">Amount</th><th scope="col">G/L date</th>
              </tr></thead>
              <tbody>{lines.map((line, index) => {
                const number = index + 1
                const fixedAmount = Boolean(originalAmounts.get(line.id).expenseAmount)
                return (
                  <tr key={line.id}>
                    <td><ApBillingCodeAutocomplete label={'Billing code, line ' + number} value={line.billingCode}
                      disabled={saving} onChange={(value) => updateLine(line.id, 'billingCode', value)}
                      onSelect={({ code, description }) => {
                        updateLine(line.id, 'billingCode', code)
                        if (!line.description.trim()) updateLine(line.id, 'description', description)
                      }} /></td>
                    <td><input aria-label={'Description, line ' + number} value={line.description} maxLength={100}
                      onChange={(event) => updateLine(line.id, 'description', event.target.value)} /></td>
                    <td><input aria-label={'Amount, line ' + number} value={line.amount} type="number" step="any" required
                      readOnly={fixedAmount} title={fixedAmount ? 'This charge has a linked expense amount.' : undefined}
                      onChange={(event) => updateLine(line.id, 'amount', event.target.value)} /></td>
                    <td><input aria-label={'G/L date, line ' + number} value={line.postDate} type="date"
                      onChange={(event) => updateLine(line.id, 'postDate', event.target.value)} /></td>
                  </tr>
                )
              })}</tbody>
            </table>
          </div>
        ) : <p>No charge lines.</p>}
        <div className="line-footer">
          <div className="subtotal-card"><p>Invoice total</p><strong>{total}</strong></div>
        </div>
      </fieldset>
      <div className="panel ap-draft-actions">
        {!canSaveApEdits && <p>Saving live changes requires the authenticated billing portal.</p>}
        <Link className="btn ghost" to={listPath}>Cancel</Link>
        <button className="btn primary" type="submit" disabled={saving || stale || !canSaveApEdits || vendorUnselected}>
          {saving ? 'Saving...' : 'Save changes'}
        </button>
        {error && <p className="inline-error" role="alert">{error}</p>}
      </div>
    </form>
  )
}
