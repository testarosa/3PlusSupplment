const normalizeName = (value) => value.trim().toUpperCase().replace(/[.,]/g, '').replace(/\s+/g, ' ')

export function chooseExtractedApVendor(vendors, extractedName) {
  const name = normalizeName(extractedName)
  if (!name) return null
  const matches = vendors.filter((vendor) => normalizeName(vendor.name) === name)
  return matches.length === 1 ? matches[0] : null
}
