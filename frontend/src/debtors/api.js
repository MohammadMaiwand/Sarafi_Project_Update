import { remittanceRequest as api } from '../remittanceApi'
const query=params=>new URLSearchParams(Object.entries(params||{}).filter(([,value])=>value!==''&&value!=null)).toString()
export const fetchDebtors=(params,signal)=>api(`/debtors/?${query(params)}`,null,'GET',signal)
export const fetchDebtor=(id,signal)=>api(`/debtors/${id}/`,null,'GET',signal)
export const fetchPayments=(id,signal)=>api(`/debtors/${id}/payments/`,null,'GET',signal)
export const saveDebtor=(values,id)=>api(id?`/debtors/${id}/`:'/debtors/',values,id?'PATCH':'POST')
export const deleteDebtor=id=>api(`/debtors/${id}/`,null,'DELETE')
export const savePayment=(id,values,paymentId)=>api(`/debtors/${id}/payments/${paymentId?`${paymentId}/`:''}`,values,paymentId?'PATCH':'POST')
export const deletePayment=(id,paymentId)=>api(`/debtors/${id}/payments/${paymentId}/`,null,'DELETE')
export const nextNumber=signal=>api('/debtors/next-number/',null,'GET',signal)
export async function invalidateDebtors(client){
 await Promise.all(['debtor-customers','debtor-customer','debtor-payment-history','debtor-next-number','dashboard'].map(key=>client.invalidateQueries({queryKey:[key]})))
 window.dispatchEvent(new Event('finance-updated'))
}
