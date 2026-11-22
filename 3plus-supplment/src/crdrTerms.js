export const DEFAULT_CRDR_TERMS = 30

export function getCrdrPaymentTerms(invoiceDate, { dueDate, term } = {}) {
  if (dueDate) {
    const calendarDay = (date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
    const days = invoiceDate ? (calendarDay(dueDate) - calendarDay(invoiceDate)) / 86_400_000 : null
    return { term: days !== null && days >= 0 ? days : '', dueDate }
  }
  const supplied = term == null || String(term).trim() === '' ? NaN : Number(term)
  const days = Number.isInteger(supplied) && supplied >= 0 ? supplied : DEFAULT_CRDR_TERMS
  const calculated = invoiceDate ? new Date(invoiceDate) : null
  if (calculated) calculated.setDate(calculated.getDate() + days)
  return { term: days, dueDate: calculated }
}
