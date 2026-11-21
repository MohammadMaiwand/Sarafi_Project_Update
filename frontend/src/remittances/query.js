import { QueryClient } from '@tanstack/react-query'
export const remittanceQueryClient=new QueryClient({defaultOptions:{queries:{retry:1,staleTime:15000,refetchOnWindowFocus:true}}})
export async function invalidateRemittances(client){
 await Promise.all(['remittances','remittance','next-hawala','provincial-history','provincial-customers','provincial-people','provincial-person','provincial-entries','provincial-received-customers-summary','provincial-distribution-balance','customer-remaining','customer-transactions','dashboard'].map(key=>client.invalidateQueries({queryKey:[key]})))
 window.dispatchEvent(new Event('finance-updated'))
}
