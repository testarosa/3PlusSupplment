import { normalizeShipmentBill } from './shipmentBill.js'

export function getCrdrCurrencyBlocker(draft) {
  return draft?.currency && draft.currency.trim().toUpperCase() !== 'USD'
    ? 'This form saves in USD. Only USD notes can be imported.'
    : ''
}

export function getCrdrShipmentBlocker(source, { hasShipment, reference, bill }) {
  if (!source) return ''
  if (!hasShipment) return 'Find a shipment and select its bill before creating the invoice.'
  if (source.kind === 'template' && (source.reference !== reference || source.bl !== bill)) {
    return 'Restore the original shipment and bill, or populate a template for the new selection.'
  }
  return ''
}

export function getCrdrHouseBillNotice(source, { hasShipment, bill }) {
  if (!hasShipment || source?.kind !== 'import') return ''
  const houseBill = normalizeShipmentBill(source.houseBill)
  return houseBill && houseBill !== normalizeShipmentBill(bill)
    ? `Imported house B/L: ${source.houseBill.trim()}. This invoice will be linked to the selected B/L: ${bill}.`
    : ''
}

export function getCrdrCreateBlocker(source, { shipment, agentId, invoiceDate, hasCharge }) {
  if (!source) return 'Import, populate, or enter charges before creating the invoice.'
  return getCrdrShipmentBlocker(source, shipment) ||
    (!(Number(agentId) > 0) ? 'Select an agent from the suggestions.'
      : !invoiceDate ? 'Enter the invoice date before creating the invoice.'
        : !hasCharge ? 'Enter at least one charge with a description and a nonzero debit or credit.' : '')
}
