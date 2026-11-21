export const portalSections = [
  { label: 'Workspace', links: [{ label: 'Overview', to: '/', icon: 'overview' }] },
  { label: 'Billing', links: [
    { label: 'Invoices', to: '/invoices', icon: 'invoice' },
    { label: 'Credit / Debit Notes', to: '/crdr', icon: 'notes' },
  ] },
  { label: 'Templates', links: [
    { label: 'Invoice Templates', to: '/templates', icon: 'template' },
    { label: 'Credit / Debit Templates', to: '/crdr-templates', icon: 'template' },
  ] },
]

const icons = {
  overview: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  invoice: 'M6 3h9l4 4v14H6z M14 3v5h5 M9 12h7 M9 16h7',
  notes: 'M5 3h14v18H5z M8 8h4 M10 6v4 M12 15h4',
  template: 'M8 3h12v14H8z M4 7v14h12 M11 7h6 M11 11h6',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  close: 'M5 5l14 14 M19 5 5 19',
}

export function PortalIcon({ name }) {
  return <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={icons[name]} /></svg>
}
