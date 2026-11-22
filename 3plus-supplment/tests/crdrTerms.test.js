import assert from 'node:assert/strict'
import test from 'node:test'
import { getCrdrPaymentTerms } from '../src/crdrTerms.js'

const invoiceDate = new Date(2026, 10, 20)

test('defaults to 30 calendar days after the invoice date', () => {
  assert.deepEqual(getCrdrPaymentTerms(invoiceDate), { term: 30, dueDate: new Date(2026, 11, 20) })
  assert.equal(getCrdrPaymentTerms(invoiceDate, { term: '' }).term, 30)
})

test('preserves an explicit due date and calculates its terms', () => {
  const dueDate = new Date(2026, 10, 27)
  assert.deepEqual(getCrdrPaymentTerms(invoiceDate, { dueDate }), { term: 7, dueDate })
})

test('honors template terms including zero and waits for a missing invoice date', () => {
  assert.deepEqual(getCrdrPaymentTerms(invoiceDate, { term: 0 }), { term: 0, dueDate: invoiceDate })
  assert.equal(getCrdrPaymentTerms(invoiceDate, { term: '15' }).term, 15)
  assert.deepEqual(getCrdrPaymentTerms(null), { term: 30, dueDate: null })
})
