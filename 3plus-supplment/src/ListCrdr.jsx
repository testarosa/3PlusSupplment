import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./ListCrdr.css";
import { searchCrdrs } from "./api/crdrs";

const PAGE_SIZE = 10;

const today = new Date();
const isoToday = today.toISOString().split("T")[0];

const sevenDaysAgo = new Date(today);
sevenDaysAgo.setDate(today.getDate() - 7);
const isoSevenDaysAgo = sevenDaysAgo.toISOString().split("T")[0];

const initialFilters = {
  crdrNo: "",
  agentName: "",
  startDate: isoSevenDaysAgo,
  endDate: isoToday,
};

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const describeRelativeTime = (date) => {
  if (!date) return "just now";
  const delta = Date.now() - date.getTime();
  const absDelta = Math.abs(delta);
  const suffix = delta >= 0 ? "ago" : "from now";
  const seconds = Math.floor(absDelta / 1000);
  if (seconds < 60) return `${seconds}s ${suffix}`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${suffix}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${suffix}`;
  const days = Math.floor(hours / 24);
  return `${days}d ${suffix}`;
};

function ListCrdr() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState(() => ({ ...initialFilters }));
  const [lastUsedFilters, setLastUsedFilters] = useState(() => ({ ...initialFilters }));
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ message: "", success: true });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  const fetchCrdrs = useCallback(async (activeFilters) => {
    if (!activeFilters) return;
    setLoading(true);
    setError(null);

    try {
      const payload = await searchCrdrs(activeFilters);
      const list = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload)
          ? payload
          : [];

      setRows(list);
      setPage(1);
      setMeta({
        message: payload?.message ?? "",
        success: Boolean(payload?.success ?? true),
      });
      setLastRefresh(new Date());
      setLastUsedFilters({ ...activeFilters });
    } catch (err) {
      setRows([]);
      setMeta({ message: "", success: false });
      setError(err?.message ?? "Unable to fetch CRDRs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCrdrs({ ...initialFilters });
  }, [fetchCrdrs]);

  const insight = useMemo(() => {
    if (!rows.length) {
      return {
        total: 0,
        totalAmount: 0,
        averageAmount: 0,
        agentCount: 0,
      };
    }

    const agentSet = new Set();
    let totalAmount = 0;

    rows.forEach((item) => {
      totalAmount += Number(item.fTotal) || 0;
      if (item?.fsName) agentSet.add(String(item.fsName).toUpperCase());
    });

    return {
      total: rows.length,
      totalAmount,
      averageAmount: rows.length ? totalAmount / rows.length : 0,
      agentCount: agentSet.size,
    };
  }, [rows]);

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const handleSearch = (event) => {
    event?.preventDefault();
    setPage(1);
    fetchCrdrs(filters);
  };

  const handleEditCrdr = (row) => {
    const crdrId = row?.fId;
    if (!crdrId && crdrId !== 0) return;
    navigate(`/crdr/edit/${crdrId}`);
  };

  const handleRemoveCrdr = (row) => {
    const id = row?.fId ?? row?.fCrDbNo;
    if (!id) return;
    const ok = window.confirm(`Remove ${row?.fCrDbNo || id} from the list?`);
    if (!ok) return;
    setRows((prev) => prev.filter((item) => (item?.fId ?? item?.fCrDbNo) !== id));
  };

  const totalPages = useMemo(() => {
    const total = rows.length;
    return Math.max(1, Math.ceil(total / PAGE_SIZE));
  }, [rows.length]);

  useEffect(() => {
    setPage((prev) => Math.min(Math.max(prev, 1), totalPages));
  }, [totalPages]);

  const pageRange = useMemo(() => {
    const total = rows.length;
    if (!total) return { start: 0, end: 0, total };
    const start = (page - 1) * PAGE_SIZE + 1;
    const end = Math.min(page * PAGE_SIZE, total);
    return { start, end, total };
  }, [rows.length, page]);

  const pagedRows = useMemo(() => {
    const startIndex = (page - 1) * PAGE_SIZE;
    return rows.slice(startIndex, startIndex + PAGE_SIZE);
  }, [rows, page]);

  return (
    <div className="crdr-list-page">
      <section className="panel invoice-hero">
        <div className="hero-copy">
          <p className="eyebrow"></p>
          <h3>Search CRDR</h3>
          <p style={{ marginTop: "0.35rem", opacity: 0.8 }}>
            {meta?.message || "Search CRDRs by number, agent, or date range."}
          </p>
          <p className="last-query">
            {lastRefresh ? `Refreshed ${describeRelativeTime(lastRefresh)}` : "Ready to search"}
          </p>
        </div>

        <div className="hero-status">
          <div className="status-card">
            <span className={`status-dot ${loading ? "syncing" : "ready"}`} />
            <div>
              <strong>{loading ? "Syncing" : "Ready"}</strong>
              <small>{loading ? "Fetching CRDRs" : "Awaiting search"}</small>
            </div>
          </div>

          <div className="metrics-grid" style={{ width: "100%" }}>
            <div className="metric-card">
              <p>Records</p>
              <h4>{insight.total}</h4>
              <small>Total CRDRs</small>
            </div>
            <div className="metric-card">
              <p>Agents</p>
              <h4>{insight.agentCount}</h4>
              <small>Unique agents</small>
            </div>
            <div className="metric-card highlight">
              <p>Avg Total</p>
              <h4>{formatCurrency(insight.averageAmount)}</h4>
              <small>Average total</small>
            </div>
          </div>
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
            <span>CRDR number</span>
            <input
              name="crdrNo"
              type="text"
              spellCheck={false}
              placeholder="e.g. CRDR745"
              value={filters.crdrNo}
              onChange={handleInputChange}
            />
          </label>
          <label className="field">
            <span>Agent name</span>
            <input
              name="agentName"
              type="text"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="e.g. RAMSES LOGISTICS"
              value={filters.agentName}
              onChange={handleInputChange}
            />
          </label>
          <label className="field">
            <span>Start date</span>
            <input
              name="startDate"
              type="date"
              value={filters.startDate}
              onChange={handleInputChange}
            />
          </label>
          <label className="field">
            <span>End date</span>
            <input
              name="endDate"
              type="date"
              value={filters.endDate}
              onChange={handleInputChange}
            />
          </label>

          <div className="form-actions" style={{ display: "flex", gap: "0.5rem" }}>
            <button type="submit" className="btn primary" disabled={loading}>
              {loading ? "Searching…" : "Search CRDR"}
            </button>
            <button
              type="button"
              className="btn outline"
              onClick={() => navigate("/crdr-templates")}
              disabled={loading}
            >
              CRDR Templates
            </button>
          </div>
        </form>
      </section>

      <section className="panel table-panel">
        <header className="table-header">
          <div>
            <h3>CRDR results</h3>
            <p>
              {rows.length} record(s)
              {rows.length > 0 ? ` • showing ${pageRange.start}-${pageRange.end} of ${pageRange.total}` : ""}
            </p>
          </div>
          <div className="search-actions" aria-label="CRDR actions" style={{ display: "flex", flexDirection: "column", gap: "0.5rem", alignItems: "flex-end" }}>
            <button
              type="button"
              className="btn primary"
              onClick={() => navigate("/crdr-templates/create")}
            >
              Create
            </button>
            {rows.length > 0 && (
              <div className="search-actions" aria-label="CRDR pages">
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
                  Page {page} / {totalPages}
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
            )}
          </div>
        </header>

        <div className={`table-wrapper ${loading ? "is-loading" : ""}`}>
          {error && <div className="error-row">{error}</div>}

          {!loading && !error && rows.length === 0 && (
            <div className="empty-row">No results yet. Adjust the filters and search.</div>
          )}

          {!loading && !error && rows.length > 0 && (
            <table className="templates-table">
              <thead>
                <tr>
                  <th>CRDR No</th>
                  <th>Agent</th>
                  <th style={{ textAlign: "center" }}>Post Date</th>
                  <th style={{ textAlign: "center" }}>Invoice Date</th>
                  <th style={{ textAlign: "center" }}>Due Date</th>
                  <th style={{ textAlign: "right" }}>Total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((row) => (
                  <tr key={row.fId ?? row.fCrDbNo}>
                    <td>{row.fCrDbNo || "—"}</td>
                    <td>{row.fsName || "—"}</td>
                    <td style={{ textAlign: "center" }}>{formatDate(row.fPostDate)}</td>
                    <td style={{ textAlign: "center" }}>{formatDate(row.fInvoiceDate)}</td>
                    <td style={{ textAlign: "center" }}>{formatDate(row.fDueDate)}</td>
                    <td style={{ textAlign: "right", color: Number(row.fTotal) < 0 ? "#dc2626" : undefined }}>
                      {formatCurrency(row.fTotal)}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                        <button type="button" className="btn outline" onClick={() => handleEditCrdr(row)}>
                          Edit
                        </button>
                        <button type="button" className="btn danger" onClick={() => handleRemoveCrdr(row)}>
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

export default ListCrdr;
