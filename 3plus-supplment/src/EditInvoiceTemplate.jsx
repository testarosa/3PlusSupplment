import React, { Suspense } from 'react'
import './CreateInvoiceTemplate.css'

const CreateInvoiceTemplate = React.lazy(() => import('./CreateInvoiceTemplate'))

function EditInvoiceTemplate({ template = {}, onSave, onCancel }) {
	return (
		<Suspense fallback={<div>Loading…</div>}>
			<CreateInvoiceTemplate template={template} onSave={onSave} onCancel={onCancel} />
		</Suspense>
	)
}

export default EditInvoiceTemplate
