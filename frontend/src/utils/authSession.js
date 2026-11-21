export const SESSION_EXPIRED='amiri-session-expired'
export function authHeaders(path='') {
 const token=sessionStorage.getItem('app_token')
 return token&&!path.startsWith('/login/')?{Authorization:`Token ${token}`} : {}
}
export function handleAuthResponse(response,path='') {
 if(response.status===401&&!path.startsWith('/login/')){
  sessionStorage.removeItem('app_token');localStorage.removeItem('app_username')
  window.dispatchEvent(new Event(SESSION_EXPIRED))
 }
}
