import assert from 'node:assert/strict'
import test from 'node:test'
import { getInvoiceTermDays } from '../src/billingDates.js'

test('counts calendar days, including across leap days and daylight saving changes', () => {
  assert.equal(getInvoiceTermDays('2024-02-28', '2024-03-01'), 2)
  assert.equal(getInvoiceTermDays('2026-03-07', '2026-03-09'), 2)
})

test('returns zero for same-day terms and a negative result when the due date is earlier', () => {
  assert.equal(getInvoiceTermDays('2026-11-22', '2026-11-22'), 0)
  assert.equal(getInvoiceTermDays('2026-11-22', '2026-11-20'), -2)
})

test('defaults to zero when the due date is absent', () => {
  assert.equal(getInvoiceTermDays('2026-11-22', ''), 0)
  assert.equal(getInvoiceTermDays('2026-11-22', null), 0)
  assert.equal(getInvoiceTermDays('', undefined), 0)
})

test('does not calculate terms if a supplied date is invalid or the invoice date is missing', () => {
  assert.equal(getInvoiceTermDays('', '2026-03-02'), null)
  assert.equal(getInvoiceTermDays('2026-02-29', '2026-03-02'), null)
})
