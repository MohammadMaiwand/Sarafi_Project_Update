import { API_BASE } from './api'
import { authHeaders, handleAuthResponse } from './utils/authSession'
export async function remittanceRequest(path, data, method, signal) {
 let response
 try {
  response=await fetch(`${API_BASE}${path}`,{method:method||(data?'POST':'GET'),signal,headers:{'Content-Type':'application/json',...authHeaders(path)},...(data?{body:JSON.stringify(data)}:{})})
 } catch(error) {
  if(error.name==='AbortError') throw error
  throw new Error('ارتباط با سرور برقرار نشد.')
 }
 handleAuthResponse(response,path)
 const result=response.status===204?{}:await response.json().catch(()=>({message:'پاسخ سرور معتبر نیست.'}))
 if(!response.ok){const error=new Error(result.message||result.detail||'درخواست انجام نشد.');error.status=response.status;error.fields=result;throw error}
 return result
}
const queryString=params=>new URLSearchParams(Object.entries(params||{}).filter(([,value])=>value!==''&&value!=null)).toString()
export const fetchRemittances=(kind,params,signal)=>remittanceRequest(`/${kind}/?${queryString(params)}`,null,'GET',signal)
export const fetchRemittance=(kind,id,signal)=>remittanceRequest(`/${kind}/${id}/`,null,'GET',signal)
export const fetchNextHawalaNumber=(kind,date,signal)=>remittanceRequest(`/${kind}/next-number/?${queryString({date})}`,null,'GET',signal)
export const createRemittance=(kind,values)=>remittanceRequest(`/${kind}/`,values)
export const updateRemittance=(kind,id,values)=>remittanceRequest(`/${kind}/${id}/`,values,'PATCH')
export const deleteRemittance=(kind,id)=>remittanceRequest(`/${kind}/${id}/`,null,'DELETE')
export const fetchRemittanceOptions=signal=>remittanceRequest('/remittances/options/',null,'GET',signal)
export const fetchCustomerHistory=(name,sourceId,params,signal)=>remittanceRequest(`/provincial-received/${sourceId?`customer-by-id/${sourceId}`:`customer/${encodeURIComponent(name)}`}/?${queryString(params)}`,null,'GET',signal)
export const fetchCustomerSummary=(params,signal)=>remittanceRequest(`/provincial-received/customers/?${queryString(params)}`,null,'GET',signal)
export const fetchDistributionPeople=(params,signal)=>remittanceRequest(`/provincial-received/distributions/?${queryString(params)}`,null,'GET',signal)
export const fetchDistributionPerson=(id,signal)=>remittanceRequest(`/provincial-received/distributions/${id}/`,null,'GET',signal)
export const fetchDistributionEntries=(personId,params,signal)=>remittanceRequest(`${personId?`/provincial-received/distributions/${personId}/entries/`:'/provincial-distributions/'}?${queryString(params)}`,null,'GET',signal)
// Compatibility exports for the documented module service names.
export const fetchIncomingRemittances=(params,signal)=>fetchRemittances('incoming',params,signal)
export const fetchOutgoingRemittances=(params,signal)=>fetchRemittances('outgoing',params,signal)
export const fetchProvincialReceivedRemittances=(params,signal)=>fetchRemittances('provincial-received',params,signal)
export const fetchNextIncomingHawalaNumber=(date,signal)=>fetchNextHawalaNumber('incoming',date,signal)
export const createIncomingRemittance=values=>createRemittance('incoming',values)
export const createOutgoingRemittance=values=>createRemittance('outgoing',values)
export const createProvincialReceivedRemittance=values=>createRemittance('provincial-received',values)
export const deleteIncomingRemittance=id=>deleteRemittance('incoming',id)
export const deleteOutgoingRemittance=id=>deleteRemittance('outgoing',id)
export const fetchProvincialReceivedRemittance=(id,signal)=>fetchRemittance('provincial-received',id,signal)

// Complete customer ledger: do not silently truncate after the first 100 records.
export async function fetchProvincialCustomerLedger(name,sourceId,signal){
 const first=await fetchCustomerHistory(name,sourceId,{page:1,pageSize:100},signal)
 const rows=[...first.results]
 for(let page=2;page<=first.totalPages;page++){
  const next=await fetchCustomerHistory(name,sourceId,{page,pageSize:100},signal)
  rows.push(...next.results)
 }
 return {...first,results:rows,loadedCount:rows.length}
}
export const updateProvincialReceivedCustomer=values=>remittanceRequest('/provincial-received/customer/',values,'PUT')
export const fetchProvincialReceivedCustomersSummary=({year,month},signal)=>remittanceRequest(`/provincial-received/customers-summary/?${queryString({year,month})}`,null,'GET',signal)
export const fetchCustomerRemaining=(id,signal)=>remittanceRequest(`/provincial-customers/${id}/remaining/`,null,'GET',signal)
export const fetchCustomerTransactions=(id,signal)=>remittanceRequest(`/provincial-customers/${id}/transactions/`,null,'GET',signal)
export const createRemainingTransaction=values=>remittanceRequest('/provincial-remaining-transactions/',values)
