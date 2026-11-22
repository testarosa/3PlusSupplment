export function getApDraftKey(user) {
  const account = user?.userId ?? user?.userID ?? user?.UserId ?? user?.UserID ??
    user?.id ?? user?.Id ?? user?.userName ?? user?.username ?? user?.name ?? user?.F_UserName
  return account != null && account !== '' ? '3plus.ap-invoice.draft.' + account : null
}

export function readApDrafts(key) {
  if (!key) return []
  const stored = JSON.parse(sessionStorage.getItem(key))
  if (stored == null) return []
  if (Array.isArray(stored)) return stored
  if (stored.lookup?.shipment && stored.invoice && Array.isArray(stored.lines)) {
    return [{ ...stored, id: 'legacy' }]
  }
  throw new Error('Unrecognized AP draft storage')
}

export function removeApDraft(key, id) {
  if (!key || !id) return
  sessionStorage.setItem(key, JSON.stringify(readApDrafts(key).filter((entry) => entry.id !== id)))
}

export function getApInvoiceTotals(invoice, lines) {
  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: invoice.currency })
  const factor = 10 ** money.resolvedOptions().maximumFractionDigits
  const total = lines.reduce((sum, line) => sum + Math.round(Number(line.amount) * factor), 0) / factor
  return { factor, total, displayTotal: money.format(total) + ' ' + invoice.currency }
}
