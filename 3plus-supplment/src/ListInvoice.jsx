import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './ListInvoice.css'
import { deleteInvoice, searchInvoices } from './api/invoices'

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

const formatCurrency = (value) => new Intl.NumberFormat('en-US', {
	style: 'currency',
	currency: 'USD',
	maximumFractionDigits: 2,
}).format(Number(value) || 0)

const formatDate = (value) => {
	if (!value) return '—'
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return value
	return date.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	})
}

const describeRelativeTime = (date) => {
	if (!date) return 'just now'
	const delta = Date.now() - date.getTime()
	const absDelta = Math.abs(delta)
	const suffix = delta >= 0 ? 'ago' : 'from now'
	const seconds = Math.floor(absDelta / 1000)
	if (seconds < 60) return `${seconds}s ${suffix}`
	const minutes = Math.floor(seconds / 60)
	if (minutes < 60) return `${minutes}m ${suffix}`
	const hours = Math.floor(minutes / 60)
	if (hours < 24) return `${hours}h ${suffix}`
	const days = Math.floor(hours / 24)
	return `${days}d ${suffix}`
}

const readableFilterLabel = {
	invoiceNo: 'Invoice',
	customerName: 'Customer',
	invoiceFrom: 'From',
	invoiceTo: 'To',
}

function ListInvoice() {
	const navigate = useNavigate()
	const [filters, setFilters] = useState(() => ({ ...initialFilters }))
	const [lastUsedFilters, setLastUsedFilters] = useState(() => ({ ...initialFilters }))
	const [invoices, setInvoices] = useState([])
	const [page, setPage] = useState(1)
	const [meta, setMeta] = useState({ message: '', success: true })
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState(null)
	const [lastRefresh, setLastRefresh] = useState(null)

	const fetchInvoices = useCallback(async (activeFilters) => {
		if (!activeFilters) return
		setLoading(true)
		setError(null)

		try {
			const payload = await searchInvoices(activeFilters)
			const rows = Array.isArray(payload?.data)
				? payload.data
				: Array.isArray(payload)
					? payload
					: []

			setInvoices(rows)
			setPage(1)
			setMeta({
				message: payload?.message ?? '',
				success: Boolean(payload?.success ?? true),
			})
			setLastRefresh(new Date())
			setLastUsedFilters({ ...activeFilters })
		} catch (err) {
			setInvoices([])
			setMeta({ message: '', success: false })
			setError(err?.message ?? 'Unable to fetch invoices')
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		fetchInvoices({ ...initialFilters })
	}, [fetchInvoices])

	const insight = useMemo(() => {
		if (!invoices.length) {
			return {
				total: 0,
				customerCount: 0,
				totalAmount: 0,
				averageAmount: 0,
				topInvoice: null,
				nextDueDate: null,
			}
		}

		const customerIds = new Set()
		let totalAmount = 0
		let topInvoice = null

		invoices.forEach((item) => {
			const amount = Number(item.invoiceAmount) || 0
			totalAmount += amount
			const candidateId = item.customerId ?? item.companyId ?? item.companyName
			if (candidateId) customerIds.add(candidateId)
			const topAmount = Number(topInvoice?.invoiceAmount) || 0
			if (!topInvoice || amount > topAmount) {
				topInvoice = item
			}
		})

		const dueTimeline = invoices
			.map((row) => {
				const dueEpoch = new Date(row.dueDate).getTime()
				return { row, dueEpoch }
			})
			.filter(({ dueEpoch }) => !Number.isNaN(dueEpoch))
			.sort((a, b) => a.dueEpoch - b.dueEpoch)

		return {
			total: invoices.length,
			customerCount: customerIds.size,
			totalAmount,
			averageAmount: invoices.length ? totalAmount / invoices.length : 0,
			topInvoice,
			nextDueDate: dueTimeline.length ? dueTimeline[0].row : null,
		}
	}, [invoices])

	const handleInputChange = (event) => {
		const { name, value } = event.target
		setFilters((prev) => ({ ...prev, [name]: value }))
	}

	const handleSearch = (event) => {
		event?.preventDefault()
		setPage(1)
		fetchInvoices(filters)
	}

	const handleCreateInvoice = () => {
		try {
			navigate('/invoices/create')
		} catch (err) {
			const hash = '#/invoices/create'
			if (window.location.hash !== hash) window.location.hash = hash
			else window.dispatchEvent(new HashChangeEvent('hashchange'))
		}
	}

	const handleEditInvoice = (invoice) => {
		const id = invoice?.invoiceId ?? invoice?.id ?? null
		if (!id) return
		navigate(`/invoices/edit/${id}`, { state: invoice })
	}

	const handleDeleteInvoice = async (invoice) => {
		const id = invoice?.invoiceId ?? invoice?.id ?? null
		if (!id) return
		const ok = window.confirm(`Delete invoice ${invoice?.invoiceNo || id}?`)
		if (!ok) return
		setError(null)
		try {
			const resp = await deleteInvoice(id)
			// Best-effort: if backend returns a success flag, respect it.
			if (resp && typeof resp === 'object' && 'success' in resp && !resp.success) {
				throw new Error(resp?.message || 'Failed to delete invoice')
			}
			setInvoices((prev) => prev.filter((row) => (row?.invoiceId ?? row?.id) !== id))
		} catch (err) {
			setError(err?.message || 'Failed to delete invoice')
		}
	}

	const activeFilterPills = Object.entries(lastUsedFilters).filter(([, value]) => value)

	const totalPages = useMemo(() => {
		const total = invoices.length
		return Math.max(1, Math.ceil(total / PAGE_SIZE))
	}, [invoices.length])

	useEffect(() => {
		setPage((prev) => Math.min(Math.max(prev, 1), totalPages))
	}, [totalPages])

	const pageRange = useMemo(() => {
		const total = invoices.length
		if (!total) return { start: 0, end: 0, total }
		const start = (page - 1) * PAGE_SIZE + 1
		const end = Math.min(page * PAGE_SIZE, total)
		return { start, end, total }
	}, [invoices.length, page])

	const pagedInvoices = useMemo(() => {
		const startIndex = (page - 1) * PAGE_SIZE
		return invoices.slice(startIndex, startIndex + PAGE_SIZE)
	}, [invoices, page])

	return (
		<div className="invoice-list-page">
			<section className="panel invoice-hero" >
				<div className="hero-copy" >
					<p className="eyebrow"></p>
					<h3>Search Invoice</h3>
				</div>
			</section>

			<section className="panel filters-panel">
				<header className="panel-header">
					<div>
						<h3>Search filters</h3>
					</div>
				</header>

				<form className="filter-grid" onSubmit={handleSearch} autoComplete="off">
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
							value={filters.invoiceTo}
							onChange={handleInputChange}
						/>
					</label>
					<div className="form-actions">
						<button type="submit" className="btn primary" disabled={loading}>
							{loading ? 'Searching…' : 'Run search'}
						</button>
					</div>
				</form>

				<div className="active-filters" aria-live="polite">
					{activeFilterPills.length ? (
						activeFilterPills.map(([key, value]) => (
							<span key={key} className="filter-pill">
								{readableFilterLabel[key] || key}: <strong>{value}</strong>
							</span>
						))
					) : (
						<span className="filter-pill muted">No filters applied</span>
					)}
				</div>
			</section>

			{error && (
				<div className="callout error" role="alert">
					<strong>Request failed.</strong>
					<span>{error}</span>
				</div>
			)}

			<section className="insight-grid">
				<article className="insight-card highlight">
					<p>Invoices found</p>
					<h4>{insight.total}</h4>
				</article>
				<article className="insight-card">
					<p>Total exposure</p>
					<h4>{formatCurrency(insight.totalAmount)}</h4>
				</article>
				<article className="insight-card">
				</article>
				<article className="insight-card">

				</article>
			</section>

			<section className="panel table-panel">
				<header className="panel-header">
					<div>
						<h3>Invoice results</h3>
						<p>
							Showing {pageRange.start}-{pageRange.end} of {pageRange.total}.
						</p>
					</div>
					<div className="header-actions">
						<button type="button" className="btn outline" onClick={handleCreateInvoice}>
							Create Invoice
						</button>
						<button
							type="button"
							className="btn outline"
							onClick={() => fetchInvoices(lastUsedFilters)}
							disabled={loading}
						>
							{loading ? 'Refreshing…' : 'Refresh data'}
						</button>
					</div>
				</header>

				<div className={`table-wrapper ${loading ? 'is-loading' : ''}`}>
					{loading ? (
						<div className="loading-state">
							<span className="spinner" aria-hidden="true" />
							<p>Calling /Invoice/SearchInvoices…</p>
						</div>
					) : invoices.length ? (
						<>
							<div className="pagination-bar" role="navigation" aria-label="Invoice pages">
								<div className="pagination-meta">
									Rows per page: {PAGE_SIZE} • {pageRange.start}-{pageRange.end} of {pageRange.total}
								</div>
								<div className="pagination-controls">
									<button
										type="button"
										className="btn outline pagination-btn"
										onClick={() => setPage(1)}
										disabled={page <= 1}
									>
										First
									</button>
									<button
										type="button"
										className="btn outline pagination-btn"
										onClick={() => setPage((prev) => Math.max(1, prev - 1))}
										disabled={page <= 1}
									>
										Prev
									</button>
									<span className="pagination-page" aria-live="polite">
										Page {page} of {totalPages}
									</span>
									<button
										type="button"
										className="btn outline pagination-btn"
										onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
										disabled={page >= totalPages}
									>
										Next
									</button>
									<button
										type="button"
										className="btn outline pagination-btn"
										onClick={() => setPage(totalPages)}
										disabled={page >= totalPages}
									>
										Last
									</button>
								</div>
							</div>
						<table>
							<thead>
								<tr>
									<th>Invoice</th>
									<th>Customer</th>
									<th>Invoice &amp; Post</th>
									<th>Due date</th>
									<th className="amount-col">Amount</th>
									<th className="actions-col">Actions</th>
								</tr>
							</thead>
							<tbody>
								{pagedInvoices.map((invoice) => (
									<tr key={invoice.invoiceId ?? invoice.invoiceNo}>
										<td>
											<div className="cell-title">{invoice.invoiceNo || '—'}</div>
											<small>ID {invoice.invoiceId ?? 'pending'}</small>
										</td>
										<td>
											<div className="cell-title">{invoice.companyName || 'Unknown company'}</div>
											<small>#{invoice.companyId ?? '—'}</small>
										</td>
										<td>
											<div className="date-stack">
												<span>{formatDate(invoice.invoiceDate)}</span>
												<small>Post {formatDate(invoice.postDate)}</small>
											</div>
										</td>
										<td>
											<span className="due-chip">{formatDate(invoice.dueDate)}</span>
										</td>
										<td className="amount-col">{formatCurrency(invoice.invoiceAmount)}</td>
										<td className="actions-col">
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
													disabled={loading || (!invoice?.invoiceId && !invoice?.id)}
												>
													Delete
												</button>
											</div>
										</td>
									</tr>
								))}
							</tbody>
						</table>
						</>
					) : (
						<div className="empty-state">
							<h4>No invoices match your filters</h4>
							<p>Try widening the date range or clearing the invoice number.</p>
						</div>
					)}
				</div>
			</section>
		</div>
	)
}

export default ListInvoice
