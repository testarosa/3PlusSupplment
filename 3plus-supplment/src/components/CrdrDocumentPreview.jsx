import { formatBillingDate } from '../billingDates'
import BillingDocumentPreview from './BillingDocumentPreview'

export default function CrdrDocumentPreview({ draft, ...controls }) {
  const currency = draft.currency?.trim().toUpperCase()
  const formatter = new Intl.NumberFormat('en-US', /^[A-Z]{3}$/.test(currency ?? '')
    ? { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }
    : { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const { debit, credit } = draft.lines.reduce((amounts, line) => ({
    debit: amounts.debit + line.debit,
    credit: amounts.credit + line.credit,
  }), { debit: 0, credit: 0 })
  const noteType = { credit: 'Credit note', debit: 'Debit note', mixed: 'Credit/debit note' }[draft.noteType] ?? 'Note'

  return <BillingDocumentPreview
    {...controls}
    title={draft.agentName || 'Agent not found'}
    detail={<>{noteType} <strong>{draft.noteNumber || 'number not found'}</strong></>}
    fields={[
      ['Invoice date', draft.invoiceDate && formatBillingDate(draft.invoiceDate)],
      ['Due date', draft.dueDate && formatBillingDate(draft.dueDate)],
      ['Currency', currency],
      ['Shipment reference', draft.referenceNumber],
      ['House B/L or AWB', draft.hblNumber],
      ['Note type', noteType],
    ]}
    columns={[{ label: 'Description' }, { label: 'Debit', numeric: true }, { label: 'Credit', numeric: true }]}
    rows={draft.lines.map((line) => [
      line.description,
      formatter.format(line.debit),
      formatter.format(line.credit),
    ])}
    totals={[
      ['Debit total', formatter.format(debit)],
      ['Credit total', formatter.format(credit)],
      ['Net total', formatter.format(debit - credit)],
    ]}
    checks={!currency && <p>Verify that the note is in USD before creating the invoice.</p>}
  />
}
