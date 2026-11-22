import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { BillingListHeader, BillingPager } from "./components/BillingListControls";
import BillingUserFilter from "./components/BillingUserFilter";
import { selectBillingUserId } from "./store/slices/authSlice";
import { formatBillingDate } from "./billingDates";
import "./ListCrdr.css";
import { searchCrdrs, supportsCrdrUserSearch } from "./api/crdrs";
import { formatApAmount } from "./api/accountsPayable";

const PAGE_SIZE = 10;

const today = new Date();
const isoToday = today.toISOString().split("T")[0];

const sevenDaysAgo = new Date(today);
sevenDaysAgo.setDate(today.getDate() - 7);
const isoSevenDaysAgo = sevenDaysAgo.toISOString().split("T")[0];

const initialFilters = {
  crdrNo: "",
  agentName: "",
  userName: "",
  startDate: isoSevenDaysAgo,
  endDate: isoToday,
};

export default function ListCrdr() {
  const userId = useSelector(selectBillingUserId);
  return <CrdrList key={userId} userId={userId} />;
}

function CrdrList({ userId }) {
  const navigate = useNavigate();
  const [filters, setFilters] = useState(() => ({ ...initialFilters, userName: userId }));
  const [request, setRequest] = useState(() => ({ filters, page: 1 }));
  const [response, setResponse] = useState(null);
  const { page } = request;
  const active = response?.request === request ? response : null;
  const loading = !active;
  const error = active?.error;
  const rows = active?.data?.items ?? [];
  const total = active?.data?.totalCount ?? 0;
  const totalPages = active?.data?.totalPages ?? 0;
  const offset = (page - 1) * PAGE_SIZE;

  useEffect(() => {
    const controller = new AbortController();
    searchCrdrs(request.filters, page, PAGE_SIZE, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        if (page > 1 && page > data.totalPages) {
          setRequest({ ...request, page: Math.max(1, data.totalPages) });
          return;
        }
        setResponse({ request, data });
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          const message = err.response?.data?.title || err.response?.data?.message;
          setResponse({ request, error: message || "Could not load credit/debit notes. Try again." });
        }
      });
    return () => controller.abort();
  }, [request, page]);

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const handleSearch = (event) => {
    event.preventDefault();
    setRequest({ filters, page: 1 });
  };

  const handleEditCrdr = (row) => {
    const crdrId = row.id;
    if (!crdrId && crdrId !== 0) return;
    navigate(`/crdr/edit/${crdrId}`);
  };

  return (
    <div className="crdr-list-page billing-list-page">
      <BillingListHeader title="Credit / Debit Notes" description="Search credit and debit records."
        createPath="/crdr/create" createLabel="Create Note" />

      <section className="panel filters-panel" aria-label="Search filters">
        <form className="filter-grid" data-creator-filter={supportsCrdrUserSearch || undefined}
          onSubmit={handleSearch} autoComplete="off">
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
          {supportsCrdrUserSearch && (
            <BillingUserFilter value={filters.userName}
              onChange={(userName) => setFilters((previous) => ({ ...previous, userName }))} />
          )}
          <label className="field">
            <span>Post date from</span>
            <input
              name="startDate"
              type="date"
              value={filters.startDate}
              onChange={handleInputChange}
            />
          </label>
          <label className="field">
            <span>Post date to</span>
            <input
              name="endDate"
              type="date"
              min={filters.startDate || undefined}
              value={filters.endDate}
              onChange={handleInputChange}
            />
          </label>

          <button type="submit" className="btn outline" disabled={loading}>{loading ? "Searching..." : "Search"}</button>
        </form>
      </section>

      <section className="panel table-panel">
        <header className="table-header billing-results-heading">
          <div>
            <h2>Results</h2>
            <p aria-live="polite">{loading ? "Loading notes..." : rows.length
              ? "Showing " + (offset + 1) + "-" + (offset + rows.length) + " of " + total
              : "0 results"}</p>
          </div>
          {!loading && <BillingPager page={page} totalPages={totalPages} onPageChange={(nextPage) => setRequest({ ...request, page: nextPage })} />}
        </header>

        <div className={`table-wrapper ${loading ? "is-loading" : ""}`}>
          {error && <div className="error-row" role="alert">{error}</div>}

          {!loading && !error && rows.length === 0 && (
            <div className="empty-row">No results yet. Adjust the filters and search.</div>
          )}

          {!loading && !error && rows.length > 0 && (
            <table className="templates-table billing-records" role="table">
              <thead role="rowgroup">
                <tr role="row">
                  <th scope="col">CRDR No</th>
                  <th scope="col">Agent</th>
                  <th scope="col">Post Date</th>
                  <th scope="col">Invoice Date</th>
                  <th scope="col">Due Date</th>
                  <th scope="col" className="billing-numeric">Total</th>
                  <th scope="col" className="billing-numeric">Actions</th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                {rows.map((row) => (
                  <tr role="row" key={row.id}>
                    <td role="cell" data-label="CRDR No.">
                      {row.memoNumber || "-"}
                      {row.createdBy?.trim() && <small className="billing-created-by">By {row.createdBy.trim()}</small>}
                    </td>
                    <td role="cell" data-label="Agent">{row.agentCompanyName || "—"}</td>
                    <td role="cell" data-label="Post date">{formatBillingDate(row.postDate)}</td>
                    <td role="cell" data-label="Invoice date">{formatBillingDate(row.invoiceDate)}</td>
                    <td role="cell" data-label="Due date">{formatBillingDate(row.dueDate)}</td>
                    <td role="cell" data-label="Total" className={Number(row.total) < 0 ? "billing-numeric billing-negative" : "billing-numeric"}>
                      {formatApAmount(row.total, row.currency)}
                    </td>
                    <td role="cell" className="billing-numeric">
                      <button type="button" className="btn outline" onClick={() => handleEditCrdr(row)}>Edit</button>
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
