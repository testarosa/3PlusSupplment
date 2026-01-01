import axios from 'axios'

const BASE_URL = 'http://192.168.20.240:5048'

export async function getInvoiceByRef(referenceNumber) {
  if (!referenceNumber) {
    throw new Error('Reference number is required')
  }

  const endpoint = `${BASE_URL}/Invoice/GetInvoice/${encodeURIComponent(referenceNumber)}`

  const resp = await axios.get(endpoint, { headers: { accept: 'text/plain, application/json' } })
  let data = resp?.data

  if (typeof data === 'string') {
    try {
      data = JSON.parse(data)
    } catch (err) {
      // leave as string if parsing fails
    }
  }

  return data
}
