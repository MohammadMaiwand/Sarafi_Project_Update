import { API_BASE } from './api'
import { authHeaders, handleAuthResponse } from './utils/authSession'

async function request(path, options = {}) {
  let response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...authHeaders(path), ...options.headers },
    })
  } catch {
    throw new Error('ارتباط با سرور برقرار نشد.')
  }
  let data = {}
  handleAuthResponse(response,path)
  try { data = await response.json() } catch { /* Empty response. */ }
  if (!response.ok) {
    const error = new Error(data.message || 'درخواست انجام نشد.')
    error.status = response.status
    error.code = data.code
    error.details = data
    throw error
  }
  return data
}

const get = (path) => request(path)
const post = (path, data) => request(path, { method: 'POST', body: JSON.stringify(data) })
const patch = (path, data) => request(path, { method: 'PATCH', body: JSON.stringify(data) })
const put = (path, data) => request(path, { method: 'PUT', body: JSON.stringify(data) })
const remove = (path) => request(path, { method: 'DELETE' })

export const listExpenses = (month) => get(`/expenses/?calendar=afghan&month=${encodeURIComponent(month)}`)
export const nextExpenseNumber = (year) => get(`/expenses/next-number/?year=${year || ''}`)
export const saveExpense = (data, id) => id ? patch(`/expenses/${id}/`, data) : post('/expenses/', data)
export const deleteExpense = (id) => remove(`/expenses/${id}/`)

export const listMudarabah = (month) => get(`/mudarabah/?calendar=afghan&month=${encodeURIComponent(month)}`)
export const nextMudarabahNumber = (year) => get(`/mudarabah/next-number/?year=${year || ''}`)
export const saveMudarabah = (data, id) => id ? patch(`/mudarabah/${id}/`, data) : post('/mudarabah/', data)
export const deleteMudarabah = (id) => remove(`/mudarabah/${id}/`)

export const listDebtors = (type) => get(`/debtors/?type=${encodeURIComponent(type || '')}`)
export const nextDebtorNumber = (year) => get(`/debtors/next-number/?year=${year || ''}`)
export const saveDebtor = (data, id) => id ? patch(`/debtors/${id}/`, data) : post('/debtors/', data)
export const getDebtor = (id) => get(`/debtors/${id}/`)
export const deleteDebtor = (id) => remove(`/debtors/${id}/`)
export const saveDebtPayment = (id, data, paymentId) => paymentId ? put(`/debtors/${id}/payments/${paymentId}/`, data) : post(`/debtors/${id}/payments/`, data)
export const deleteDebtPayment = (id, paymentId) => remove(`/debtors/${id}/payments/${paymentId}/`)

export const listDeposits = (type = '') => get(`/customer-deposits/?type=${encodeURIComponent(type)}`)
export const nextDepositNumber = (type, year) => get(`/customer-deposits/next-number/?type=${encodeURIComponent(type)}&year=${year || ''}`)
export const saveDeposit = (data, id) => id ? patch(`/customer-deposits/${id}/`, data) : post('/customer-deposits/', data)
export const getDeposit = (id) => get(`/customer-deposits/${id}/`)
export const deleteDeposit = (id) => remove(`/customer-deposits/${id}/`)
export const listDepositWithdrawals = (id) => get(`/customer-deposits/${id}/withdrawals/`)
export const saveDepositWithdrawal = (id, data, withdrawalId) => withdrawalId ? put(`/customer-deposits/${id}/withdrawals/${withdrawalId}/`, data) : post(`/customer-deposits/${id}/withdrawals/`, data)
export const deleteDepositWithdrawal = (id, withdrawalId) => remove(`/customer-deposits/${id}/withdrawals/${withdrawalId}/`)

export const getFinanceSummary = (month) => get(`/finance/summary/?calendar=afghan&month=${encodeURIComponent(month)}`)
