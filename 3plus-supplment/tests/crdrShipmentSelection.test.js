import assert from 'node:assert/strict'
import test from 'node:test'
import { chooseCrdrAirBill, chooseCrdrShipmentBill, getCrdrAirBills } from '../src/crdrShipmentSelection.js'

const options = { master: 'M-123', houses: ['HOUSE-A', 'HOUSE-B'] }

test('selects the house BL read from the note, not the first result', () => {
  assert.equal(chooseCrdrShipmentBill({ ...options, extracted: { hblNumber: 'house b' } }), 'HOUSE-B')
})

test('requires manual selection when an extracted bill is absent or does not match', () => {
  assert.equal(chooseCrdrShipmentBill({ ...options, extracted: {} }), '')
  assert.equal(chooseCrdrShipmentBill({ ...options, extracted: { hblNumber: 'H-99' } }), '')
  assert.equal(chooseCrdrShipmentBill({ ...options, houses: ['H-1', 'H1'], extracted: { hblNumber: 'H1' } }), '')
})

test('selects the sole bill for a reference with no extracted house BL', () => {
  assert.equal(chooseCrdrShipmentBill({ master: 'M-123', houses: [], extracted: {} }), 'M-123')
})

test('manual lookup still prefers the prepared bill or the first house bill', () => {
  assert.equal(chooseCrdrShipmentBill({ ...options, preparedBill: 'HOUSE-B' }), 'HOUSE-B')
  assert.equal(chooseCrdrShipmentBill(options), 'HOUSE-A')
})

test('keeps air shipment table and ID for the selected airway bill', () => {
  const bills = getCrdrAirBills({
    master: { id: 1, billNumber: '180-61209875' },
    houses: [{ id: 2, billNumber: 'RMS2610240' }, { id: 3, billNumber: 'OTHER-AWB' }],
  })
  const reference = 'AI7175758'
  assert.equal(chooseCrdrAirBill(bills, { search: reference, reference }), '')
  const bill = chooseCrdrAirBill(bills, { search: 'RMS2610240', reference })
  assert.deepEqual(bills.find((row) => row.billNumber === bill), { id: 2, billNumber: 'RMS2610240', table: 'T_AIHMAIN' })
  assert.equal(chooseCrdrAirBill(bills, { search: '180 6120 9875', reference }), '180-61209875')
  assert.equal(bills[0].table, 'T_AIMMAIN')
})

test('does not choose among duplicate source records for the same air bill', () => {
  const bills = getCrdrAirBills({
    master: { id: 1, billNumber: 'M' },
    houses: [{ id: 2, billNumber: 'DUP' }, { id: 3, billNumber: 'DUP' }],
  })
  assert.equal(chooseCrdrAirBill(bills, { search: 'DUP', reference: 'AI123', extracted: { hblNumber: 'DUP' } }), '')
})
