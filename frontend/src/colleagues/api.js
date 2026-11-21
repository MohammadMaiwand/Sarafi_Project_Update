import { remittanceRequest as api } from '../remittanceApi'
const query=params=>new URLSearchParams(Object.entries(params||{}).filter(([,value])=>value!==''&&value!=null)).toString()
export const fetchColleagues=(params,signal)=>api(`/colleagues/?${query(params)}`,null,'GET',signal)
export const fetchColleague=(id,signal)=>api(`/colleagues/${id}/`,null,'GET',signal)
export const saveColleague=(values,id)=>api(id?`/colleagues/${id}/`:'/colleagues/',values,id?'PATCH':'POST')
export const deleteColleague=id=>api(`/colleagues/${id}/`,null,'DELETE')
export const fetchHistory=(id,params,signal)=>api(`/colleagues/${id}/transactions/?${query(params)}`,null,'GET',signal)
export const fetchTransaction=(id,txId,signal)=>api(`/colleagues/${id}/transactions/${txId}/`,null,'GET',signal)
export const saveTransaction=(id,values,txId)=>api(`/colleagues/${id}/transactions/${txId?`${txId}/`:''}`,values,txId?'PATCH':'POST')
export const deleteTransaction=(id,txId)=>api(`/colleagues/${id}/transactions/${txId}/`,null,'DELETE')
export const nextNumber=(id,date,signal)=>api(id?`/colleagues/${id}/transactions/next-number/?${query({date})}`:'/colleagues/next-number/',null,'GET',signal)
export async function invalidateColleagues(client){
 await Promise.all(['colleagues','colleague','colleague-transactions-history','colleague-transaction','colleague-next-person','colleague-next-tx','dashboard'].map(key=>client.invalidateQueries({queryKey:[key]})))
 window.dispatchEvent(new Event('finance-updated'))
}

// Documented service names, backed by the same validated endpoints.
export const createColleague=values=>saveColleague(values)
export const updateColleague=(id,values)=>saveColleague(values,id)
export const fetchColleagueTransactionHistory=fetchHistory
export const fetchColleaguePersonTransaction=fetchTransaction
export const createColleaguePersonTransaction=(id,values)=>saveTransaction(id,values)
export const updateColleaguePersonTransaction=(id,txId,values)=>saveTransaction(id,values,txId)
export const deleteColleaguePersonTransaction=deleteTransaction
