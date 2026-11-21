export const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')
import { authHeaders, handleAuthResponse } from './utils/authSession'

async function request(path, options = {}) {
  let response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...authHeaders(path), ...options.headers },
    })
  } catch {
    throw new Error('network')
  }
  let data = {}
  handleAuthResponse(response,path)
  try { data = await response.json() } catch { /* Empty response body. */ }
  if (!response.ok) {
    const error = new Error(data.message || Object.entries(data).map(([field, messages]) => `${field}: ${Array.isArray(messages) ? messages.join(' ') : messages}`).join(' ') || 'request')
    error.status = response.status
    error.fields = data && typeof data === 'object' ? data : {}
    throw error
  }
  return data
}

const post = (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) })
export const loginUser = (username, password) => post('/login/', { username, password })
export const getUsers = () => request('/users/')
export const createUser = (username, password) => post('/users/create/', { username, password })
export const changePassword = (username, old_password, new_password) => post('/users/change-password/', { username, old_password, new_password })
export const getCustomers = () => request('/customers/')
export const createCustomer = (data) => post('/customers/', data)
export const getCustomer = (id) => request(`/customers/${id}/`)
export const updateCustomer = (id, data) => request(`/customers/${id}/`, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteCustomer = (id) => request(`/customers/${id}/`, { method: 'DELETE' })
export const getCustomerTransactions = (id) => request(`/customers/${id}/transactions/`)
export const getTransactions = () => request('/transactions/')
export const createTransaction = (data) => post('/transactions/', data)
export const getTransaction = (id) => request(`/transactions/${id}/`)
export const updateTransaction = (id, data) => request(`/transactions/${id}/`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteTransaction = (id) => request(`/transactions/${id}/`, { method: 'DELETE' })
export const getNextVoucherNumber = () => request('/transactions/next-voucher/')
export const getDashboardStats = (month) => request(`/dashboard/stats/?calendar=afghan&month=${encodeURIComponent(month)}`)
