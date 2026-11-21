import {createServer} from 'vite'
import react from '@vitejs/plugin-react'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {MemoryRouter} from 'react-router-dom'
import assert from 'node:assert/strict'
const server=await createServer({configFile:false,cacheDir:'node_modules/.vite-ledger-verification',plugins:[react()],server:{middlewareMode:true},appType:'custom'})
const original=Object.getOwnPropertyDescriptor(globalThis,'crypto')
Object.defineProperty(globalThis,'crypto',{configurable:true,value:{randomUUID(){if(this!==globalThis.crypto)throw new TypeError('Illegal invocation');return '00000000-0000-4000-8000-000000000001'}}})
try{
 const {LedgerForm,LedgerCalculatedAmounts}=await server.ssrLoadModule('/src/pages/LedgerPage.jsx')
 const {default:NewTransaction}=await server.ssrLoadModule('/src/pages/NewTransaction.jsx')
 const {default:Header}=await server.ssrLoadModule('/src/components/Header.jsx')
 const {LanguageContext}=await server.ssrLoadModule('/src/hooks/LanguageContext.js')
 const language={ui:text=>text,lang:'fa',t:text=>text,isRTL:true}
 const render=(child,path='/financial-accounts')=>renderToStaticMarkup(createElement(MemoryRouter,{initialEntries:[path]},createElement(LanguageContext.Provider,{value:language},child)))
 const account={id:1,name:'Test',kind:'KABUL_DEBTOR',profile:{phone:'0700000000'},active:true,balances:[]}
 for(const mode of ['account','agency','document','profile']){
  const html=render(createElement(LedgerForm,{mode,account,accounts:[account],customers:[],agencies:[],options:{profile_fields:{phone:'تماس'}},onClose(){},onSaved(){}}))
  assert.ok(html.includes('<form'),mode)
  if(mode==='document')assert.ok(html.includes('calculated-net'))
 }
 assert.ok(render(createElement(NewTransaction,{modal:true,onClose(){}})).includes('<form'))
 const allocationForm=render(createElement(LedgerForm,{mode:'document',workflow:'BENEFICIARY_PAYOUT',account,accounts:[account],options:{profile_fields:{}},onClose(){},onSaved(){}}))
 assert.ok(allocationForm.includes('id="ledger-amount" readOnly=""'))
 for(const path of ['/financial-accounts','/financial-accounts?kind=KABUL_DEBTOR','/financial-accounts?kind=IRAN_DEBTOR']){
  const html=render(createElement(Header,{...language,languages:[{code:'fa'}],username:'QA',navigationMode:'menubar',theme:'light'}),path)
  const selected=html.match(/<a\b[^>]*aria-current="page"[^>]*>/g)||[]
  assert.equal(selected.length,1,path)
  assert.ok(selected[0].includes(`href="${path}"`),path)
 }
 const calculated=render(createElement(LedgerCalculatedAmounts,{preview:{usd:'100.000',gross:'7000.000',net:'6950.000',destination:'AFN'},projected:[{currency:'AFN',bucket:'ACCOUNT',current:'50000.000',after:'43050.000'}]}))
 for(const expected of ['value="100"','value="7,000"','value="6,950"','value="43,050"'])assert.ok(calculated.includes(expected),expected)
 assert.ok(calculated.includes('readOnly=""'))
 console.log('All financial form modes and Tehran form render with receiver-bound UUIDs; one menu item is selected per financial section; computed monetary fields render read-only.')
}finally{
 if(original)Object.defineProperty(globalThis,'crypto',original)
 await server.close()
}
