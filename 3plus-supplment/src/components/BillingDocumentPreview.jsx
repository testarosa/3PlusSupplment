import { useId } from 'react'
import './BillingDocumentPreview.css'

export default function BillingDocumentPreview({
  title, detail, fields, columns, rows, chargeBadge, chargeControls, totals = [], checks,
  applied, blocker, disabled, applyDisabled, hasCharges, onApply, onDismiss,
}) {
  const heading = useId()
  const align = (index) => columns[index].numeric ? 'billing-preview-money' : undefined

  return (
    <section className="billing-document-preview" aria-labelledby={heading}>
      <header className="billing-preview-header">
        <div>
          <div className="billing-preview-kicker">3Plus AI extraction preview</div>
          <h4 id={heading}>{title}</h4>
          <p>{detail}</p>
        </div>
        <span className="billing-preview-badge" data-tone={blocker ? 'warning' : applied ? 'success' : undefined}>
          {blocker ? 'Review required' : applied ? 'Applied to form' : 'Ready to review'}
        </span>
      </header>

      <dl className="billing-preview-facts">
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd data-missing={!value || undefined}>{value || 'Not found'}</dd>
          </div>
        ))}
      </dl>

      <div className="billing-preview-charges">
        <div className="billing-preview-charge-heading">
          <h5>Extracted charges <span>{rows.length}</span></h5>
          {chargeBadge && <span className="billing-preview-badge" data-tone="warning">{chargeBadge}</span>}
        </div>
        {chargeControls}
        <table aria-label="Extracted charges">
          <thead><tr>
            {columns.map(({ label }, index) => <th key={label} scope="col" className={align(index)}>{label}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((cells, rowIndex) => (
              <tr key={rowIndex}>
                {cells.map((cell, index) => <td key={columns[index].label} className={align(index)}>{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="billing-preview-reconcile">
        <div className="billing-preview-check">
          {checks}
          {blocker && <p className="billing-preview-warning" role="alert">{blocker}</p>}
          {applied && <p role="status">Extracted details and charges are in the form below.</p>}
        </div>
        {totals.length > 0 && <dl className="billing-preview-totals">
          {totals.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>}
      </div>

      <footer className="billing-preview-actions">
        <button className="btn ghost" type="button" disabled={disabled} onClick={onDismiss}>
          {applied ? 'Hide preview' : 'Discard extraction'}
        </button>
        {!applied && <button className="btn primary" type="button"
          disabled={disabled || applyDisabled || Boolean(blocker)} onClick={onApply}>
          {hasCharges ? 'Apply details and replace charges' : 'Apply extracted details and charges'}
        </button>}
      </footer>
    </section>
  )
}
