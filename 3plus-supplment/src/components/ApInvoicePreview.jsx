import { useId, useState } from 'react'
import { formatApAmount } from '../api/accountsPayable'
import { formatBillingDate } from '../billingDates'
import ApBillingCodeAutocomplete from './ApBillingCodeAutocomplete'
import BillingDocumentPreview from './BillingDocumentPreview'

export default function ApInvoicePreview({
  draft, review, applied, disabled, hasCharges, defaultCode, onDefaultCodeChange, onApply, onDismiss,
}) {
  const codeId = useId()
  const [query, setQuery] = useState(defaultCode)
  const { currency, printed, printedLabel, calculated, totalsMatch, blocker } = review
  const pages = draft.invoicePages ?? []
  const missingCodes = defaultCode ? 0 : draft.lines.filter((line) => !line.billingCode?.trim()).length
  const fields = [
    ['Invoice date', draft.invoiceDate && formatBillingDate(draft.invoiceDate)],
    ['Due date', draft.dueDate && formatBillingDate(draft.dueDate)],
    ['Currency', currency],
    ['Shipment reference', draft.referenceNumber],
    ['Master B/L', draft.mblNumber],
    ['House B/L', draft.hblNumber],
  ]
  const amountFormatter = new Intl.NumberFormat('en-US', /^[A-Z]{3}$/.test(currency)
    ? { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }
    : { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return <BillingDocumentPreview
    title={draft.vendorName || 'Vendor not found'}
    detail={<>Invoice <strong>{draft.invoiceNumber || 'number not found'}</strong>
      {pages.length > 0 && <> <span aria-hidden="true">/</span> Page{pages.length > 1 ? 's' : ''} {pages.join(', ')}</>}
    </>}
    fields={fields}
    columns={[
      { label: 'Description' },
      { label: 'Billing code' },
      { label: currency ? 'Amount (' + currency + ')' : 'Amount', numeric: true },
    ]}
    rows={draft.lines.map((line) => [
      line.description,
      defaultCode || line.billingCode?.trim() || <span className="billing-preview-missing">Not found</span>,
      amountFormatter.format(line.amount),
    ])}
    chargeBadge={missingCodes > 0 ? missingCodes + (missingCodes === 1 ? ' code to assign' : ' codes to assign') : null}
    chargeControls={<div className="billing-preview-default-code">
      <label htmlFor={codeId}>Default billing code</label>
      <div className="billing-preview-code-controls">
        <ApBillingCodeAutocomplete inputId={codeId} describedBy={codeId + '-hint'} value={query} disabled={disabled}
          onChange={setQuery} onBlur={() => setQuery(defaultCode)} onSelect={({ code }) => {
            setQuery(code)
            onDefaultCodeChange(code)
          }} />
        {defaultCode && <button className="btn ghost" type="button" disabled={disabled} onClick={() => {
          setQuery('')
          onDefaultCodeChange('')
        }}>Clear default</button>}
      </div>
      <p id={codeId + '-hint'}>Select a PLUS billing code to apply it to every extracted charge.</p>
    </div>}
    totals={[
      ...(printed !== null ? [['Printed ' + printedLabel, formatApAmount(printed, currency)]] : []),
      ...(calculated ? [['Extracted total', calculated.displayTotal]] : []),
    ]}
    checks={<>
      {totalsMatch === true && <span className="billing-preview-badge" data-tone="success">
        Matches printed {printedLabel}
      </span>}
      {totalsMatch === false && draft.printedAmountKind === 'balance' && (
        <p className="billing-preview-warning" role="status">Charges differ from the printed balance. Check for payments or prior balances before applying.</p>
      )}
    </>}
    applied={applied} blocker={blocker} disabled={disabled} hasCharges={hasCharges} onApply={onApply} onDismiss={onDismiss}
  />
}
