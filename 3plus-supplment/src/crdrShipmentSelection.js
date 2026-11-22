import { normalizeShipmentBill } from './shipmentBill.js'

export function chooseCrdrShipmentBill({ master, houses, extracted, preparedBill }) {
  const houseBills = [...new Set(houses)]
  const bills = [...new Set([master, ...houseBills].filter(Boolean))]
  const extractedBill = normalizeShipmentBill(extracted?.hblNumber)
  if (extractedBill) {
    const matches = houseBills.filter((bill) => normalizeShipmentBill(bill) === extractedBill)
    return matches.length === 1 ? matches[0] : ''
  }
  if (bills.includes(preparedBill)) return preparedBill
  return extracted ? (bills.length === 1 ? bills[0] : '') : houseBills[0] || master || ''
}

export function getCrdrAirBills(shipment) {
  const billWithSource = ({ id, billNumber }, table) => ({
    id, billNumber: String(billNumber ?? '').trim(), table,
  })
  const bills = [
    billWithSource(shipment.master, 'T_AIMMAIN'),
    ...shipment.houses.map((bill) => billWithSource(bill, 'T_AIHMAIN')),
  ].filter((bill) => bill.billNumber && Number.isInteger(bill.id) && bill.id > 0)
  const counts = new Map()
  for (const bill of bills) counts.set(bill.billNumber, (counts.get(bill.billNumber) ?? 0) + 1)
  return bills.filter((bill) => counts.get(bill.billNumber) === 1)
}

export function chooseCrdrAirBill(bills, { search, reference, extracted, preparedBill }) {
  if (!normalizeShipmentBill(extracted?.hblNumber) && search !== reference) {
    const direct = bills.filter((bill) => normalizeShipmentBill(bill.billNumber) === normalizeShipmentBill(search))
    if (direct.length === 1) return direct[0].billNumber
  }
  return chooseCrdrShipmentBill({
    master: bills.find((bill) => bill.table === 'T_AIMMAIN')?.billNumber,
    houses: bills.filter((bill) => bill.table === 'T_AIHMAIN').map((bill) => bill.billNumber),
    extracted: extracted ?? {},
    preparedBill,
  })
}
