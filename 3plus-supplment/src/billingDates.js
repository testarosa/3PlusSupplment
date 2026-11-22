const formatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' })

export function isBillingCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(value)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function getInvoiceTermDays(invoiceDate, dueDate) {
  if (dueDate == null || dueDate === '') return 0
  if (!isBillingCalendarDate(invoiceDate) || !isBillingCalendarDate(dueDate)) return null
  return (Date.parse(dueDate) - Date.parse(invoiceDate)) / 86_400_000
}

export function formatBillingDate(value) {
  if (!value) return '-'
  const calendarDate = typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}(?=$|[T ])/)
  const date = new Date(calendarDate ? calendarDate[0] + 'T00:00:00Z' : value)
  return Number.isNaN(date.getTime()) ? '-' : formatter.format(date)
}
