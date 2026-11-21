import { useCallback, useEffect, useState } from 'react'
import { API_BASE } from '../api'
import { authHeaders, SESSION_EXPIRED } from '../utils/authSession'

export default function useAuth() {
 const [username,setUsername]=useState('')
 const [checking,setChecking]=useState(()=>Boolean(sessionStorage.getItem('app_token')))
 const logout=useCallback(()=>{sessionStorage.removeItem('app_token');localStorage.removeItem('app_username');setUsername('');setChecking(false)},[])
 const login=useCallback(name=>{localStorage.setItem('app_username',name);setUsername(name);setChecking(false)},[])
 useEffect(()=>{
  let active=true
  const controller=new AbortController(),expired=()=>logout()
  window.addEventListener(SESSION_EXPIRED,expired)
  if(sessionStorage.getItem('app_token')){
   fetch(`${API_BASE}/session/`,{headers:authHeaders(),signal:controller.signal}).then(async response=>{
    if(!active)return
    if(response.status===401){logout();return}
    if(!response.ok)throw new Error('session')
    const data=await response.json();if(active)login(data.username)
   }).catch(error=>{if(active&&error.name!=='AbortError')setChecking(false)}).finally(()=>{if(active)setChecking(false)})
  }else setChecking(false)
  return()=>{active=false;controller.abort();window.removeEventListener(SESSION_EXPIRED,expired)}
 },[login,logout])
 return {username,login,logout,switchAccount:logout,checking,isAuthenticated:!checking&&Boolean(username)}
}
