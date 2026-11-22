import assert from 'node:assert/strict'
import test from 'node:test'
import { getCrdrCreateBlocker, getCrdrCurrencyBlocker, getCrdrHouseBillNotice, getCrdrShipmentBlocker } from '../src/crdrReview.js'

const imported = { kind: 'import', houseBill: 'RMS2610240' }
const matched = { hasShipment: true, reference: 'AI7175758', bill: 'RMS2610240' }

test('imported charges can be reviewed but not saved without a linked shipment', () => {
  assert.match(getCrdrShipmentBlocker(imported, { ...matched, hasShipment: false }), /Find a shipment/)
  assert.equal(getCrdrShipmentBlocker(imported, matched), '')
})

test('an imported house bill mismatch is a notice, not a blocker', () => {
  const otherBill = { ...matched, bill: 'OTHER' }
  assert.equal(getCrdrShipmentBlocker(imported, otherBill), '')
  assert.match(getCrdrHouseBillNotice(imported, otherBill), /RMS2610240.*OTHER/)
  assert.equal(getCrdrHouseBillNotice(imported, { ...matched, bill: 'rms-2610240' }), '')
  assert.equal(getCrdrHouseBillNotice({ kind: 'import' }, matched), '')
})

test('template charges stay tied to the original shipment while manual lines can be linked later', () => {
  const template = { kind: 'template', reference: matched.reference, bl: matched.bill }
  assert.equal(getCrdrShipmentBlocker(template, matched), '')
  assert.match(getCrdrShipmentBlocker(template, { ...matched, reference: 'OTHER' }), /original shipment/)
  assert.equal(getCrdrShipmentBlocker({ kind: 'manual' }, matched), '')
})

test('a non-USD note cannot be applied to the USD form', () => {
  assert.match(getCrdrCurrencyBlocker({ currency: 'EUR' }), /Only USD/)
  assert.equal(getCrdrCurrencyBlocker({ currency: ' usd ' }), '')
})

test('allows a complete ocean invoice and explains why an incomplete invoice cannot be created', () => {
  const source = { kind: 'import', houseBill: 'HOUSE-123' }
  const ready = {
    shipment: { hasShipment: true, reference: 'SI71760838', bill: 'HOUSE-123' },
    agentId: 5, invoiceDate: '2026-11-22', hasCharge: true,
  }
  assert.equal(getCrdrCreateBlocker(source, ready), '')
  assert.equal(getCrdrCreateBlocker(source, { ...ready, shipment: { ...ready.shipment, bill: 'HOUSE-321' } }), '')
  assert.match(getCrdrCreateBlocker(source, { ...ready, hasCharge: false }), /nonzero debit or credit/)
  assert.match(getCrdrCreateBlocker(source, { ...ready, agentId: 0 }), /Select an agent/)
  assert.match(getCrdrCreateBlocker(source, { ...ready, invoiceDate: null }), /invoice date/)
})
