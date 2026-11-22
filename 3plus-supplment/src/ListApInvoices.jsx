import { useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { Link, useLocation } from 'react-router-dom'
import { BillingListHeader, BillingPager } from './components/BillingListControls'
import BillingUserFilter from './components/BillingUserFilter'
import { getApDraftKey, getApInvoiceTotals, readApDrafts } from './apInvoiceDrafts'
import { apApiError, formatApAmount, searchApInvoices } from './api/accountsPayable'
import { formatBillingDate } from './billingDates'
import { selectAuth, selectBillingUserId } from './store/slices/authSlice'
import './ListCrdr.css'
import './ListApInvoices.css'

const pageSize = 10
const emptyFilters = { invoiceNo: '', vendor: '', userName: '', startDate: '', endDate: '' }
const filterFields = [
  ['invoiceNo', 'AP invoice number', 'text', 'e.g. INV-1001'],
  ['vendor', 'Vendor name', 'text', 'e.g. Vendor name'],
  ['userName'],
  ['startDate', 'Post date from', 'date'],
  ['endDate', 'Post date to', 'date'],
]
const searchText = (value) => value.trim().toLowerCase()

function loadDrafts(key) {
  try {
    return { drafts: readApDrafts(key) }
  } catch {
    return { drafts: [], error: 'This browser could not read the saved AP invoice drafts.' }
  }
}

export default function ListApInvoices() {
  const user = useSelector((state) => selectAuth(state).user)
  const userId = useSelector(selectBillingUserId)
  const key = getApDraftKey(user)
  return <ApInvoiceList key={JSON.stringify([key, userId])} draftKey={key} userId={userId} />
}

function ApInvoiceList({ draftKey, userId }) {
  const { state } = useLocation()
  const [{ drafts, error: draftError }] = useState(() => loadDrafts(draftKey))
  const [showDrafts, setShowDrafts] = useState(false)
  const [filters, setFilters] = useState(() => ({ ...emptyFilters, userName: userId }))
  const [request, setRequest] = useState(() => ({ filters, page: 1 }))
  const [response, setResponse] = useState(null)
  const { filters: applied, page } = request
  const setPage = (nextPage) => setRequest({ ...request, page: nextPage })

  useEffect(() => {
    if (showDrafts) return
    const controller = new AbortController()
    searchApInvoices(request.filters, request.page, pageSize, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return
        if (request.page > 1 && request.page > data.totalPages) {
          setRequest({ ...request, page: Math.max(1, data.totalPages) })
          return
        }
        setResponse({ request, data })
      })
      .catch((error) => {
        if (!controller.signal.aborted) setResponse({ request, error: apApiError(error) })
      })
    return () => controller.abort()
  }, [showDrafts, request])

  const rows = drafts.filter(({ invoice }) =>
    searchText(invoice.invoiceNo).includes(searchText(applied.invoiceNo)) &&
    searchText(invoice.vendor).includes(searchText(applied.vendor)) &&
    (!applied.startDate || invoice.postDate >= applied.startDate) &&
    (!applied.endDate || invoice.postDate <= applied.endDate))
  const live = response?.request === request ? response : null
  const loading = !showDrafts && !live
  const error = showDrafts ? draftError : live?.error
  const totalCount = showDrafts ? rows.length : live?.data?.totalCount ?? 0
  const pageCount = showDrafts ? Math.ceil(totalCount / pageSize) : live?.data?.totalPages ?? 0
  const offset = (page - 1) * pageSize
  const shownRows = showDrafts
    ? rows.slice(offset, offset + pageSize).map(({ id, invoice, lines }) => ({
        id, ...invoice, ...getApInvoiceTotals(invoice, lines),
      }))
    : (live?.data?.items ?? []).map((item) => ({
        ...item, invoiceNo: item.invoiceNumber, vendor: item.payToCompanyName,
        total: item.invoiceAmount, displayTotal: formatApAmount(item.invoiceAmount, item.currency),
      }))

  function search(event) {
    event.preventDefault()
    setRequest({ filters, page: 1 })
  }

  function switchList(draftsOnly) {
    if (showDrafts === draftsOnly) return
    setShowDrafts(draftsOnly)
    setRequest({ ...request, page: 1 })
  }

  return (
    <div className="crdr-list-page ap-list-page billing-list-page">
      <BillingListHeader title="AP Invoices" description="Search and manage vendor invoices."
        createPath="/ap-invoices/create" createLabel="Create AP Invoice" />

      {state?.apInvoiceCreated && <p className="ap-list-status" role="status">
        AP invoice saved to PLUS (ID {state.apInvoiceCreated}).
      </p>}
      {state?.apInvoiceUpdated && <p className="ap-list-status" role="status">AP invoice updated.</p>}

      {(drafts.length > 0 || draftError) && <div className="billing-list-actions ap-list-switch" role="group" aria-label="Invoice source">
        <button className="btn outline" type="button" aria-pressed={!showDrafts} onClick={() => switchList(false)}>Billing records</button>
        <button className="btn outline" type="button" aria-pressed={showDrafts} onClick={() => switchList(true)}>Session drafts</button>
      </div>}

      <section className="panel filters-panel" aria-label="Search filters">
        <form className="filter-grid" data-creator-filter={!showDrafts || undefined} onSubmit={search} autoComplete="off">
          {filterFields.filter(([name]) => !showDrafts || name !== 'userName').map(([name, label, type, placeholder]) => name === 'userName' ? (
            <BillingUserFilter key={name} value={filters.userName}
              onChange={(userName) => setFilters((previous) => ({ ...previous, userName }))} />
          ) : (
            <label className="field" key={name}>
              <span>{label}</span>
              <input name={name} type={type} placeholder={placeholder} value={filters[name]}
                min={name === 'endDate' ? filters.startDate || undefined : undefined}
                onChange={(event) => setFilters({ ...filters, [name]: event.target.value })} />
            </label>
          ))}
          <button className="btn outline" type="submit">Search</button>
        </form>
      </section>

      <section className="panel table-panel" aria-labelledby="ap-results-heading">
        <header className="table-header billing-results-heading">
          <div>
            <h2 id="ap-results-heading">{showDrafts ? 'Session drafts' : 'Billing records'}</h2>
            <p aria-live="polite">
              {loading ? 'Loading billing records...' : !error &&
                (shownRows.length ? 'Showing ' + (offset + 1) + '-' + (offset + shownRows.length) + ' of ' + totalCount
                  : '0 results')}
            </p>
          </div>
          <BillingPager page={page} totalPages={pageCount} onPageChange={setPage} />
        </header>
        {error && <p className="error-row" role="alert">{error}</p>}
        {!loading && !error && !totalCount && (
          <p className="empty-row">{showDrafts
            ? !draftKey ? 'Drafts require an identifiable employee account.'
              : 'No existing drafts match these filters.'
            : 'No billing records match these filters.'}</p>
        )}
        {shownRows.length > 0 && (
          <div className="table-wrapper" role="region" aria-label={showDrafts ? 'AP invoice drafts' : 'AP billing records'} tabIndex={0}>
            <table className="templates-table billing-records" role="table">
              <thead role="rowgroup">
                <tr role="row">
                  <th scope="col">AP Invoice No.</th>
                  <th scope="col">Vendor</th>
                  <th scope="col">Post Date</th>
                  <th scope="col">Invoice Date</th>
                  <th scope="col">Due Date</th>
                  <th scope="col" className="ap-result-total">Total</th>
                  <th scope="col" className="ap-result-total">Actions</th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                {shownRows.map(({ id, invoiceNo, vendor, createdBy, postDate, invoiceDate, dueDate, total, displayTotal }) => (
                    <tr role="row" key={id}>
                      <td role="cell" data-label="Invoice">
                        {invoiceNo || '-'}
                        {createdBy?.trim() && <small className="billing-created-by">By {createdBy.trim()}</small>}
                      </td>
                      <td role="cell" data-label="Vendor">{vendor || '-'}</td>
                      <td role="cell" data-label="Post date">{formatBillingDate(postDate)}</td>
                      <td role="cell" data-label="Invoice date">{formatBillingDate(invoiceDate)}</td>
                      <td role="cell" data-label="Due date">{formatBillingDate(dueDate)}</td>
                      <td role="cell" data-label="Total" className={'ap-result-total' + (total < 0 ? ' ap-negative' : '')}>{displayTotal}</td>
                      <td role="cell" className="ap-result-total">
                        <Link className="btn outline" to={showDrafts ? '/ap-invoices/edit/' + encodeURIComponent(id) : '/ap-invoices/records/' + id + '/edit'}
                          aria-label={'Edit ' + invoiceNo}>Edit</Link>
                      </td>
                    </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
