import axios from 'axios'
import { PLUS_SERVICE_PATH } from './config'

export async function findBillingUsers(search, signal) {
  const { data } = await axios.get(PLUS_SERVICE_PATH + '/api/billing-users', {
    params: { search }, signal, timeout: 10_000,
  })
  if (!Array.isArray(data)) throw new Error('Invalid user suggestions.')
  return data
}
