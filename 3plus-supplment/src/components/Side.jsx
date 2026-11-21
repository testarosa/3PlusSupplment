import { lazy, Suspense } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import { PortalIcon } from './PortalNav'

const ListInvoiceTemplate = lazy(() => import('../ListInvoiceTemplate'))
const ListCrdrTemplates = lazy(() => import('../ListCrdrTemplates'))
const ListCrdr = lazy(() => import('../ListCrdr'))
const ListInvoice = lazy(() => import('../ListInvoice'))
const CreateInvoiceTemplate = lazy(() => import('../CreateInvoiceTemplate'))
const CreateCrdrTemplate = lazy(() => import('../CreateCrdrTemplate'))
const EditCrdrTemplate = lazy(() => import('../EditCrdrTemplate'))
const CreateInvoice = lazy(() => import('../CreateInvoice'))
const CreateCrdr = lazy(() => import('../CreateCrdr'))
const EditInvoice = lazy(() => import('../EditInvoice'))
const EditCrdr = lazy(() => import('../EditCrdr'))

const modules = [
  { title: 'Invoices', icon: 'invoice', path: '/invoices', description: 'Find invoices and prepare freight charges for billing.', action: 'New invoice' },
  { title: 'Credit / Debit Notes', icon: 'notes', path: '/crdr', description: 'Review adjustments and prepare credit or debit charges.', action: 'New credit / debit note' },
  { title: 'Invoice Templates', icon: 'template', path: '/templates', description: 'Manage reusable invoice lines and customer billing defaults.', action: 'New invoice template' },
  { title: 'Credit / Debit Templates', icon: 'template', path: '/crdr-templates', description: 'Manage reusable credit and debit lines by agent.', action: 'New credit / debit template' },
]

function Overview() {
  return (
    <div className="portal-overview">
      <section className="overview-hero">
        <div>
          <h1>Freight billing<br />workspace</h1>
          <p>Create invoices and credit or debit notes, or manage the templates your team uses.</p>
          <div className="overview-actions">
            <Link className="portal-action portal-action-primary" to="/invoices/create">Create invoice</Link>
            <Link className="portal-action portal-action-light" to="/crdr/create">Create credit / debit note</Link>
          </div>
        </div>
      </section>
      <section className="overview-modules" aria-label="Billing tools">
        <h2>Billing tools</h2>
        <div className="overview-grid">
          {modules.map(({ title, icon, path, description, action }) => (
            <article className="overview-card" key={path}>
              <span className="overview-card-icon"><PortalIcon name={icon} /></span>
              <h3><Link to={path}>{title}</Link></h3>
              <p>{description}</p>
              <Link className="overview-card-action" to={`${path}/create`}>{action}</Link>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

function Side({ location, navigate, EditWrapper }) {
  return (
    <Suspense fallback={<div className="portal-message" role="status">Loading workspace...</div>}>
      <Routes location={location}>
        <Route path="/" element={<Overview />} />
        <Route path="/invoices" element={<ListInvoice />} />
        <Route path="/invoices/create" element={<CreateInvoice />} />
        <Route path="/invoices/edit/:id" element={<EditInvoice />} />
        <Route path="/crdr" element={<ListCrdr />} />
        <Route path="/crdr/create" element={<CreateCrdr />} />
        <Route path="/crdr/edit/:id" element={<EditCrdr />} />
        <Route path="/crdr-templates" element={<ListCrdrTemplates />} />
        <Route path="/crdr-templates/create" element={<CreateCrdrTemplate />} />
        <Route path="/crdr-templates/edit/:id" element={<EditCrdrTemplate />} />
        <Route path="/templates" element={<ListInvoiceTemplate />} />
        <Route path="/templates/create" element={
          <CreateInvoiceTemplate onSave={(tpl) => {
            console.log('Saved template', tpl)
            alert('Saved (demo)')
            navigate('/templates')
          }} />
        } />
        <Route path="/templates/edit/:id" element={<EditWrapper />} />
        <Route path="*" element={<div className="portal-message"><h1>Page not found</h1><Link to="/">Return to overview</Link></div>} />
      </Routes>
    </Suspense>
  )
}

export default Side
