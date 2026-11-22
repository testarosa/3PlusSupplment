import { useState } from 'react'
import axios from 'axios'
import { PORTAL_API_PATH } from '../api/config'
import { getApInvoiceTotals } from '../apInvoiceDrafts'
import ApInvoicePreview from './ApInvoicePreview'
import DocumentDropzone from './DocumentDropzone'

const enabled = import.meta.env.DEV || (PORTAL_API_PATH && import.meta.env.VITE_CRDR_AI_ENABLED === 'true')
const normalize = (value) => typeof value === 'string' ? value.trim().toUpperCase() : ''

function reviewExtraction(draft, currencies) {
  const currency = normalize(draft?.currency)
  const printed = Number.isFinite(draft?.printedAmount) ? draft.printedAmount : null
  const printedLabel = draft?.printedAmountKind === 'invoice_total' ? 'invoice total' : 'balance'
  const calculated = draft && currencies.includes(currency) ? getApInvoiceTotals({ currency }, draft.lines) : null
  const totalsMatch = calculated && printed !== null
    ? Math.round(calculated.total * calculated.factor) === Math.round(printed * calculated.factor) : null
  const blocker = currency && !currencies.includes(currency)
    ? 'This currency is unavailable in the AP form. Enter the invoice manually.'
    : totalsMatch === false && draft?.printedAmountKind === 'invoice_total'
      ? 'The extracted charges do not match the printed invoice total. Check the invoice or enter charges manually.' : ''
  return { currency, printed, printedLabel, calculated, totalsMatch, blocker }
}

export default function ApInvoiceImport({ disabled, hasCharges, currencies, onExtract, onApply, onDefaultCodeChange, onBusyChange }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const draft = preview?.draft
  const review = reviewExtraction(draft, currencies)

  async function extract() {
    if (!enabled || disabled || !file || loading) return
    setError('')
    setPreview(null)
    setLoading(true)
    onBusyChange(true)
    try {
      const { data } = await axios.post(PORTAL_API_PATH + '/ap-invoice-ai/extract', file, {
        headers: { 'Content-Type': file.type },
        timeout: 100_000,
      })
      if (data?.isInvoice !== true || !Array.isArray(data.lines) || !data.lines.length ||
          data.lines.some((line) => !line?.description?.trim() || !Number.isFinite(line.amount))) {
        throw new Error('No invoice charges were returned.')
      }
      const draft = { ...data, extractionId: crypto.randomUUID() }
      const review = reviewExtraction(draft, currencies)
      const applied = onExtract(draft, review)
      setPreview({ draft, applied, defaultCode: '' })
    } catch (error) {
      setError(error.response?.data?.message || error.message || 'Could not extract the invoice.')
    } finally {
      setLoading(false)
      onBusyChange(false)
    }
  }

  return (
    <section className="ap-source-card ap-import" aria-labelledby="ap-import-heading">
      <h3 id="ap-import-heading">Import Vendor Invoice</h3>
      <p>{enabled ? 'Use 3Plus AI to extract charge lines from a vendor invoice.'
        : 'Document extraction is unavailable. Use Manual Entry to prepare charges.'}</p>
      {enabled && (
        <div className="ap-import-controls">
          <DocumentDropzone label="Vendor invoice file" file={file} disabled={disabled || loading}
            onChange={(selected, validationError = '') => {
              setFile(selected)
              setPreview(null)
              setError(validationError)
            }} />
          <button className="btn outline" type="button" disabled={disabled || !file || loading} onClick={extract}>
            {loading ? 'Extracting...' : 'Extract with 3Plus AI'}
          </button>
        </div>
      )}
      {loading && <p role="status">Reading the invoice...</p>}
      {error && <p className="inline-error" role="alert">{error}</p>}
      {draft && (
        <ApInvoicePreview key={draft.extractionId} draft={draft} review={review} applied={preview.applied} disabled={disabled}
          defaultCode={preview.defaultCode} onDefaultCodeChange={(defaultCode) => {
            if (preview.applied) onDefaultCodeChange(draft.extractionId, defaultCode)
            setPreview({ ...preview, defaultCode })
          }}
          hasCharges={hasCharges} onDismiss={() => setPreview(null)} onApply={() => {
            onApply(draft, review.currency, preview.defaultCode)
            setPreview({ ...preview, applied: true })
          }} />
      )}
    </section>
  )
}
