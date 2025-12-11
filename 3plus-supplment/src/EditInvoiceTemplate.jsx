import React from 'react'
import CreateInvoiceTemplate from './CreateInvoiceTemplate'
import './CreateInvoiceTemplate.css'

function EditInvoiceTemplate({ template = {}, onSave, onCancel }) {
	return <CreateInvoiceTemplate template={template} onSave={onSave} onCancel={onCancel} />
}

export default EditInvoiceTemplate
