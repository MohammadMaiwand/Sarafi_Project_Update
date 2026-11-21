import {remittanceRequest} from './remittanceApi'
export const provinceQuery=params=>new URLSearchParams(Object.entries(params||{}).filter(([,value])=>value!==''&&value!=null)).toString()
export const provincialRequest=(path,data,method)=>remittanceRequest(path,data,method)
export async function settlementTargets(filters){
 const first=await remittanceRequest(`/provincial/remittances/?${provinceQuery({...filters,page:1,pageSize:100})}`)
 const remaining=await Promise.all(Array.from({length:Math.max(0,first.totalPages-1)},(_,index)=>remittanceRequest(`/provincial/remittances/?${provinceQuery({...filters,page:index+2,pageSize:100})}`)))
 return {...first,results:[...first.results,...remaining.flatMap(page=>page.results)]}
}
