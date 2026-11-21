import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deleteRemittance, fetchDistributionPeople } from '../remittanceApi'
import { invalidateRemittances } from './query'
import { RemittanceActions, ConfirmDelete } from './UI'

export function useRemittanceActions(kind){
 const navigate=useNavigate(),location=useLocation(),client=useQueryClient(),[deleting,setDeleting]=useState(null),[actionError,setActionError]=useState(null),[finding,setFinding]=useState(false)
 const deletion=useMutation({mutationFn:id=>deleteRemittance(kind,id),onSuccess:async()=>{setDeleting(null);await invalidateRemittances(client)}})
 async function remaining(row){
  setActionError(null);setFinding(true)
  try{
   if(row.recipientName){const people=await fetchDistributionPeople({name:row.recipientName});if(people.results.length){navigate(`/provincial-received/distributions/${people.results[0].id}/entries/new`);return}}
   navigate(`/provincial-received/distributions/new?${new URLSearchParams({customer:row.recipientName||'',father:row.recipientFatherName||''})}`)
  }catch(error){setActionError(error)}finally{setFinding(false)}
 }
 return {actionError,actions:row=><RemittanceActions kind={kind} row={row} onDelete={row=>{deletion.reset();setDeleting(row)}} onRemaining={remaining} pending={finding}/>,confirmation:deleting&&<ConfirmDelete number={deleting.hawalaNumber} pending={deletion.isPending} error={deletion.error} onClose={()=>setDeleting(null)} onConfirm={()=>deletion.mutate(deleting.id,{onSuccess:()=>{if(location.pathname===`/${kind}/${deleting.id}`)navigate(`/${kind}`)}})}/>}
}
