import { normalizeShipmentBill } from './shipmentBill.js'

export function chooseApShipment(options, extracted, previousId) {
  const previous = options.find((option) => option.id === previousId)
  const house = normalizeShipmentBill(extracted?.hblNumber)
  const master = normalizeShipmentBill(extracted?.mblNumber)
  if (house || master) {
    const matches = options.filter(({ details }) => house
      ? normalizeShipmentBill(details.houseBl) === house
      : !details.houseBl && normalizeShipmentBill(details.masterBl) === master)
    return matches.length === 1 ? matches[0] : previous ?? null
  }
  return previous ?? (options.length === 1 ? options[0] : null)
}
