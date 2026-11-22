export function updateApExtractedBillingCodes(lines, extractionId, code) {
  if (!extractionId) return lines
  return lines.map((line) => {
    if (line.extractionId !== extractionId || (!code && !line.hasDefaultBillingCode)) return line
    return {
      ...line,
      billingCode: code || line.extractedBillingCode,
      hasDefaultBillingCode: Boolean(code),
    }
  })
}
