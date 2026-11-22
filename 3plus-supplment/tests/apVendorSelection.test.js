import assert from 'node:assert/strict'
import test from 'node:test'
import { chooseExtractedApVendor } from '../src/apVendorSelection.js'

const trucking = { id: 10, name: 'JUNG TRUCKING INC.' }
const logistics = { id: 20, name: 'JUNG LOGISTICS INC.' }

test('matches a unique full vendor name without requiring punctuation or case', () => {
  assert.equal(chooseExtractedApVendor([trucking, logistics], 'Jung   Trucking Inc'), trucking)
})

test('leaves the vendor code unresolved for a partial name or no lookup results', () => {
  assert.equal(chooseExtractedApVendor([trucking], 'Jung Trucking'), null)
  assert.equal(chooseExtractedApVendor([], trucking.name), null)
})

test('does not select an arbitrary code when multiple vendors have the same name', () => {
  const duplicate = { ...trucking, id: 30 }
  assert.equal(chooseExtractedApVendor([trucking, duplicate], trucking.name), null)
})
