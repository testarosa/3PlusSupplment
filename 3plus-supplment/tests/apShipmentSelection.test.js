import assert from 'node:assert/strict'
import test from 'node:test'
import { chooseApShipment } from '../src/apShipmentSelection.js'

const master = { id: 'master', details: { masterBl: '001-1234' } }
const house = { id: 'house', details: { masterBl: '001-1234', houseBl: 'H-77' } }
const otherHouse = { id: 'other', details: { masterBl: '001-1234', houseBl: 'H-78' } }
const options = [house, otherHouse, master]

test('uses the extracted house bill even when the master is also present', () => {
  assert.equal(chooseApShipment(options, { hblNumber: ' h 77 ', mblNumber: '0011234' }), house)
})

test('selects the master record, not an associated house, for a master bill', () => {
  assert.equal(chooseApShipment(options, { mblNumber: '0011234' }), master)
})

test('does not guess a bill when the reference has multiple results', () => {
  assert.equal(chooseApShipment(options, {}), null)
  assert.equal(chooseApShipment(options, { hblNumber: 'H-99', mblNumber: '0011234' }), null)
})

test('automatically selects a sole result when the invoice has no bill number', () => {
  assert.equal(chooseApShipment([house], {}), house)
})

test('preserves a previous selection when searching the same reference again', () => {
  assert.equal(chooseApShipment(options, undefined, otherHouse.id), otherHouse)
})
