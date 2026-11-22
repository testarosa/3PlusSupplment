export function normalizeShipmentBill(value) {
  return String(value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '')
}
