import { useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { BillingListHeader, BillingPager } from './components/BillingListControls'
import BillingUserFilter from './components/BillingUserFilter'
import { formatBillingDate } from './billingDates'
import './ListInvoice.css'
import { deleteInvoice, searchInvoices, supportsInvoiceUserSearch } from './api/invoices'
import { formatApAmount } from './api/accountsPayable'
import { selectBillingUserId } from './store/slices/authSlice'

const PAGE_SIZE = 10

const today = new Date();
const isoToday = today.toISOString().split('T')[0]; 

const sevenDaysAgo = new Date(today);
sevenDaysAgo.setDate(today.getDate() - 7);
const isoSevenDaysAgo = sevenDaysAgo.toISOString().split('T')[0];

const initialFilters = {
	invoiceNo: '',
	customerName: '',
	invoiceFrom:isoSevenDaysAgo, // default to 7 days ago
	invoiceTo: isoToday, // default to today   
}

export default function ListInvoice() {
	const userId = useSelector(selectBillingUserId)
	return <InvoiceList key={userId} userId={userId} />
}

function InvoiceList({ userId }) {
	const navigate = useNavigate()
	const [filters, setFilters] = useState(() => ({ ...initialFilters, userName: userId }))
	const [request, setRequest] = useState(() => ({ filters, page: 1 }))
	const [response, setResponse] = useState(null)
	const [deleteError, setDeleteError] = useState('')
	const [deletingId, setDeletingId] = useState(null)
	const { page } = request
	const active = response?.request === request ? response : null
	const loading = !active
	const error = active?.error || deleteError
	const invoices = active?.data?.items ?? []
	const total = active?.data?.totalCount ?? 0
	const totalPages = active?.data?.totalPages ?? 0
	const offset = (page - 1) * PAGE_SIZE

	useEffect(() => {
		const controller = new AbortController()
		searchInvoices(request.filters, page, PAGE_SIZE, controller.signal)
			.then((data) => {
				if (controller.signal.aborted) return
				if (page > 1 && page > data.totalPages) {
					setRequest({ ...request, page: Math.max(1, data.totalPages) })
					return
				}
				setResponse({ request, data })
			})
			.catch((err) => {
				if (!controller.signal.aborted) {
					const message = err.response?.data?.title || err.response?.data?.message
					setResponse({ request, error: message || 'Could not load invoices. Try again.' })
				}
			})
		return () => controller.abort()
	}, [request, page])

	const handleInputChange = (event) => {
		const { name, value } = event.target
		setFilters((prev) => ({ ...prev, [name]: value }))
	}

	const handleSearch = (event) => {
		event.preventDefault()
		setDeleteError('')
		setRequest({ filters, page: 1 })
	}

	const handleEditInvoice = (invoice) => {
		const id = invoice?.invoiceId ?? invoice?.id ?? null
		if (!id) return
		navigate(`/invoices/edit/${id}`, { state: invoice })
	}

	const handleDeleteInvoice = async (invoice) => {
		const id = invoice?.invoiceId ?? invoice?.id ?? null
		if (!id || deletingId !== null) return
		const ok = window.confirm(`Delete invoice ${invoice?.invoiceNo || id}?`)
		if (!ok) return
		setDeleteError('')
		setDeletingId(id)
		try {
			const resp = await deleteInvoice(id)
			// Best-effort: if backend returns a success flag, respect it.
			if (resp && typeof resp === 'object' && 'success' in resp && !resp.success) {
				throw new Error(resp?.message || 'Failed to delete invoice')
			}
			setRequest((previous) => ({ ...previous }))
		} catch (err) {
			setDeleteError(err?.message || 'Failed to delete invoice')
		} finally {
			setDeletingId(null)
		}
	}

	return (
		<div className="invoice-list-page billing-list-page">
			<BillingListHeader title="Invoices" description="Search customer invoices."
				createPath="/invoices/create" createLabel="Create Invoice">
				<button className="btn outline" type="button" disabled={loading} onClick={() => { setDeleteError(''); setRequest({ ...request }) }}>Refresh</button>
			</BillingListHeader>

			<section className="panel filters-panel" aria-label="Search filters">
				<form className="filter-grid" data-creator-filter={supportsInvoiceUserSearch || undefined} onSubmit={handleSearch} autoComplete="off">
					<label className="field">
						<span>Invoice number</span>
						<input
							name="invoiceNo"
							type="text"
							spellCheck={false}
							placeholder="e.g. 100234"
							value={filters.invoiceNo}
							onChange={handleInputChange}
						/>
					</label>
					<label className="field">
						<span>Customer name</span>
						<input
							name="customerName"
							type="text"
							autoComplete="off"
							autoCorrect="off"
							autoCapitalize="off"
							spellCheck={false}
							value={filters.customerName}
							onChange={handleInputChange}
						/>
					</label>
					{supportsInvoiceUserSearch && (
						<BillingUserFilter value={filters.userName}
							onChange={(userName) => setFilters((previous) => ({ ...previous, userName }))} />
					)}
					<label className="field">
						<span>Invoice from</span>
						<input
							name="invoiceFrom"
							type="date"
							value={filters.invoiceFrom}
							onChange={handleInputChange}
						/>
					</label>
					<label className="field">
						<span>Invoice to</span>
						<input
							name="invoiceTo"
							type="date"
							min={filters.invoiceFrom || undefined}
							value={filters.invoiceTo}
							onChange={handleInputChange}
						/>
					</label>
					<button type="submit" className="btn outline" disabled={loading}>
						{loading ? 'Searching...' : 'Search'}
					</button>
				</form>

			</section>

			{error && (
				<div className="callout error" role="alert">
					<strong>Request failed.</strong>
					<span>{error}</span>
				</div>
			)}

			<section className="panel table-panel">
				<header className="panel-header billing-results-heading">
					<div>
						<h2>Results</h2>
						<p aria-live="polite">{loading ? 'Loading invoices...' : total
							? 'Showing ' + (offset + 1) + '-' + (offset + invoices.length) + ' of ' + total
							: '0 results'}</p>
					</div>
					{!loading && <BillingPager page={page} totalPages={totalPages} onPageChange={(nextPage) => setRequest({ ...request, page: nextPage })} />}
				</header>

				<div className={`table-wrapper ${loading ? 'is-loading' : ''}`}>
					{loading ? (
						<div className="loading-state">
							<span className="spinner" aria-hidden="true" />
							<p>Loading invoices…</p>
						</div>
					) : invoices.length ? (
						<table className="billing-records" role="table">
							<thead role="rowgroup">
								<tr role="row">
									<th scope="col">Invoice</th>
									<th scope="col">Customer</th>
									<th scope="col">Invoice &amp; Post</th>
									<th scope="col">Due date</th>
									<th scope="col" className="amount-col">Amount</th>
									<th scope="col" className="actions-col">Actions</th>
								</tr>
							</thead>
							<tbody role="rowgroup">
								{invoices.map((invoice) => (
									<tr role="row" key={invoice.invoiceId ?? invoice.invoiceNo}>
										<td role="cell" data-label="Invoice">
											<div className="cell-title">{invoice.invoiceNo || '—'}</div>
											<small className="billing-created-by">{invoice.createdBy?.trim() ? 'By ' + invoice.createdBy.trim() : 'ID ' + (invoice.invoiceId ?? 'pending')}</small>
										</td>
										<td role="cell" data-label="Customer">
											<div className="cell-title">{invoice.companyName || 'Unknown company'}</div>
											<small>#{invoice.companyId ?? '—'}</small>
										</td>
										<td role="cell" data-label="Invoice &amp; post dates">
											<div className="date-stack">
												<span>{formatBillingDate(invoice.invoiceDate)}</span>
												<small>Post {formatBillingDate(invoice.postDate)}</small>
											</div>
										</td>
										<td role="cell" data-label="Due date">
											<span className="due-chip">{formatBillingDate(invoice.dueDate)}</span>
										</td>
										<td role="cell" data-label="Total" className="amount-col">{formatApAmount(invoice.invoiceAmount, invoice.currency || 'USD')}</td>
										<td role="cell" className="actions-col">
											<div className="invoice-actions">
												<button
													type="button"
													className="btn outline action-btn"
													onClick={() => handleEditInvoice(invoice)}
													disabled={!invoice?.invoiceId && !invoice?.id}
												>
													Edit
												</button>
												<button
													type="button"
													className="btn danger action-btn"
													onClick={() => handleDeleteInvoice(invoice)}
													disabled={loading || deletingId !== null || (!invoice?.invoiceId && !invoice?.id)}
												>
													Delete
												</button>
											</div>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					) : (
						!active?.error && <div className="empty-state">
							<h4>No invoices match your filters</h4>
							<p>Try widening the date range or clearing the invoice number.</p>
						</div>
					)}
				</div>
			</section>
		</div>
	)
}
