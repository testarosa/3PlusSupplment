import { Link } from 'react-router-dom'

export function BillingListHeader({ title, description, createPath, createLabel, children }) {
  return (
    <header className="billing-list-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="billing-list-actions">
        {children}
        <Link className="btn primary" to={createPath}>{createLabel}</Link>
      </div>
    </header>
  )
}

export function BillingPager({ page, totalPages, onPageChange }) {
  if (totalPages < 2) return null
  return (
    <nav className="billing-pager" aria-label="Results pages">
      <button type="button" className="btn outline" onClick={() => onPageChange(1)} disabled={page === 1}>First</button>
      <button type="button" className="btn outline" onClick={() => onPageChange(page - 1)} disabled={page === 1}>Previous</button>
      <span aria-live="polite">Page {page} of {totalPages}</span>
      <button type="button" className="btn outline" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>Next</button>
      <button type="button" className="btn outline" onClick={() => onPageChange(totalPages)} disabled={page >= totalPages}>Last</button>
    </nav>
  )
}
