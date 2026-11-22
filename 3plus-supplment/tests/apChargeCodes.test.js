import assert from 'node:assert/strict'
import test from 'node:test'
import { updateApExtractedBillingCodes } from '../src/apChargeCodes.js'

const blank = { extractionId: 'import-1', billingCode: '', extractedBillingCode: '', amount: '50' }
const extracted = { extractionId: 'import-1', billingCode: 'OTHER', extractedBillingCode: 'OTHER' }
const manual = { billingCode: 'MANUAL' }
const unrelated = { ...extracted, extractionId: 'import-2' }
const lines = [blank, extracted, manual, unrelated]

test('applies the selected code to every line of only the current extraction', () => {
  const result = updateApExtractedBillingCodes(lines, 'import-1', 'COIOTHER')
  assert.deepEqual(result.map((line) => line.billingCode), ['COIOTHER', 'COIOTHER', 'MANUAL', 'OTHER'])
  assert.equal(result[0].amount, '50')
  assert.equal(result[2], manual)
  assert.equal(result[3], unrelated)
})

test('clearing the default restores original codes without reverting individual edits', () => {
  const result = updateApExtractedBillingCodes(lines, 'import-1', 'COIOTHER')
  assert.deepEqual(updateApExtractedBillingCodes(result, 'import-1', '').map((line) => line.billingCode),
    ['', 'OTHER', 'MANUAL', 'OTHER'])
  const edited = { ...result[1], billingCode: 'CUSTOM', hasDefaultBillingCode: false }
  const cleared = updateApExtractedBillingCodes([result[0], edited], 'import-1', '')
  assert.equal(cleared[1], edited)
})
