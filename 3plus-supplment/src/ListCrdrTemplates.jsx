import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./ListInvoiceTemplate.css";
import { getCrdrTemplateByAgentName } from "./api/ListCrdrTemplate";

const PAGE_SIZE = 10;

const describeRelativeTime = (moment) => {
  if (!moment) return "awaiting sync";
  const delta = Date.now() - moment.getTime();
  const abs = Math.abs(delta);
  const suffix = delta >= 0 ? "ago" : "from now";
  const seconds = Math.floor(abs / 1000);
  if (seconds < 60) return `${seconds}s ${suffix}`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${suffix}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${suffix}`;
  const days = Math.floor(hours / 24);
  return `${days}d ${suffix}`;
};

function ListCrdrTemplates() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [lastQuery, setLastQuery] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedHeaderId, setExpandedHeaderId] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [page, setPage] = useState(1);

  const loadTemplates = async (agentName) => {
    const trimmed = (agentName || "").trim();
    if (!trimmed) {
      setError("Enter an agent name to search.");
      setRows([]);
      setLastQuery("");
      setPage(1);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const list = await getCrdrTemplateByAgentName(trimmed);
      setRows(Array.isArray(list) ? list : []);
      setLastQuery(trimmed);
      setLastRefresh(new Date());
      setPage(1);
      setExpandedHeaderId(null);
    } catch (err) {
      setError(err?.message || "Failed to load CRDR templates");
      setRows([]);
      setLastQuery(trimmed);
      setPage(1);
    } finally {
      setLoading(false);
    }
  };

  const doSearch = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    loadTemplates(searchTerm);
  };

  const stats = useMemo(() => {
    if (!rows.length) {
      return {
        total: 0,
        uniqueAgents: 0,
        totalDetails: 0,
        topFreight: "Unspecified",
      };
    }

    const agentSet = new Set();
    let totalDetails = 0;
    const freightCounter = {};

    rows.forEach((row) => {
      if (row?.agentName) agentSet.add(String(row.agentName).toUpperCase());
      totalDetails += Array.isArray(row?.details) ? row.details.length : 0;
      const freight = row?.freightType || "Unspecified";
      freightCounter[freight] = (freightCounter[freight] || 0) + 1;
    });

    const topFreight =
      Object.entries(freightCounter)
        .sort((a, b) => b[1] - a[1])
        .map(([key]) => key)[0] || "Unspecified";

    return {
      total: rows.length,
      uniqueAgents: agentSet.size,
      totalDetails,
      topFreight,
    };
  }, [rows]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(rows.length / PAGE_SIZE)), [rows.length]);

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

  const toggleExpanded = (headerId) => {
    setExpandedHeaderId((prev) => (String(prev) === String(headerId) ? null : headerId));
  };

  return (
    <div className="templates-shell">
      <section className="panel template-hero">
        <div className="hero-text">
          <p className="eyebrow">CRDR TEMPLATE</p>
          <h2>CRDR Templates</h2>
          <p>Search CRDR templates by agent name and review header / detail lines.</p>
          <p className="last-query">
            {lastQuery ? (
              <>
                Last query: <strong>{lastQuery}</strong> • refreshed {describeRelativeTime(lastRefresh)}
              </>
            ) : (
              "Ready to search"
            )}
          </p>
        </div>

        <div className="hero-status">
          <div className="status-card">
            <span className={`status-dot ${loading ? "syncing" : "ready"}`} />
            <div>
              <strong>{loading ? "Syncing" : "Ready"}</strong>
              <small>{loading ? "Fetching templates" : "Awaiting search"}</small>
            </div>
          </div>

          <div className="metrics-grid" style={{ width: "100%" }}>
            <div className="metric-card">
              <p>Headers</p>
              <h4>{stats.total}</h4>
              <small>Templates returned</small>
            </div>
            <div className="metric-card">
              <p>Details</p>
              <h4>{stats.totalDetails}</h4>
              <small>Total line items</small>
            </div>
            <div className="metric-card highlight">
              <p>Top Freight</p>
              <h4>{stats.topFreight}</h4>
              <small>Most common freight type</small>
            </div>
          </div>
        </div>
      </section>

      <section className="panel template-search">
        <form className="search-form" onSubmit={doSearch}>
          <label className="field">
            <span>Agent name</span>
            <input
              className="search-input"
              placeholder="Try TEST, POM, ..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </label>
          <div className="search-actions">
            <button type="submit" className="btn primary" disabled={loading}>
              {loading ? "Searching…" : "Search CRDR templates"}
            </button>
            <button
              type="button"
              className="btn outline"
              onClick={() => navigate("/crdr-templates/create")}
              disabled={loading}
            >
              New CRDR Template
            </button>
          </div>
        </form>
      </section>

      <section className="panel table-panel">
        <header className="table-header">
          <div>
            <h3>CRDR Template Header(s)</h3>
            <p>
              {stats.total} record(s)
              {rows.length > 0 ? ` • showing ${pageRange.start}-${pageRange.end} of ${pageRange.total}` : ""}
            </p>
          </div>
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
        </header>

        <div className={`table-wrapper ${loading ? "is-loading" : ""}`}>
          {error && <div className="error-row">{error}</div>}

          {!loading && !error && rows.length === 0 && (
            <div className="empty-row">No results yet. Search by agent name.</div>
          )}

          {!loading && !error && rows.length > 0 && (
            <table className="templates-table">
              <thead>
                <tr>
                  <th>Header ID</th>
                  <th>User</th>
                  <th>Agent</th>
                  <th>Freight</th>
                  <th>Term</th>
                  <th>Lines</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((row) => {
                  const isOpen = String(expandedHeaderId) === String(row.headerId);
                  const details = Array.isArray(row.details) ? row.details : [];

                  return (
                    <React.Fragment key={row.headerId ?? `${row.agentName}-${row.userName}`}> 
                      <tr>
                        <td>{row.headerId ?? "-"}</td>
                        <td>{row.userName || "-"}</td>
                        <td>{row.agentName || "-"}</td>
                        <td>{row.freightType || "-"}</td>
                        <td>{row.term ?? "-"}</td>
                        <td>{details.length}</td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            type="button"
                            className="btn outline"
                            onClick={() => toggleExpanded(row.headerId)}
                          >
                            {isOpen ? "Hide" : "View"}
                          </button>
                        </td>
                      </tr>

                      {isOpen && (
                        <tr>
                          <td colSpan={7} style={{ paddingTop: 0 }}>
                            <div className="detail-panel" style={{ padding: "1rem 0" }}>
                              <h4 style={{ margin: "0 0 0.75rem" }}>Details</h4>
                              {details.length === 0 ? (
                                <div className="empty-row">No detail lines.</div>
                              ) : (
                                <table className="templates-table" style={{ margin: 0 }}>
                                  <thead>
                                    <tr>
                                      <th>Detail ID</th>
                                      <th>Description</th>
                                      <th>Debit</th>
                                      <th>Credit</th>
                                      <th>PShare</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {details.map((det) => (
                                      <tr key={det.detailId ?? det.description}>
                                        <td>{det.detailId ?? "-"}</td>
                                        <td>{det.description || "-"}</td>
                                        <td>{det.debit ?? 0}</td>
                                        <td>{det.credit ?? 0}</td>
                                        <td>{det.pShare ?? "0"}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

export default ListCrdrTemplates;
