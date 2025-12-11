import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import CreateInvoice from './CreateInvoice'

export default function EditInvoice() {
  const location = useLocation()
  const navigate = useNavigate()
  // location.state may contain the invoice object passed from the list
  const invoice = location.state ?? null

  return (
    <section>
      <CreateInvoice initialData={invoice || {}} title="Edit Invoice" onCancel={() => navigate('/invoices')} />
    </section>
  )
}
