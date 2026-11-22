import { useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getCrdrByRefNumber } from './api/crdrs'
import { apApiError, canSaveApEdits, createApInvoice, findApAirShipment, findApVendors } from './api/accountsPayable'
import ApInvoiceImport from './components/ApInvoiceImport'
import ApBillingCodeAutocomplete from './components/ApBillingCodeAutocomplete'
import ApVendorAutocomplete from './components/ApVendorAutocomplete'
import { selectAuth } from './store/slices/authSlice'
import { getApDraftKey, getApInvoiceTotals, readApDrafts, removeApDraft } from './apInvoiceDrafts'
import { chooseApShipment } from './apShipmentSelection'
import { chooseExtractedApVendor } from './apVendorSelection'
import { updateApExtractedBillingCodes } from './apChargeCodes'
import { getInvoiceTermDays, isBillingCalendarDate } from './billingDates'
import './CreateInvoice.css'
import './CreateApInvoice.css'

const currencies = ['USD', 'CAD', 'EUR', 'GBP', 'CNY', 'JPY', 'KRW']
const shipmentTables = {
  'house': 'T_OIHMAIN', 'master': 'T_OIMMAIN',
  'air-house': 'T_AIHMAIN', 'air-master': 'T_AIMMAIN',
}

function getApShipmentSource(shipment) {
  const [kind, id] = shipment?.id?.split(':') ?? []
  const sourceId = Number(id)
  if (!Object.hasOwn(shipmentTables, kind) || !Number.isSafeInteger(sourceId) || sourceId <= 0) return null
  return { sourceTable: shipmentTables[kind], sourceId }
}
const emptyInvoice = {
  vendor: '', payToCompanyId: null, invoiceNo: '', postDate: '', invoiceDate: '', dueDate: '',
  currency: 'USD', received: false,
}

const invoiceFields = [
  { name: 'invoiceNo', label: 'Vendor invoice number', required: true, maxLength: 25 },
  { name: 'postDate', label: 'Post date', type: 'date', required: true },
  { name: 'invoiceDate', label: 'Invoice date', type: 'date', required: true },
  { name: 'dueDate', label: 'Due date', type: 'date' },
]

function newLine(id = 'first') {
  return { id, billingCode: '', description: '', amount: '', glDate: todayForInput() }
}

function todayForInput() {
  const now = new Date()
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 10)
}

function withHeaderDefaults(invoice) {
  const today = todayForInput()
  return { ...invoice, postDate: invoice.postDate || today, invoiceDate: invoice.invoiceDate || today }
}

function loadDraft(key, id) {
  if (!id) return {}
  try {
    const draft = readApDrafts(key).find((entry) => entry.id === id)
    return draft ? { draft } : { error: 'This AP invoice draft is unavailable in this browser session.' }
  } catch {
    return { error: 'This browser could not read the saved AP invoice draft.' }
  }
}

function getShipments(payload) {
  const master = payload?.tOIMMainDto
  const houses = Array.isArray(payload?.tOIHMainDtos) ? payload.tOIHMainDtos : []

  function describe(house) {
    const bl = String(house ? house.fHblno ?? '' : master?.fMblno ?? '').trim()
    if (!bl) return null
    return {
      id: (house ? 'house:' : 'master:') + ((house ? house.fId : master?.fId) ?? '') + ':' + bl,
      bl,
      details: { masterBl: master?.fMblno, houseBl: house?.fHblno },
    }
  }

  return [...houses.map(describe), describe(null)].filter(Boolean)
}

function getAirShipments(payload) {
  const master = payload?.master
  if (!master) return []
  const houses = Array.isArray(payload.houses) ? payload.houses : []
  function describe(house) {
    const bl = String(house ? house.houseAirWaybillNumber ?? '' : master.masterAirWaybillNumber ?? '').trim()
    if (!bl) return null
    return {
      id: (house ? 'air-house:' : 'air-master:') + ((house ? house.id : master.id) ?? '') + ':' + bl,
      bl,
      details: { masterBl: master.masterAirWaybillNumber, houseBl: house?.houseAirWaybillNumber },
    }
  }
  return [...houses.map(describe), describe(null)].filter(Boolean)
}

export default function CreateApInvoice() {
  const { id } = useParams()
  const user = useSelector((state) => selectAuth(state).user)
  const draftKey = getApDraftKey(user)
  return <ApInvoiceForm key={JSON.stringify([draftKey, id])} draftKey={draftKey} draftId={id} />
}

function ApInvoiceForm({ draftKey, draftId }) {
  const navigate = useNavigate()
  const [{ draft: initial, error: draftError }] = useState(() => loadDraft(draftKey, draftId))
  const [reference, setReference] = useState(initial?.lookup?.reference ?? '')
  const [lookup, setLookup] = useState(() => initial?.lookup
    ? { ...initial.lookup, reference: initial.lookup.reference.trim().toUpperCase(), options: [initial.lookup.shipment] } : null)
  const [invoice, setInvoice] = useState(initial?.invoice ?? emptyInvoice)
  const [lines, setLines] = useState(() => initial?.lines ?? [])
  const [loading, setLoading] = useState(false)
  const [extractionLoading, setExtractionLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [lookupError, setLookupError] = useState('')
  const [vendorNotice, setVendorNotice] = useState('')
  const [chargeSource, setChargeSource] = useState(initial?.lookup?.shipment ? initial.chargeSource ?? 'Saved draft' : '')
  const [feedback, setFeedback] = useState('')
  const searchVersion = useRef(0)
  const vendorSearchVersion = useRef(0)
  const activeLookup = lookup?.reference === reference.trim().toUpperCase() ? lookup : null
  const shipment = activeLookup?.shipment
  const shipments = activeLookup?.options ?? []
  const isPrepared = Boolean(chargeSource)
  const missingBillingCodes = chargeSource === 'Imported vendor invoice' && lines.some((line) => !line.billingCode.trim())
  const { factor, total, displayTotal } = getApInvoiceTotals(invoice, lines)
  const terms = getInvoiceTermDays(invoice.invoiceDate, invoice.dueDate)
  const shipmentSource = getApShipmentSource(shipment)
  const complete = isPrepared && invoice.vendor.trim() && invoice.invoiceNo.trim() &&
    invoice.invoiceDate && invoice.postDate && lines.length > 0 && lines.every((line) =>
      line.billingCode.trim() && line.description.trim() && line.amount !== '' && Number.isFinite(Number(line.amount)))
  const canCreate = canSaveApEdits && !loading && !extractionLoading && complete && shipmentSource && invoice.payToCompanyId > 0 &&
    lines.every((line) => line.glDate) && total >= 0 && (terms ?? 0) >= 0

  function findShipment(event) {
    event.preventDefault()
    if (!loading && !saving) void lookupShipment(reference)
  }

  async function lookupShipment(value, extracted) {
    const query = value.trim().toUpperCase()
    if (!query) {
      setLookupError('Enter a shipment reference.')
      return
    }
    const version = ++searchVersion.current
    setReference(query)
    setLoading(true)
    setLookupError('')
    setFeedback('')
    try {
      let options
      if (/^AI-?\d/i.test(query)) {
        options = getAirShipments(await findApAirShipment(query))
      } else {
        const response = await getCrdrByRefNumber(query)
        options = getShipments(response?.data ?? response)
      }
      if (version !== searchVersion.current) return
      const previousId = activeLookup?.reference === query ? activeLookup.shipment?.id : null
      const selected = chooseApShipment(options, extracted, previousId)
      setLookup(options.length ? { reference: query, shipment: selected, options, automatic: Boolean(extracted) } : null)
      if (!options.length) setLookupError('Shipment not found for this reference. Check the reference number and search again.')
    } catch (error) {
      if (version !== searchVersion.current) return
      setLookup(null)
      setLookupError(error.response?.status === 404
        ? 'Shipment not found for this reference. Check the reference number and search again.'
        : 'Could not look up the shipment. Check the reference and try again.')
    } finally {
      if (version === searchVersion.current) setLoading(false)
    }
  }

  function lookupExtractedShipment(extracted) {
    const extractedReference = typeof extracted.referenceNumber === 'string' ? extracted.referenceNumber.trim() : ''
    if (extractedReference) {
      void lookupShipment(extractedReference, extracted)
      return
    }
    setLookup((previous) => previous?.automatic ? null : previous)
    setLookupError('No shipment reference was found on the invoice. Enter a reference and search, or confirm a manually selected shipment.')
  }

  function handleExtraction(extracted, review) {
    if (isPrepared) return false
    if (review.blocker) {
      lookupExtractedShipment(extracted)
      return false
    }
    applyExtraction(extracted, review.currency)
    return true
  }

  async function lookupExtractedVendor(name) {
    const version = ++vendorSearchVersion.current
    if (!name) {
      setVendorNotice('No vendor was found on the invoice. Search for a PLUS vendor.')
      return
    }
    setVendorNotice('Looking up the extracted vendor in PLUS...')
    try {
      const matches = await findApVendors(name.replace(/[.,]+$/, '').trim() || name)
      if (version !== vendorSearchVersion.current) return
      const match = chooseExtractedApVendor(matches, name)
      if (!match) {
        setVendorNotice('No matching PLUS vendor code was found. Search by name or ID and select the vendor.')
        return
      }
      setInvoice((previous) => ({ ...previous, vendor: match.name, payToCompanyId: match.id }))
      setVendorNotice('')
    } catch {
      if (version === vendorSearchVersion.current) {
        setVendorNotice('Could not look up the vendor code. Search by name or ID to try again.')
      }
    }
  }

  function updateInvoice(name, value) {
    setInvoice((previous) => ({ ...previous, [name]: value }))
    setFeedback('')
  }

  function updateLine(id, name, value) {
    setLines((previous) => previous.map((line) => line.id === id
      ? { ...line, [name]: value, hasDefaultBillingCode: name === 'billingCode' ? false : line.hasDefaultBillingCode }
      : line))
    setFeedback('')
  }

  function updateExtractionDefaultCode(extractionId, code) {
    setLines((previous) => updateApExtractedBillingCodes(previous, extractionId, code))
    setFeedback('')
  }

  function enterManually() {
    if (saving || extractionLoading || isPrepared) return
    setInvoice((previous) => withHeaderDefaults(previous))
    setLines([newLine()])
    setChargeSource('Manual entry')
    setFeedback('')
  }

  function clearCharges() {
    setChargeSource('')
    setLines([])
    setFeedback('')
  }

  function applyExtraction(draft, currency, defaultCode = '') {
    if (saving) return
    const vendor = typeof draft.vendorName === 'string' ? draft.vendorName.trim() : ''
    setInvoice({
      ...emptyInvoice,
      vendor,
      invoiceNo: draft.invoiceNumber?.trim() || '',
      postDate: todayForInput(),
      invoiceDate: isBillingCalendarDate(draft.invoiceDate) ? draft.invoiceDate : '',
      dueDate: isBillingCalendarDate(draft.dueDate) ? draft.dueDate : '',
      currency: currency || emptyInvoice.currency,
    })
    setLines(draft.lines.map(({ billingCode, description, amount }) => ({
      ...newLine(crypto.randomUUID()),
      extractionId: draft.extractionId,
      extractedBillingCode: billingCode ?? '',
      hasDefaultBillingCode: Boolean(defaultCode),
      billingCode: defaultCode || billingCode || '',
      description,
      amount: String(amount),
    })))
    setChargeSource('Imported vendor invoice')
    setFeedback('')
    lookupExtractedShipment(draft)
    void lookupExtractedVendor(vendor)
  }

  async function saveInvoice(event) {
    event.preventDefault()
    if (!canCreate || saving) return
    setSaving(true)
    setFeedback('')
    try {
      const id = await createApInvoice({
        ...shipmentSource, payToCompanyId: invoice.payToCompanyId, invoiceNumber: invoice.invoiceNo.trim(),
        invoiceDate: invoice.invoiceDate, postDate: invoice.postDate, dueDate: invoice.dueDate || null,
        currency: invoice.currency, terms: terms ?? 0, isInvoiced: invoice.received,
        lines: lines.map((line) => ({
          billingCode: line.billingCode.trim(), description: line.description.trim(),
          amount: Number(line.amount), postDate: line.glDate,
        })),
      })
      try { removeApDraft(draftKey, draftId) } catch { /* The saved PLUS invoice is authoritative. */ }
      navigate('/ap-invoices', { replace: true, state: { apInvoiceCreated: id } })
    } catch (error) {
      setFeedback(error.response ? apApiError(error) :
        'PLUS did not confirm the save. Check the AP invoice list before trying again.')
    } finally {
      setSaving(false)
    }
  }

  if (draftError) {
    return <div className="portal-message"><p role="alert">{draftError}</p><Link to="/ap-invoices">Back to AP invoices</Link></div>
  }

  return (
    <div className="create-invoice-page ap-invoice-page">
      <header className="panel ap-page-heading">
        <h1>{draftId ? 'Finish AP Invoice Draft' : 'AP Invoice'}</h1>
      </header>

      <section className="panel" aria-labelledby="ap-ai-heading">
        <header className="panel-heading"><div>
          <h2 id="ap-ai-heading">1. 3Plus AI Process</h2>
          <p>Upload a vendor invoice to extract its reference and charges, or skip to Shipment Lookup.</p>
        </div></header>
        <ApInvoiceImport disabled={saving} hasCharges={isPrepared} currencies={currencies} onExtract={handleExtraction}
          onApply={applyExtraction} onDefaultCodeChange={updateExtractionDefaultCode} onBusyChange={setExtractionLoading} />
      </section>

      <section className="panel" aria-labelledby="ap-shipment-heading">
        <header className="panel-heading"><div>
          <h2 id="ap-shipment-heading">2. Shipment Lookup</h2>
          <p>We search the extracted reference automatically. You can also enter a reference and search below.</p>
        </div></header>
        <form className="ap-lookup" onSubmit={findShipment} autoComplete="off">
          <div className="field">
            <label htmlFor="ap-reference">Reference number</label>
            <div className="ref-input-row">
              <input id="ap-reference" value={reference} disabled={loading || saving} required
                onChange={(event) => {
                  setReference(event.target.value)
                  setLookupError('')
                  setFeedback('')
                }} />
              <button className="btn primary" type="submit" disabled={loading || saving}>
                {loading ? 'Searching...' : 'Find shipment'}
              </button>
            </div>
          </div>
          <label className="field">
            <span>Bill of lading</span>
            <select value={shipment?.id ?? ''} disabled={!shipments.length || loading || saving} onChange={(event) => {
              const selected = shipments.find((option) => option.id === event.target.value)
              setLookup({ ...activeLookup, shipment: selected ?? null, automatic: false })
              setFeedback('')
            }}>
              <option value="">{shipments.length ? 'Select a bill of lading' : 'Look up a reference first'}</option>
              {shipments.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.bl} ({option.details.houseBl ? 'House' : 'Master'})
                </option>
              ))}
            </select>
          </label>
        </form>
        {lookupError && <p className="inline-error" role="alert">{lookupError}</p>}
        {!loading && shipments.length > 0 && <p className="ap-step-note" role="status">
          {!shipment ? 'Shipment found. Select the bill of lading for this invoice.'
            : activeLookup.automatic ? 'Shipment and bill of lading filled from the extracted reference.'
              : 'Shipment and bill of lading selected.'}
        </p>}
      </section>

      <form className="ap-invoice-form ap-review-form" onSubmit={saveInvoice}>
          <fieldset className="panel line-panel" aria-labelledby="ap-review-items" disabled={saving}>
            <div className="panel-heading">
              <div>
                <h2 id="ap-review-items">3. Manual Entry</h2>
                <p>{isPrepared ? 'Review, correct, or add charges before creating the invoice.'
                  : 'Apply extracted charges or start with a blank line.'}</p>
              </div>
              {isPrepared && <div className="ap-step-actions">
                <button className="btn outline" type="button" onClick={clearCharges}>Clear Charges</button>
                <button className="btn outline" type="button" onClick={() => {
                  const line = newLine(crypto.randomUUID())
                  setLines((previous) => [...previous, line])
                  setFeedback('')
                }}>+ Add line</button>
              </div>}
            </div>
            {isPrepared ? <>
            <p className="ap-step-note" role="status">{chargeSource}</p>
            {missingBillingCodes && <p className="ap-step-note" role="status">
              Some charges have no billing code. Choose a code for each line before creating the invoice.
            </p>}
            <div className="line-table-wrapper" tabIndex={0} role="region" aria-label="Charge lines">
              <table className="line-table">
                <thead><tr>
                  <th scope="col">Billing code</th><th scope="col">Item description</th>
                  <th scope="col">Amount</th><th scope="col">G/L date</th><th scope="col">Actions</th>
                </tr></thead>
                <tbody>
                  {lines.map((line, index) => (
                    <tr key={line.id}>
                      <td><ApBillingCodeAutocomplete label={'Billing code, line ' + (index + 1)}
                        value={line.billingCode} required onChange={(value) => updateLine(line.id, 'billingCode', value)}
                        onSelect={({ code, description }) => {
                          updateLine(line.id, 'billingCode', code)
                          if (!line.description.trim()) updateLine(line.id, 'description', description)
                        }} /></td>
                      <td><input aria-label={'Item description, line ' + (index + 1)} value={line.description} required
                        maxLength={100}
                        onChange={(event) => updateLine(line.id, 'description', event.target.value)} /></td>
                      <td><input aria-label={'Amount, line ' + (index + 1)} value={line.amount} required
                        type="number" step={1 / factor}
                        onChange={(event) => updateLine(line.id, 'amount', event.target.value)} /></td>
                      <td><input aria-label={'G/L date, line ' + (index + 1)} value={line.glDate} type="date"
                        onChange={(event) => updateLine(line.id, 'glDate', event.target.value)} /></td>
                      <td><button className="btn ghost danger" type="button" disabled={lines.length === 1}
                        aria-label={'Remove line ' + (index + 1)} onClick={() => {
                          setLines((previous) => previous.filter((item) => item.id !== line.id))
                          setFeedback('')
                        }}>Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="line-footer">
              <div className="subtotal-card"><p>Total</p><strong>{displayTotal}</strong></div>
            </div>
            </> : <div><button className="btn outline" type="button" disabled={extractionLoading}
              onClick={enterManually}>Enter Manually</button></div>}
          </fieldset>

          <fieldset className="panel" aria-labelledby="ap-details-heading" disabled={saving}>
            <header className="panel-heading">
              <div>
                <h2 id="ap-details-heading">4. Create AP Invoice</h2>
                <p>{isPrepared ? 'Review the vendor, invoice number, dates, and currency.'
                  : 'Apply extracted charges or enter them manually to continue.'}</p>
              </div>
              {isPrepared && <button className="btn outline" type="button" onClick={() => {
                setInvoice(withHeaderDefaults)
                setFeedback('')
              }}>Fill Header Defaults</button>}
            </header>
            {isPrepared && <>
            <div className="header-grid">
              <ApVendorAutocomplete value={invoice.vendor} onChange={(vendor, payToCompanyId) => {
                vendorSearchVersion.current += 1
                setInvoice((previous) => ({ ...previous, vendor, payToCompanyId }))
                setVendorNotice('')
                setFeedback('')
              }} notice={vendorNotice} />
              {invoiceFields.map(({ name, label, type = 'text', ...attributes }) => (
                <label className="field" key={name}>
                  <span>{label}</span>
                  <input type={type} value={invoice[name]} {...attributes}
                    min={name === 'dueDate' ? invoice.invoiceDate || undefined : attributes.min}
                    onChange={(event) => updateInvoice(name, event.target.value)} />
                </label>
              ))}
              <label className="field">
                <span>Terms (days)</span>
                <input type="number" readOnly value={terms ?? ''} />
              </label>
              <label className="field">
                <span>Currency</span>
                <select value={invoice.currency} onChange={(event) => updateInvoice('currency', event.target.value)}>
                  {currencies.map((currency) => <option key={currency}>{currency}</option>)}
                </select>
              </label>
              <label className="ap-received">
                <input type="checkbox" checked={invoice.received}
                  onChange={(event) => updateInvoice('received', event.target.checked)} />
                Invoice received
              </label>
            </div>
            <p className="ap-review-note">{!canSaveApEdits ? 'Creating a PLUS invoice requires the authenticated portal.'
              : !shipmentSource ? 'Complete Shipment Lookup and select a bill of lading before creating the invoice.'
                : !invoice.payToCompanyId ? 'Select a PLUS vendor from the suggestions to create the invoice.'
                  : 'Create saves the invoice and charges to PLUS.'}</p>
            </>}
            <div className="action-row">
              <button className="btn ghost" type="button" disabled={saving} onClick={() => navigate('/ap-invoices')}>Cancel</button>
              {isPrepared && <button className="btn primary" type="submit" disabled={!canCreate || saving}>
                {saving ? 'Saving to PLUS...' : 'Create AP Invoice'}
              </button>}
            </div>
            {feedback && <p className="inline-error" role="alert">{feedback}</p>}
          </fieldset>
        </form>
    </div>
  )
}
