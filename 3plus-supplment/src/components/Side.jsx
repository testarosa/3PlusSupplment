import React, { Suspense, useMemo } from "react";
import { Routes, Route } from "react-router-dom";

const ListInvoiceTemplate = React.lazy(() => import("../ListInvoiceTemplate"));
const ListCrdrTemplates = React.lazy(() => import("../ListCrdrTemplates"));
const ListCrdr = React.lazy(() => import("../ListCrdr"));
const ListInvoice = React.lazy(() => import("../ListInvoice"));
const CreateInvoiceTemplate = React.lazy(() => import("../CreateInvoiceTemplate"));
const CreateCrdrTemplate = React.lazy(() => import("../CreateCrdrTemplate"));
const CreateInvoice = React.lazy(() => import("../CreateInvoice"));
const EditInvoice = React.lazy(() => import("../EditInvoice"));
const EditCrdr = React.lazy(() => import("../EditCrdr"));
import "./Side.css";

function Side({ location, navigate, EditWrapper }) {
  const pathname = location?.pathname || "/";
  const isInvoicesList = pathname === "/invoices";
  const isFlushSurface = pathname === "/invoices" || pathname === "/invoices/create";

  const routeMeta = useMemo(
    () => ({
      "/": {
        eyebrow: "Mission Control",
        title: "3Plus Automation Console",
        copy: "Monitor the overall billing pulse and jump into any workspace in one click.",
        stage: "Overview",
        status: "System nominal",
        updated: "Synced 2m ago",
        surfaceTitle: "Executive Summary",
        surfaceHint: "High-level status for all modules",
        cta: { label: "Open Templates", path: "/templates" },
        timeline: [
          { label: "Status sweep", desc: "Checked invoice queue", complete: true },
          { label: "Template audit", desc: "No issues detected", complete: true },
          { label: "Next", desc: "Drill into invoices", complete: false },
        ],
      },
      "/templates": {
        eyebrow: "Invoice Template",
        title: "Template Management",
        copy: "Curate reusable billing blueprints and keep customer logic aligned.",
        stage: "Templates",
        status: "8 active patterns",
        updated: "Synced 5m ago",
        surfaceTitle: "Template Catalog",
        surfaceHint: "Search, edit, and deploy",
        cta: { label: "New Template", path: "/templates/create" },
        timeline: [
          { label: "Catalog", desc: "Inventory refreshed", complete: true },
          { label: "Draft", desc: "1 draft awaiting review", complete: false },
          { label: "Deploy", desc: "Push live once reviewed", complete: false },
        ],
      },
      "/templates/create": {
        eyebrow: "Builder",
        title: "Design a template",
        copy: "Map services, rates, and freight logic into a reusable artifact.",
        stage: "Creation",
        status: "Drafting",
        updated: "Autosave ready",
        surfaceTitle: "Template Studio",
        surfaceHint: "Guided creation experience",
        cta: { label: "Back to Catalog", path: "/templates" },
        timeline: [
          { label: "Scaffold", desc: "Define hero info", complete: true },
          { label: "Lines", desc: "Configure billing rows", complete: false },
          { label: "Publish", desc: "Review & release", complete: false },
        ],
      },
      "/crdr-templates": {
        eyebrow: "CRDR Templates",
        title: "CRDR Template Catalog",
        copy: "Search and review CRDR templates by agent name.",
        stage: "CRDR",
        status: "Ready",
        updated: "On demand",
        surfaceTitle: "CRDR Templates",
        surfaceHint: "Search, inspect details",
        cta: { label: "Open CRDR Templates", path: "/crdr-templates" },
        timeline: [
          { label: "Search", desc: "Find by agent", complete: true },
          { label: "Review", desc: "Inspect detail lines", complete: false },
          { label: "Use", desc: "Apply to billing", complete: false },
        ],
      },
      "/crdr": {
        eyebrow: "CRDR",
        title: "CRDR Search",
        copy: "Search CRDR entries by number, agent, and date range.",
        stage: "CRDR",
        status: "Ready",
        updated: "On demand",
        surfaceTitle: "CRDR Registry",
        surfaceHint: "Filter and review CRDR rows",
        cta: { label: "Open CRDR", path: "/crdr" },
        timeline: [
          { label: "Search", desc: "Filter by agent/date", complete: true },
          { label: "Review", desc: "Inspect totals", complete: false },
          { label: "Export", desc: "Share results", complete: false },
        ],
      },
      "/invoices": {
        eyebrow: "Billing",
        title: "Invoice Search",
        copy: "Filter and reconcile invoice runs directly from the console.",
        stage: "Invoices",
        status: "12 in queue",
        updated: "Synced 1m ago",
        surfaceTitle: "Invoice Registry",
        surfaceHint: "Search and annotate",
        cta: { label: "Create Invoice", path: "/invoices/create" },
        timeline: [
          { label: "Search", desc: "Filters applied", complete: true },
          { label: "Review", desc: "Inspect line details", complete: false },
          { label: "Post", desc: "Send to ERP", complete: false },
        ],
      },
      "/invoices/create": {
        eyebrow: "Studio",
        title: "Compose an invoice",
        copy: "Use the guided builder to blend BL insight, customers, and lines.",
        stage: "Composer",
        status: "In progress",
        updated: "Autosave enabled",
        surfaceTitle: "Invoice Builder",
        surfaceHint: "Complete readiness rail",
        cta: { label: "View Queue", path: "/invoices" },
        timeline: [
          { label: "Lookup", desc: "BL + reference", complete: true },
          { label: "Header", desc: "Customer & dates", complete: true },
          { label: "Lines", desc: "Validate totals", complete: false },
        ],
      },
    }),
    []
  );

  const meta = routeMeta[pathname] || {
    eyebrow: "Workspace",
    title: "Operational Console",
    copy: "Load the requested module while keeping navigation nearby.",
    stage: "Module",
    status: "Ready",
    updated: "Synced",
    surfaceTitle: "Active Surface",
    surfaceHint: "Live module output",
    cta: { label: "Go Home", path: "/" },
    timeline: [
      { label: "Init", desc: "Loading view", complete: true },
      { label: "Interact", desc: "Work the data", complete: false },
    ],
  };

  const jumpTo = (path) => {
    if (typeof navigate === "function") navigate(path);
  };

  return (
    <div className="side-shell">
      <section className="panel side-router">
        <div className={`router-body ${isFlushSurface ? "flush" : ""}`}>
          <Suspense fallback={<div className="side-surface">Loading…</div>}>
            <Routes location={location}>
              <Route
                path="/"
                element={
                  <div className="side-surface">
                    <h2>Overview</h2>
                    <p>3Plus Automation System Site</p>
                    <p className="overview-hint">Use the sidebar to dive into templates or invoices.</p>
                  </div>
                }
              />
              <Route
                path="/templates"
                element={
                  <div className="side-surface">
                    <ListInvoiceTemplate />
                  </div>
                }
              />
              <Route
                path="/crdr-templates"
                element={
                  <div className="side-surface">
                    <ListCrdrTemplates />
                  </div>
                }
              />
              <Route
                path="/crdr-templates/create"
                element={
                  <div className="side-surface">
                    <CreateCrdrTemplate />
                  </div>
                }
              />
              <Route
                path="/crdr"
                element={
                  <div className="side-surface flush">
                    <ListCrdr />
                  </div>
                }
              />
              <Route
                path="/crdr/edit/:id"
                element={
                  <div className="side-surface">
                    <EditCrdr />
                  </div>
                }
              />
              <Route
                path="/templates/create"
                element={
                  <div className="side-surface">
                    <CreateInvoiceTemplate
                      onSave={(tpl) => {
                        console.log("Saved template", tpl);
                        alert("Saved (demo)");
                        jumpTo("/templates");
                      }}
                    />
                  </div>
                }
              />
              <Route
                path="/templates/edit/:id"
                element={
                  <div className="side-surface">
                    <EditWrapper />
                  </div>
                }
              />
              <Route
                path="/invoices"
                element={
                  <div className="side-surface flush">
                    <ListInvoice />
                  </div>
                }
              />
              <Route
                path="/invoices/create"
                element={
                  <div className="side-surface flush">
                    <CreateInvoice />
                  </div>
                }
              />
              <Route
                path="/invoices/edit/:id"
                element={
                  <div className="side-surface">
                    <EditInvoice />
                  </div>
                }
              />
            </Routes>
          </Suspense>
        </div>
      </section>
    </div>
  );
}

export default Side;
